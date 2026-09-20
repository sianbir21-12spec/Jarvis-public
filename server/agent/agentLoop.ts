// server/agent/agentLoop.ts
//
// The autonomous computer-use loop: sends the task + screenshots to the
// OmniRoute gateway with `tools` attached, executes whatever tool calls
// come back against desktopControl/browserControl, feeds results back in,
// and repeats until the model calls task_complete, stops requesting tools,
// hits the step limit, or is aborted.
//
// Runs fully autonomously (no per-action confirmation) -- the only manual
// control is the abort signal wired to the Stop button in the UI.
//
// Speed notes:
// - Only the MOST RECENT screenshot is ever sent to the gateway. Earlier
//   screenshot messages are pruned to a short text placeholder right after
//   a newer one is added. Without this, step N resends N-1 full images on
//   every single call -- by step 10 you're re-uploading ~10 screenshots
//   per request, which dominates both latency and cost. History is still
//   kept in full for logging; only what goes to the gateway is pruned.
// - Each gateway call has its own timeout, independent of the overall run.
//   Previously a slow/hung gateway response just looked like the agent
//   silently freezing forever with no feedback.

import { getConfig } from '../runtimeConfig.js';
import { OMNIROUTE_CONFIG } from '../omniroute.js';
import { TOOLS, dispatchTool, isDestructive } from '../tools/toolDefinitions.js';
import type { ScreenshotAnnotation } from '../tools/registry.js';
import { isComputerControlEnabled } from '../state/computerControlState.js';
import { renderMemoryForPrompt } from '../memory/memoryStore.js';
import { logUsageEvent } from '../state/usage.js';

// Lower than before, deliberately: combined with the "batch actions per
// turn" prompt guidance, a tighter budget pushes the model toward fewer,
// more decisive turns instead of many small exploratory ones -- each turn
// is a full gateway round-trip, so cutting turn count is the single
// biggest lever on total wall-clock time. Raise via env var for tasks that
// legitimately need more steps (e.g. long multi-page browser flows).
const MAX_STEPS = Number(process.env.AGENT_MAX_STEPS) || 22;
const STEP_TIMEOUT_MS = 60000;
const KEEP_LAST_N_SCREENSHOTS = 1;
// Lets the agent loop use a different (e.g. faster/cheaper) model than
// regular chat, via OmniRoute's catalog. Falls back to the normal default
// model if unset, so this is a no-op unless explicitly configured.
// Resolved per call, not at module load, so changing the model in Settings
// takes effect without restarting the backend process.
function agentModel(): string {
  return getConfig('AGENT_MODEL') || OMNIROUTE_CONFIG.defaultModel;
}

export type AgentEvent =
  | { type: 'status'; message: string }
  | { type: 'assistant_text'; text: string }
  | { type: 'tool_call'; name: string; args: any; step: number }
  | { type: 'tool_result'; name: string; text: string; screenshot?: string; screenshotWidth?: number; screenshotHeight?: number; annotations?: ScreenshotAnnotation[]; step: number }
  | { type: 'confirm_required'; name: string; args: any; step: number }
  | { type: 'done'; summary: string }
  | { type: 'error'; message: string };

const SYSTEM_PROMPT = `You are JARVIS, an autonomous computer-use agent running on the user's own Windows PC with full permission to act. You can see the screen via screenshots and control the mouse, keyboard, a real persistent terminal, and a real Chrome browser through the provided tools.

Operating rules:
- For anything shell/CLI related, prefer terminal_run over desktop_run_command -- it's a real persistent PowerShell session (cwd, env vars, activated environments all carry over between calls), the same as a human's terminal, not a fresh throwaway process each time.
- Take a screenshot (desktop_screenshot or browser_screenshot) before your first action, and again whenever you need to see the current state -- most action tools no longer return one automatically, so request one explicitly if you're not confident what the screen looks like now.
- Only your most recent screenshot is kept in context -- earlier ones are replaced with a placeholder to keep things fast. If you need to compare against an earlier screen state, take a fresh screenshot rather than assuming you can still see an old one.
- In the browser, ALWAYS try browser_get_interactive_elements + browser_click_selector/browser_type_selector FIRST -- it needs no screenshot and no vision call, so it's much faster than the screenshot+coordinates path. Only fall back to browser_screenshot + coordinates if there's genuinely no usable selector.
- Batch independent actions into a single turn when you can (e.g. click a field AND type into it, or several keypresses in a row) -- each turn is a full round-trip to the model, so fewer, bigger turns finish the task faster than many small ones.
- If something on screen doesn't match your expectation, stop and re-assess with a fresh screenshot rather than repeating the same action.
- You have full autonomy: do not ask the user for confirmation in your own text before acting. Just proceed. (A small set of destructive actions -- deleting/overwriting files, running a destructive terminal command -- pause automatically for the user's approval; that's handled outside your control. If one comes back declined, don't retry it verbatim -- ask what to do instead or pick a different approach.)
- Call task_complete as soon as the task is verifiably done -- don't take extra confirming screenshots once you're confident. This includes simple tasks (e.g. "open the start menu") -- once the action is done, call task_complete immediately rather than continuing to observe.
- If a task is genuinely impossible, ambiguous to a blocking degree, or you get stuck after several attempts, call task_complete and explain why.
- Keep any prose you send back short -- most of your turns should just be tool calls.
- Use memory_remember when you learn a durable fact worth keeping for future sessions (a stated preference, a recurring detail about the user's setup) -- not for one-off details that only matter for this task. Use memory_recall if you need to check what's already known before asking the user something they may have told you before.`;

// Rebuilt per run (not cached) so a memory saved moments ago -- including
// by memory_remember earlier in the same session -- is reflected the next
// time this is called; the block is appended once at session start, which
// is enough for its purpose (background context, not live lookup).
function buildSystemPrompt(): string {
  const memoryBlock = renderMemoryForPrompt();
  return memoryBlock ? `${SYSTEM_PROMPT}\n\n${memoryBlock}` : SYSTEM_PROMPT;
}

interface RunAgentOptions {
  task: string;
  signal: AbortSignal;
  onEvent: (event: AgentEvent) => void;
  // Called when a tool flagged `destructive` in the registry is about to
  // run. Resolves true/false once the user approves or denies (or the
  // session is aborted/disconnected, which the caller should resolve as
  // false rather than leaving this hanging forever).
  onConfirmRequired: (name: string, args: any, step: number) => Promise<boolean>;
}

// Replaces image_url parts in all but the most recent `keepLastN`
// image-bearing messages with a short text placeholder, IN PLACE. Keeps the
// gateway payload (and the retained in-memory history) from growing with
// every step's full screenshot.
function pruneOldScreenshots(messages: any[], keepLastN: number) {
  const imageMessageIndices: number[] = [];
  messages.forEach((m, i) => {
    if (Array.isArray(m.content) && m.content.some((p: any) => p.type === 'image_url')) {
      imageMessageIndices.push(i);
    }
  });
  const toStrip = imageMessageIndices.slice(0, Math.max(0, imageMessageIndices.length - keepLastN));
  for (const i of toStrip) {
    messages[i] = {
      ...messages[i],
      content: messages[i].content.map((p: any) =>
        p.type === 'image_url'
          ? { type: 'text', text: '[earlier screenshot omitted to save time -- take a fresh one if you need to see this moment again]' }
          : p
      )
    };
  }
}

async function callGateway(messages: any[], outerSignal: AbortSignal): Promise<any> {
  const endpoint = `${OMNIROUTE_CONFIG.baseUrl}/v1/chat/completions`;
  const linkedController = new AbortController();
  const onOuterAbort = () => linkedController.abort();
  outerSignal.addEventListener('abort', onOuterAbort);
  const timeoutHandle = setTimeout(() => linkedController.abort(), STEP_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      signal: linkedController.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OMNIROUTE_CONFIG.apiKey}`
      },
      body: JSON.stringify({
        model: agentModel(),
        messages,
        tools: TOOLS,
        tool_choice: 'auto',
        temperature: 0.2,
        max_tokens: 1024, // agent turns should be mostly tool calls, not prose -- caps how long a slow/rambling turn can run
        stream: false
      })
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText);
      throw new Error(`Gateway error ${response.status}: ${errText}`);
    }
    return await response.json();
  } catch (err: any) {
    if (outerSignal.aborted) {
      throw err; // real user-initiated stop -- let the caller's own abort handling take over
    }
    if (linkedController.signal.aborted) {
      throw new Error(`Gateway did not respond within ${STEP_TIMEOUT_MS / 1000}s -- step timed out.`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutHandle);
    outerSignal.removeEventListener('abort', onOuterAbort);
  }
}

/**
 * Opens (and, thanks to HTTP keep-alive, keeps warm) a connection to the
 * OmniRoute gateway ahead of the first real request. TCP + TLS handshake
 * to a fresh host is typically 100-300ms; doing that while the user is
 * still typing/thinking, rather than on the first real step, is pure
 * saved latency with no downside. Uses the cheapest possible request
 * (1 output token, no tools) purely to establish the connection.
 */
export async function warmGatewayConnection(): Promise<void> {
  const endpoint = `${OMNIROUTE_CONFIG.baseUrl}/v1/chat/completions`;
  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OMNIROUTE_CONFIG.apiKey}`
      },
      body: JSON.stringify({
        model: agentModel(),
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        stream: false
      })
    });
  } catch {
    // Best-effort only -- if the gateway is unreachable, the real request
    // will surface that error clearly anyway. Nothing to do here.
  }
}

export async function runAgent({ task, signal, onEvent, onConfirmRequired }: RunAgentOptions): Promise<void> {
  const runStart = Date.now();
  // Wraps onEvent for the loop's terminal events ('done'/'error') so every
  // exit path logs exactly one agent_run usage event, regardless of which
  // of the several return points below it took.
  const finish = (event: AgentEvent) => {
    logUsageEvent({ type: 'agent_run', latencyMs: Date.now() - runStart });
    onEvent(event);
  };

  const messages: any[] = [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: `Task: ${task}\n\nStart by taking a screenshot to see the current screen.` }
  ];

  onEvent({ type: 'status', message: 'Starting agent…' });

  for (let step = 0; step < MAX_STEPS; step++) {
    if (signal.aborted) {
      onEvent({ type: 'status', message: 'Stopped by user.' });
      return;
    }

    if (!isComputerControlEnabled()) {
      onEvent({ type: 'status', message: 'Computer control was disabled mid-task. Stopping.' });
      return;
    }

    let data: any;
    try {
      data = await callGateway(messages, signal);
    } catch (err: any) {
      if (signal.aborted) {
        onEvent({ type: 'status', message: 'Stopped by user.' });
        return;
      }
      finish({ type: 'error', message: err.message || 'Gateway request failed.' });
      return;
    }

    const choice = data.choices?.[0];
    const message = choice?.message;
    if (!message) {
      finish({ type: 'error', message: 'Gateway returned no message.' });
      return;
    }

    const toolCalls = message.tool_calls || [];

    if (toolCalls.length === 0) {
      // Model responded with plain text and no tool calls -- treat as final.
      const text = message.content || '';
      if (text) onEvent({ type: 'assistant_text', text });
      finish({ type: 'done', summary: text || 'Agent finished.' });
      return;
    }

    // Record the assistant turn (with its tool_calls) before appending results.
    messages.push({ role: 'assistant', content: message.content || null, tool_calls: toolCalls });

    for (const call of toolCalls) {
      if (signal.aborted) {
        onEvent({ type: 'status', message: 'Stopped by user.' });
        return;
      }
      if (!isComputerControlEnabled()) {
        onEvent({ type: 'status', message: 'Computer control was disabled mid-task. Stopping.' });
        return;
      }

      let args: any = {};
      try {
        args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        args = {};
      }
      const name = call.function?.name || 'unknown';

      onEvent({ type: 'tool_call', name, args, step });
      logUsageEvent({ type: 'tool_call', tool: name });

      let result;
      try {
        if (isDestructive(name, args)) {
          onEvent({ type: 'confirm_required', name, args, step });
          const approved = await onConfirmRequired(name, args, step);

          if (signal.aborted) {
            onEvent({ type: 'status', message: 'Stopped by user.' });
            return;
          }

          result = approved
            ? await dispatchTool(name, args)
            : {
                text: `User declined to run "${name}". Do not retry it verbatim -- ask what to do instead or pick a different approach.`
              };
        } else {
          result = await dispatchTool(name, args);
        }
      } catch (err: any) {
        result = { text: `Error running ${name}: ${err.message || err}` };
      }

      onEvent({
        type: 'tool_result',
        name,
        text: result.text,
        screenshot: result.screenshot?.base64,
        screenshotWidth: result.screenshot?.width,
        screenshotHeight: result.screenshot?.height,
        annotations: result.annotations,
        step
      });

      // Tool result goes back as a 'tool' message (text only -- broad gateway compatibility).
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: result.text
      });

      // If there's a screenshot, follow up with a user message carrying the
      // image so vision-capable models can actually see the outcome, then
      // immediately prune any older screenshots out of the context.
      if (result.screenshot) {
        messages.push({
          role: 'user',
          content: [
            { type: 'text', text: `Screenshot after "${name}":` },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${result.screenshot}` } }
          ]
        });
        pruneOldScreenshots(messages, KEEP_LAST_N_SCREENSHOTS);
      }

      if (result.isTaskComplete) {
        finish({ type: 'done', summary: result.text });
        return;
      }
    }
  }

  finish({ type: 'error', message: `Stopped after reaching the ${MAX_STEPS}-step safety limit.` });
}

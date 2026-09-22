// server/tools/terminal.tools.ts
// Registers terminal_* tools. Implementation lives in terminalControl.ts.

import { spawn } from 'child_process';
import { registerTools } from './registry.js';
import * as terminal from './terminalControl.js';
import { BLOCKED_PATTERNS, ASK_PATTERNS } from './desktopControl.js';

// The agent gets its own persistent terminal session (separate from
// whatever the user has open in the UI), created lazily on first use so a
// task that never touches the shell doesn't spawn one for nothing.
let agentTerminalSessionId: string | null = null;
function getAgentTerminalSession(): string {
  if (!agentTerminalSessionId) {
    agentTerminalSessionId = terminal.createSession().id;
  }
  return agentTerminalSessionId;
}

function commandTier(args: any): 'safe' | 'ask' | 'block' {
  const command = args?.command || '';
  if (BLOCKED_PATTERNS.some((p) => p.test(command))) return 'block';
  if (ASK_PATTERNS.some((p) => p.test(command))) return 'ask';
  return 'safe';
}

registerTools([
  {
    name: 'terminal_run',
    description:
      "Run a command in a persistent PowerShell terminal (like a real terminal session -- working directory and environment variables carry over between calls, unlike desktop_run_command which starts fresh each time). Use this for anything multi-step: cd into a folder then run something in it, activate an environment then use it, start and later check on a long process, etc.",
    parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
    // BLOCK-tier commands never reach this handler at all (registry.ts's
    // dispatch() refuses them). ASK-tier commands only reach here after
    // the user approves via the confirmation UI -- so unlike the previous
    // version, an approved command actually runs instead of being refused
    // a second time.
    tier: commandTier,
    handler: async (args) => {
      const sessionId = getAgentTerminalSession();
      try {
        const result = await terminal.runCommand(sessionId, args.command);
        return { text: `exit code: ${result.exitCode}\n${result.output}` };
      } catch (err: any) {
        return { text: `Terminal error: ${err.message || err}` };
      }
    }
  },
  {
    name: 'terminal_reset',
    description: "Kill and restart the agent's terminal session, e.g. if a previous command hung or you want a clean shell.",
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      if (agentTerminalSessionId) {
        terminal.killSession(agentTerminalSessionId);
        agentTerminalSessionId = null;
      }
      getAgentTerminalSession();
      return { text: 'Terminal session reset.' };
    }
  },
  {
    name: 'terminal_run_script',
    description:
      'Run a one-shot script in bash, python, or node (not PowerShell -- use terminal_run for that) and capture stdout, stderr, exit code, and duration. Each call is a fresh process with no memory of previous calls -- use for scripts/one-off code, not multi-step shell sessions.',
    parameters: {
      type: 'object',
      properties: {
        language: { type: 'string', enum: ['bash', 'python', 'node'] },
        code: { type: 'string' },
        timeoutMs: { type: 'number', description: 'Defaults to 30000.' }
      },
      required: ['language', 'code']
    },
    // Same risk category as terminal_run's underlying shell access -- code
    // is arbitrary and runs with the user's full permissions. Only
    // BLOCK-tier patterns (matched against the code body) are refused
    // outright; everything else pauses for approval since, unlike a named
    // shell command, there's no simple safe/unsafe heuristic for
    // arbitrary script bodies.
    tier: (args: any) => {
      const code = args?.code || '';
      if (BLOCKED_PATTERNS.some((p) => p.test(code))) return 'block';
      return 'ask';
    },
    handler: async (args) => {
      const { language, code, timeoutMs = 30000 } = args;
      const interpreter =
        language === 'python' ? (process.platform === 'win32' ? 'python' : 'python3') :
        language === 'node' ? 'node' :
        // bash: on Windows this requires WSL or Git Bash on PATH -- if
        // neither is present, spawn will fail with ENOENT, which the
        // catch below reports plainly rather than pretending it ran.
        'bash';
      const scriptArgs = language === 'bash' ? ['-c', code] : language === 'python' ? ['-c', code] : ['-e', code];

      const startedAt = Date.now();
      return await new Promise((resolve) => {
        let child: ReturnType<typeof spawn>;
        try {
          child = spawn(interpreter, scriptArgs, { shell: false });
        } catch (err: any) {
          resolve({ text: `Failed to launch ${language} interpreter "${interpreter}": ${err.message || err}` });
          return;
        }
        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => {
          child.kill();
          resolve({ text: `Timed out after ${timeoutMs}ms running ${language} script (process killed).` });
        }, timeoutMs);

        child.stdout?.on('data', (d) => (stdout += d.toString()));
        child.stderr?.on('data', (d) => (stderr += d.toString()));
        child.on('error', (err: any) => {
          clearTimeout(timer);
          resolve({ text: `Failed to run ${language} interpreter "${interpreter}": ${err.message || err} (is it installed and on PATH?)` });
        });
        child.on('close', (exitCode) => {
          clearTimeout(timer);
          const durationMs = Date.now() - startedAt;
          resolve({
            text: `exit code: ${exitCode}\nduration: ${durationMs}ms\nstdout:\n${stdout || '(empty)'}\nstderr:\n${stderr || '(empty)'}`
          });
        });
      });
    }
  }
]);

// server/tools/toolDefinitions.ts
//
// Declares every tool JARVIS's agent loop can call, in OpenAI-compatible
// "function calling" format (the format OmniRoute's /v1/chat/completions
// gateway expects in the `tools` array). Also provides a single dispatch()
// entry point that executes a tool call and returns a JSON-serializable
// result, plus an optional screenshot to show the model what happened.

import * as desktop from './desktopControl.js';
import * as browser from './browserControl.js';
import * as terminal from './terminalControl.js';
import { DESTRUCTIVE_PATTERNS } from './desktopControl.js';

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

export const TOOLS: any[] = [
  {
    type: 'function',
    function: {
      name: 'desktop_screenshot',
      description: 'Capture the current desktop screen so you can see what is on it before deciding where to click or type.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'desktop_click',
      description: 'Move the mouse to pixel coordinates (from a screenshot) and click.',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
          button: { type: 'string', enum: ['left', 'right', 'middle'], default: 'left' },
          double: { type: 'boolean', default: false }
        },
        required: ['x', 'y']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'desktop_move_mouse',
      description: 'Move the mouse to pixel coordinates without clicking.',
      parameters: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'desktop_drag',
      description: 'Press the left mouse button at one point, drag to another, and release (e.g. to move a window or select a range).',
      parameters: {
        type: 'object',
        properties: { fromX: { type: 'number' }, fromY: { type: 'number' }, toX: { type: 'number' }, toY: { type: 'number' } },
        required: ['fromX', 'fromY', 'toX', 'toY']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'desktop_scroll',
      description: 'Scroll the focused window/element. Positive deltaY scrolls down, negative scrolls up.',
      parameters: { type: 'object', properties: { deltaX: { type: 'number', default: 0 }, deltaY: { type: 'number', default: 0 } } }
    }
  },
  {
    type: 'function',
    function: {
      name: 'desktop_type',
      description: 'Type text at the current cursor/focus location, as if typed on the keyboard.',
      parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'desktop_key',
      description: 'Press a single named key (e.g. "enter", "esc", "tab", "backspace", "f5", "up").',
      parameters: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'desktop_hotkey',
      description: 'Press a key combination together, e.g. ["control","c"] for copy, ["alt","tab"] to switch windows.',
      parameters: { type: 'object', properties: { keys: { type: 'array', items: { type: 'string' } } }, required: ['keys'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'desktop_wait',
      description: 'Pause for a short time (milliseconds) to let something load or animate before continuing.',
      parameters: { type: 'object', properties: { ms: { type: 'number' } }, required: ['ms'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'desktop_list_windows',
      description: 'List currently open application windows with their titles, to find what is running.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'desktop_focus_window',
      description: 'Bring a window to the foreground by matching a substring of its title.',
      parameters: { type: 'object', properties: { titleSubstring: { type: 'string' } }, required: ['titleSubstring'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'desktop_launch_app',
      description: 'Launch an application, open a file, or open a URL, the same way Windows Run/Explorer would (e.g. "notepad", "calc", "C:\\\\path\\\\file.docx", "https://example.com").',
      parameters: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'desktop_run_command',
      description: 'Run a PowerShell command and return its output. Use for things easier done via shell than UI (file operations, system info, etc).',
      parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'terminal_run',
      description: 'Run a command in a persistent PowerShell terminal (like a real terminal session -- working directory and environment variables carry over between calls, unlike desktop_run_command which starts fresh each time). Use this for anything multi-step: cd into a folder then run something in it, activate an environment then use it, start and later check on a long process, etc.',
      parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'terminal_reset',
      description: 'Kill and restart the agent\'s terminal session, e.g. if a previous command hung or you want a clean shell.',
      parameters: { type: 'object', properties: {} }
    }
  },
  // --- Browser tools ---
  {
    type: 'function',
    function: {
      name: 'browser_navigate',
      description: 'Open a URL in the automated Chrome browser window (launches it if not already open).',
      parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_screenshot',
      description: 'Capture a screenshot of the current browser tab to see the page.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_get_page_text',
      description: 'Get the visible text content of the current page (faster/more reliable than reading a screenshot for text-heavy pages).',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_get_interactive_elements',
      description: 'List clickable/typeable elements on the page (links, buttons, inputs) with CSS selectors you can use with browser_click_selector / browser_type_selector. STRONGLY prefer this whole selector-based path over screenshots + coordinate clicking for anything in the browser -- it needs zero screenshots and zero vision calls, so it is dramatically faster as well as more reliable. Only fall back to browser_screenshot + coordinates when an element genuinely has no usable selector (e.g. inside a canvas).',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_click_selector',
      description: 'Click an element by CSS selector (from browser_get_interactive_elements).',
      parameters: { type: 'object', properties: { selector: { type: 'string' } }, required: ['selector'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_type_selector',
      description: 'Click an input/textarea by CSS selector, clear it, and type text into it.',
      parameters: { type: 'object', properties: { selector: { type: 'string' }, text: { type: 'string' } }, required: ['selector', 'text'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_click_coordinates',
      description: 'Click at pixel coordinates within the browser page. SLOW PATH -- requires a screenshot first. Only use this when browser_get_interactive_elements genuinely has no usable selector for the target (e.g. canvas-drawn UI); never use it as a shortcut to skip calling browser_get_interactive_elements first.',
      parameters: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_type_at_cursor',
      description: 'Type text at whatever element currently has focus in the browser.',
      parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_press_key',
      description: 'Press a key in the browser (e.g. "Enter", "Tab", "Escape").',
      parameters: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_scroll',
      description: 'Scroll the page. Positive deltaY scrolls down.',
      parameters: { type: 'object', properties: { deltaX: { type: 'number', default: 0 }, deltaY: { type: 'number', default: 0 } } }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_go_back',
      description: 'Navigate back in browser history.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_reload',
      description: 'Reload the current page.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_evaluate',
      description: 'Run a JavaScript expression in the page context and return the result. Use for reading data out of the page (not for automating clicks/typing).',
      parameters: { type: 'object', properties: { script: { type: 'string' } }, required: ['script'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_list_tabs',
      description: 'List open browser tabs.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_new_tab',
      description: 'Open a new browser tab, optionally navigating it to a URL.',
      parameters: { type: 'object', properties: { url: { type: 'string' } } }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_switch_tab',
      description: 'Switch the active tab by index (from browser_list_tabs).',
      parameters: { type: 'object', properties: { index: { type: 'number' } }, required: ['index'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_close_tab',
      description: 'Close a tab by index.',
      parameters: { type: 'object', properties: { index: { type: 'number' } }, required: ['index'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'task_complete',
      description: 'Call this when the requested task is finished (or cannot be completed) to end the session with a summary for the user.',
      parameters: {
        type: 'object',
        properties: { summary: { type: 'string', description: 'Short summary of what was done or why it could not be completed.' } },
        required: ['summary']
      }
    }
  }
];

export interface ToolCallResult {
  text: string;
  screenshot?: { base64: string; width: number; height: number };
  isTaskComplete?: boolean;
}

export async function dispatchTool(name: string, args: any): Promise<ToolCallResult> {
  switch (name) {
    case 'desktop_screenshot': {
      const shot = await desktop.captureScreen();
      return { text: `Screenshot captured (${shot.width}x${shot.height}).`, screenshot: shot };
    }
    case 'desktop_click':
      await desktop.click(args.x, args.y, args.button || 'left', !!args.double);
      return { text: `Clicked at (${args.x}, ${args.y}).`, screenshot: await desktop.captureScreen() };
    case 'desktop_move_mouse':
      await desktop.moveMouse(args.x, args.y);
      return { text: `Moved mouse to (${args.x}, ${args.y}).` };
    case 'desktop_drag':
      await desktop.drag(args.fromX, args.fromY, args.toX, args.toY);
      return { text: `Dragged from (${args.fromX},${args.fromY}) to (${args.toX},${args.toY}).`, screenshot: await desktop.captureScreen() };
    case 'desktop_scroll':
      await desktop.scroll(args.deltaX || 0, args.deltaY || 0);
      return { text: 'Scrolled.' };
    case 'desktop_type':
      await desktop.typeText(args.text);
      return { text: `Typed: ${args.text.slice(0, 80)}` };
    case 'desktop_key':
      await desktop.pressKey(args.key);
      return { text: `Pressed key: ${args.key}` };
    case 'desktop_hotkey':
      await desktop.hotkey(args.keys);
      return { text: `Pressed hotkey: ${args.keys.join('+')}` };
    case 'desktop_wait':
      await desktop.wait(args.ms);
      return { text: `Waited ${args.ms}ms.` };
    case 'desktop_list_windows':
      return { text: JSON.stringify(await desktop.listWindows()) };
    case 'desktop_focus_window': {
      const ok = await desktop.focusWindow(args.titleSubstring);
      return { text: ok ? `Focused window matching "${args.titleSubstring}".` : `No window found matching "${args.titleSubstring}".` };
    }
    case 'desktop_launch_app':
      await desktop.launchApp(args.target);
      await desktop.wait(1200);
      return { text: `Launched: ${args.target}`, screenshot: await desktop.captureScreen() };
    case 'desktop_run_command': {
      const result = await desktop.runShellCommand(args.command);
      return { text: `stdout: ${result.stdout}\nstderr: ${result.stderr}` };
    }
    case 'terminal_run': {
      if (DESTRUCTIVE_PATTERNS.some((p) => p.test(args.command))) {
        return { text: `Refused to run this command -- it matches a pattern for destructive/irreversible operations (disk format, mass delete, shutdown, or registry deletion). If this was genuinely intended, run it manually instead.` };
      }
      const sessionId = getAgentTerminalSession();
      try {
        const result = await terminal.runCommand(sessionId, args.command);
        return { text: `exit code: ${result.exitCode}\n${result.output}` };
      } catch (err: any) {
        return { text: `Terminal error: ${err.message || err}` };
      }
    }
    case 'terminal_reset': {
      if (agentTerminalSessionId) {
        terminal.killSession(agentTerminalSessionId);
        agentTerminalSessionId = null;
      }
      getAgentTerminalSession();
      return { text: 'Terminal session reset.' };
    }

    case 'browser_navigate': {
      const result = await browser.navigate(args.url);
      return { text: `Navigated to ${result.url} ("${result.title}").`, screenshot: await browser.screenshot() };
    }
    case 'browser_screenshot':
      return { text: 'Browser screenshot captured.', screenshot: await browser.screenshot() };
    case 'browser_get_page_text':
      return { text: await browser.getPageText() };
    case 'browser_get_interactive_elements':
      return { text: JSON.stringify(await browser.getInteractiveElements()) };
    case 'browser_click_selector':
      await browser.clickSelector(args.selector);
      return { text: `Clicked selector "${args.selector}".` };
    case 'browser_type_selector':
      await browser.typeIntoSelector(args.selector, args.text);
      return { text: `Typed into "${args.selector}".` };
    case 'browser_click_coordinates':
      await browser.clickCoordinates(args.x, args.y);
      return { text: `Clicked browser coordinates (${args.x}, ${args.y}).`, screenshot: await browser.screenshot() };
    case 'browser_type_at_cursor':
      await browser.typeAtCursor(args.text);
      return { text: `Typed: ${args.text.slice(0, 80)}` };
    case 'browser_press_key':
      await browser.pressKey(args.key);
      return { text: `Pressed key: ${args.key}` };
    case 'browser_scroll':
      await browser.scroll(args.deltaX || 0, args.deltaY || 0);
      return { text: 'Scrolled page.' };
    case 'browser_go_back':
      await browser.goBack();
      return { text: 'Navigated back.', screenshot: await browser.screenshot() };
    case 'browser_reload':
      await browser.reload();
      return { text: 'Reloaded page.', screenshot: await browser.screenshot() };
    case 'browser_evaluate': {
      const result = await browser.evaluateScript(args.script);
      return { text: JSON.stringify(result ?? null).slice(0, 4000) };
    }
    case 'browser_list_tabs':
      return { text: JSON.stringify(await browser.listTabs()) };
    case 'browser_new_tab': {
      const result = await browser.newTab(args.url);
      return { text: `Opened new tab at index ${result.index}.`, screenshot: await browser.screenshot() };
    }
    case 'browser_switch_tab':
      await browser.switchTab(args.index);
      return { text: `Switched to tab ${args.index}.`, screenshot: await browser.screenshot() };
    case 'browser_close_tab':
      await browser.closeTab(args.index);
      return { text: `Closed tab ${args.index}.` };

    case 'task_complete':
      return { text: args.summary || 'Task complete.', isTaskComplete: true };

    default:
      return { text: `Unknown tool: ${name}` };
  }
}

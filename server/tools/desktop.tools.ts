// server/tools/desktop.tools.ts
// Registers desktop_* tools. Implementation lives in desktopControl.ts --
// this file only declares schemas and wires each schema to its handler.

import { registerTools } from './registry.js';
import * as desktop from './desktopControl.js';

registerTools([
  {
    name: 'desktop_screenshot',
    description: 'Capture the current desktop screen so you can see what is on it before deciding where to click or type.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      const shot = await desktop.captureScreen();
      return { text: `Screenshot captured (${shot.width}x${shot.height}).`, screenshot: shot };
    }
  },
  {
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
    },
    handler: async (args) => {
      await desktop.click(args.x, args.y, args.button || 'left', !!args.double);
      return {
        text: `Clicked at (${args.x}, ${args.y}).`,
        screenshot: await desktop.captureScreen(),
        annotations: [{ x: args.x, y: args.y, label: `${args.double ? 'double-' : ''}${args.button || 'left'} click` }]
      };
    }
  },
  {
    name: 'desktop_move_mouse',
    description: 'Move the mouse to pixel coordinates without clicking.',
    parameters: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] },
    handler: async (args) => {
      await desktop.moveMouse(args.x, args.y);
      return { text: `Moved mouse to (${args.x}, ${args.y}).` };
    }
  },
  {
    name: 'desktop_drag',
    description: 'Press the left mouse button at one point, drag to another, and release (e.g. to move a window or select a range).',
    parameters: {
      type: 'object',
      properties: { fromX: { type: 'number' }, fromY: { type: 'number' }, toX: { type: 'number' }, toY: { type: 'number' } },
      required: ['fromX', 'fromY', 'toX', 'toY']
    },
    handler: async (args) => {
      await desktop.drag(args.fromX, args.fromY, args.toX, args.toY);
      return {
        text: `Dragged from (${args.fromX},${args.fromY}) to (${args.toX},${args.toY}).`,
        screenshot: await desktop.captureScreen(),
        annotations: [
          { x: args.fromX, y: args.fromY, label: 'drag start' },
          { x: args.toX, y: args.toY, label: 'drag end' }
        ]
      };
    }
  },
  {
    name: 'desktop_scroll',
    description: 'Scroll the focused window/element. Positive deltaY scrolls down, negative scrolls up.',
    parameters: { type: 'object', properties: { deltaX: { type: 'number', default: 0 }, deltaY: { type: 'number', default: 0 } } },
    handler: async (args) => {
      await desktop.scroll(args.deltaX || 0, args.deltaY || 0);
      return { text: 'Scrolled.' };
    }
  },
  {
    name: 'desktop_type',
    description: 'Type text at the current cursor/focus location, as if typed on the keyboard.',
    parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    handler: async (args) => {
      await desktop.typeText(args.text);
      return { text: `Typed: ${args.text.slice(0, 80)}` };
    }
  },
  {
    name: 'desktop_key',
    description: 'Press a single named key (e.g. "enter", "esc", "tab", "backspace", "f5", "up").',
    parameters: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] },
    handler: async (args) => {
      await desktop.pressKey(args.key);
      return { text: `Pressed key: ${args.key}` };
    }
  },
  {
    name: 'desktop_hotkey',
    description: 'Press a key combination together, e.g. ["control","c"] for copy, ["alt","tab"] to switch windows.',
    parameters: { type: 'object', properties: { keys: { type: 'array', items: { type: 'string' } } }, required: ['keys'] },
    handler: async (args) => {
      await desktop.hotkey(args.keys);
      return { text: `Pressed hotkey: ${args.keys.join('+')}` };
    }
  },
  {
    name: 'desktop_wait',
    description: 'Pause for a short time (milliseconds) to let something load or animate before continuing.',
    parameters: { type: 'object', properties: { ms: { type: 'number' } }, required: ['ms'] },
    handler: async (args) => {
      await desktop.wait(args.ms);
      return { text: `Waited ${args.ms}ms.` };
    }
  },
  {
    name: 'desktop_list_windows',
    description: 'List currently open application windows with their titles, to find what is running.',
    parameters: { type: 'object', properties: {} },
    handler: async () => ({ text: JSON.stringify(await desktop.listWindows()) })
  },
  {
    name: 'desktop_focus_window',
    description: 'Bring a window to the foreground by matching a substring of its title.',
    parameters: { type: 'object', properties: { titleSubstring: { type: 'string' } }, required: ['titleSubstring'] },
    handler: async (args) => {
      const ok = await desktop.focusWindow(args.titleSubstring);
      return { text: ok ? `Focused window matching "${args.titleSubstring}".` : `No window found matching "${args.titleSubstring}".` };
    }
  },
  {
    name: 'desktop_launch_app',
    description:
      'Launch an application, open a file, or open a URL, the same way Windows Run/Explorer would (e.g. "notepad", "calc", "C:\\\\path\\\\file.docx", "https://example.com").',
    parameters: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] },
    handler: async (args) => {
      await desktop.launchApp(args.target);
      await desktop.wait(1200);
      return { text: `Launched: ${args.target}`, screenshot: await desktop.captureScreen() };
    }
  },
  {
    name: 'desktop_run_command',
    description: 'Run a PowerShell command and return its output. Use for things easier done via shell than UI (file operations, system info, etc).',
    parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
    // desktopControl.runShellCommand already refuses DESTRUCTIVE_PATTERNS
    // internally (disk format, mass delete, shutdown, registry deletion);
    // this flag is what tells the *confirmation UI* to pause on the rest --
    // any shell command, not just the hard-blocked ones -- since arbitrary
    // PowerShell can still delete/overwrite files even without matching
    // one of those specific catastrophic patterns.
    destructive: true,
    handler: async (args) => {
      const result = await desktop.runShellCommand(args.command);
      return { text: `stdout: ${result.stdout}\nstderr: ${result.stderr}` };
    }
  }
]);

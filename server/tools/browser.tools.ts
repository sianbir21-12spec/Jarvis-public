// server/tools/browser.tools.ts
// Registers browser_* tools. Implementation lives in browserControl.ts.

import { registerTools } from './registry.js';
import * as browser from './browserControl.js';

registerTools([
  {
    name: 'browser_navigate',
    description: 'Open a URL in the automated Chrome browser window (launches it if not already open).',
    parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    handler: async (args) => {
      const result = await browser.navigate(args.url);
      return { text: `Navigated to ${result.url} ("${result.title}").`, screenshot: await browser.screenshot() };
    }
  },
  {
    name: 'browser_screenshot',
    description: 'Capture a screenshot of the current browser tab to see the page.',
    parameters: { type: 'object', properties: {} },
    handler: async () => ({ text: 'Browser screenshot captured.', screenshot: await browser.screenshot() })
  },
  {
    name: 'browser_get_page_text',
    description: 'Get the visible text content of the current page (faster/more reliable than reading a screenshot for text-heavy pages).',
    parameters: { type: 'object', properties: {} },
    handler: async () => ({ text: await browser.getPageText() })
  },
  {
    name: 'browser_get_interactive_elements',
    description:
      'List clickable/typeable elements on the page (links, buttons, inputs) with CSS selectors you can use with browser_click_selector / browser_type_selector. STRONGLY prefer this whole selector-based path over screenshots + coordinate clicking for anything in the browser -- it needs zero screenshots and zero vision calls, so it is dramatically faster as well as more reliable. Only fall back to browser_screenshot + coordinates when an element genuinely has no usable selector (e.g. inside a canvas).',
    parameters: { type: 'object', properties: {} },
    handler: async () => ({ text: JSON.stringify(await browser.getInteractiveElements()) })
  },
  {
    name: 'browser_click_selector',
    description: 'Click an element by CSS selector (from browser_get_interactive_elements).',
    parameters: { type: 'object', properties: { selector: { type: 'string' } }, required: ['selector'] },
    handler: async (args) => {
      // Deliberately screenshot-free, same as before -- this tool's whole
      // point is avoiding a screenshot+vision round-trip (see the "STRONGLY
      // prefer" guidance above), so it's not annotated even though
      // clickSelector() now knows the element's bounding box.
      await browser.clickSelector(args.selector);
      return { text: `Clicked selector "${args.selector}".` };
    }
  },
  {
    name: 'browser_type_selector',
    description: 'Click an input/textarea by CSS selector, clear it, and type text into it.',
    parameters: { type: 'object', properties: { selector: { type: 'string' }, text: { type: 'string' } }, required: ['selector', 'text'] },
    handler: async (args) => {
      await browser.typeIntoSelector(args.selector, args.text);
      return { text: `Typed into "${args.selector}".` };
    }
  },
  {
    name: 'browser_click_coordinates',
    description:
      'Click at pixel coordinates within the browser page. SLOW PATH -- requires a screenshot first. Only use this when browser_get_interactive_elements genuinely has no usable selector for the target (e.g. canvas-drawn UI); never use it as a shortcut to skip calling browser_get_interactive_elements first.',
    parameters: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] },
    handler: async (args) => {
      await browser.clickCoordinates(args.x, args.y);
      return {
        text: `Clicked browser coordinates (${args.x}, ${args.y}).`,
        screenshot: await browser.screenshot(),
        annotations: [{ x: args.x, y: args.y, label: 'click' }]
      };
    }
  },
  {
    name: 'browser_type_at_cursor',
    description: 'Type text at whatever element currently has focus in the browser.',
    parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    handler: async (args) => {
      await browser.typeAtCursor(args.text);
      return { text: `Typed: ${args.text.slice(0, 80)}` };
    }
  },
  {
    name: 'browser_press_key',
    description: 'Press a key in the browser (e.g. "Enter", "Tab", "Escape").',
    parameters: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] },
    handler: async (args) => {
      await browser.pressKey(args.key);
      return { text: `Pressed key: ${args.key}` };
    }
  },
  {
    name: 'browser_scroll',
    description: 'Scroll the page. Positive deltaY scrolls down.',
    parameters: { type: 'object', properties: { deltaX: { type: 'number', default: 0 }, deltaY: { type: 'number', default: 0 } } },
    handler: async (args) => {
      await browser.scroll(args.deltaX || 0, args.deltaY || 0);
      return { text: 'Scrolled page.' };
    }
  },
  {
    name: 'browser_go_back',
    description: 'Navigate back in browser history.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      await browser.goBack();
      return { text: 'Navigated back.', screenshot: await browser.screenshot() };
    }
  },
  {
    name: 'browser_reload',
    description: 'Reload the current page.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      await browser.reload();
      return { text: 'Reloaded page.', screenshot: await browser.screenshot() };
    }
  },
  {
    name: 'browser_evaluate',
    description: 'Run a JavaScript expression in the page context and return the result. Use for reading data out of the page (not for automating clicks/typing).',
    parameters: { type: 'object', properties: { script: { type: 'string' } }, required: ['script'] },
    handler: async (args) => {
      const result = await browser.evaluateScript(args.script);
      return { text: JSON.stringify(result ?? null).slice(0, 4000) };
    }
  },
  {
    name: 'browser_list_tabs',
    description: 'List open browser tabs.',
    parameters: { type: 'object', properties: {} },
    handler: async () => ({ text: JSON.stringify(await browser.listTabs()) })
  },
  {
    name: 'browser_new_tab',
    description: 'Open a new browser tab, optionally navigating it to a URL.',
    parameters: { type: 'object', properties: { url: { type: 'string' } } },
    handler: async (args) => {
      const result = await browser.newTab(args.url);
      return { text: `Opened new tab at index ${result.index}.`, screenshot: await browser.screenshot() };
    }
  },
  {
    name: 'browser_switch_tab',
    description: 'Switch the active tab by index (from browser_list_tabs).',
    parameters: { type: 'object', properties: { index: { type: 'number' } }, required: ['index'] },
    handler: async (args) => {
      await browser.switchTab(args.index);
      return { text: `Switched to tab ${args.index}.`, screenshot: await browser.screenshot() };
    }
  },
  {
    name: 'browser_close_tab',
    description: 'Close a tab by index.',
    parameters: { type: 'object', properties: { index: { type: 'number' } }, required: ['index'] },
    handler: async (args) => {
      await browser.closeTab(args.index);
      return { text: `Closed tab ${args.index}.` };
    }
  },
  {
    name: 'browser_select_option',
    description: 'Select an option in a <select> dropdown by its value attribute, using a DOM selector for the <select> element (get one from browser_get_interactive_elements).',
    parameters: {
      type: 'object',
      properties: { selector: { type: 'string' }, value: { type: 'string' } },
      required: ['selector', 'value']
    },
    handler: async (args) => {
      await browser.selectOption(args.selector, args.value);
      return { text: `Selected "${args.value}" in ${args.selector}.` };
    }
  },
  {
    name: 'browser_wait_for',
    description: 'Wait until a DOM selector appears OR, if that is not a valid/matching selector, until visible text matching the string appears on the page. Use this instead of a fixed desktop_wait delay whenever you are waiting on something to load (navigation, an async render, a modal).',
    parameters: {
      type: 'object',
      properties: {
        selectorOrText: { type: 'string' },
        timeoutMs: { type: 'number', description: 'Defaults to 15000.' }
      },
      required: ['selectorOrText']
    },
    handler: async (args) => {
      try {
        const result = await browser.waitFor(args.selectorOrText, args.timeoutMs);
        return { text: `Matched (${result.matched}): "${args.selectorOrText}"` };
      } catch (err: any) {
        return { text: `Timed out waiting for "${args.selectorOrText}": ${err.message || err}` };
      }
    }
  },
  {
    name: 'browser_download',
    description: 'Click an element that triggers a file download and wait for it to finish saving to the Downloads folder. Returns the saved file path.',
    parameters: {
      type: 'object',
      properties: {
        triggerSelector: { type: 'string', description: 'DOM selector of the element to click (e.g. a download link/button).' },
        timeoutMs: { type: 'number', description: 'Defaults to 30000.' }
      },
      required: ['triggerSelector']
    },
    tier: 'ask', // downloads land a file on the user's real disk -- ASK per the spec's tier definitions
    handler: async (args) => {
      const result = await browser.download(args.triggerSelector, args.timeoutMs);
      return { text: `Downloaded "${result.suggestedFilename}" to ${result.path}` };
    }
  },
  {
    name: 'browser_upload',
    description: 'Attach one or more local file paths to a file input element.',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'DOM selector of the <input type="file"> element.' },
        filePaths: { type: 'array', items: { type: 'string' } }
      },
      required: ['selector', 'filePaths']
    },
    tier: 'ask', // sends local files to a remote page -- meaningful enough to confirm
    handler: async (args) => {
      await browser.upload(args.selector, args.filePaths);
      return { text: `Uploaded ${args.filePaths.length} file(s) to ${args.selector}.` };
    }
  }
]);

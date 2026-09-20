// server/tools/toolDefinitions.ts
//
// Thin aggregator over the plugin/tool registry (registry.ts). Each
// *.tools.ts file registers its own tools on import (desktop.tools.ts,
// browser.tools.ts, terminal.tools.ts, task.tools.ts) -- this file just
// imports them for their side effect and re-exports the shape agentLoop.ts
// already expects, so nothing else in the codebase had to change.
//
// To add a new tool: create server/tools/<name>.tools.ts calling
// registerTool()/registerTools() from './registry.js', then import it here
// for its side effect. No switch statement to edit, no risk of colliding
// with an existing case label.

import './desktop.tools.js';
import './browser.tools.js';
import './terminal.tools.js';
import './task.tools.js';
import './memory.tools.js';
import './vision.tools.js';
import './plan.tools.js';

import { getToolSchemas, dispatch, isDestructive, isBlocked, listToolNames } from './registry.js';
import type { ToolCallResult, ScreenshotAnnotation } from './registry.js';

export const TOOLS: any[] = getToolSchemas();
export const dispatchTool = dispatch;
export { isDestructive, isBlocked, listToolNames };
export type { ToolCallResult, ScreenshotAnnotation };

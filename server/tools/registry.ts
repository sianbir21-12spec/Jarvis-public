// server/tools/registry.ts
//
// The plugin/tool system for JARVIS's agent. Replaces what used to be one
// big TOOLS array + one big switch(name) dispatch() in toolDefinitions.ts.
//
// Adding a new tool now means calling registerTool() from a *.tools.ts
// file -- no editing of a shared switch statement, no risk of colliding
// with someone else's case label. See desktop.tools.ts / browser.tools.ts /
// terminal.tools.ts / task.tools.ts for examples.

export interface ScreenshotAnnotation {
  // Pixel coordinates in the *same* coordinate space as the accompanying
  // screenshot's width/height -- the frontend scales these to however the
  // image actually renders via an SVG viewBox, so tool handlers never need
  // to know the display size.
  x: number;
  y: number;
  // Optional box size around (x, y). Omitted for a plain point-click,
  // where we don't know the target element's real extent -- the frontend
  // draws a small default marker in that case instead of a box.
  w?: number;
  h?: number;
  label: string;
}

export interface ToolCallResult {
  text: string;
  screenshot?: { base64: string; width: number; height: number };
  // Bounding boxes/markers for whatever element(s) this tool call acted on,
  // drawn as a client-side SVG overlay on top of `screenshot` (see
  // AgentPanel.tsx) -- the raw image is never modified, so it stays
  // inspectable/re-usable as-is by the model on the next turn.
  annotations?: ScreenshotAnnotation[];
  isTaskComplete?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  // JSON-schema "parameters" object, OpenAI function-calling style.
  parameters: Record<string, unknown>;
  handler: (args: any) => Promise<ToolCallResult>;
  // Marks this tool as needing user approval before it runs. Either a flat
  // boolean, or a predicate over the call's args for tools that are only
  // sometimes destructive (e.g. a shell command matched against a pattern
  // list) -- used by the agent confirmation UI to decide what to pause on.
  destructive?: boolean | ((args: any) => boolean);
}

const registry = new Map<string, ToolDefinition>();

export function registerTool(def: ToolDefinition): void {
  if (registry.has(def.name)) {
    throw new Error(`Tool "${def.name}" is already registered -- names must be unique across all *.tools.ts files.`);
  }
  registry.set(def.name, def);
}

export function registerTools(defs: ToolDefinition[]): void {
  for (const def of defs) registerTool(def);
}

// OpenAI-compatible tool schema array for the /v1/chat/completions `tools` field.
export function getToolSchemas(): any[] {
  return Array.from(registry.values()).map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters }
  }));
}

export function isDestructive(name: string, args: any): boolean {
  const tool = registry.get(name);
  if (!tool || !tool.destructive) return false;
  return typeof tool.destructive === 'function' ? tool.destructive(args) : true;
}

export async function dispatch(name: string, args: any): Promise<ToolCallResult> {
  const tool = registry.get(name);
  if (!tool) {
    return { text: `Unknown tool: ${name}` };
  }
  try {
    return await tool.handler(args);
  } catch (err: any) {
    return { text: `Tool "${name}" failed: ${err?.message || err}` };
  }
}

// Mostly for debugging / the future usage dashboard (per-tool call counts,
// etc. can key off this list rather than hardcoding tool names).
export function listToolNames(): string[] {
  return Array.from(registry.keys());
}

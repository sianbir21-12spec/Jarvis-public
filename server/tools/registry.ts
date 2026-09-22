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

export type ToolTier = 'safe' | 'ask' | 'block';

export interface ToolDefinition {
  name: string;
  description: string;
  // JSON-schema "parameters" object, OpenAI function-calling style.
  parameters: Record<string, unknown>;
  handler: (args: any) => Promise<ToolCallResult>;
  // Permission tier (SAFE / ASK / BLOCK). Omitted = 'safe' (runs freely --
  // reads, calculations, navigation). 'ask' pauses for user approval via
  // the confirmation UI before the handler ever runs. 'block' refuses
  // outright and never calls the handler at all -- for credential
  // extraction, persistence primitives (scheduled tasks, registry Run
  // keys, new admin accounts), and catastrophic/irreversible commands
  // (disk format, mass delete of system paths). Can be a function of args
  // for tools that are only sometimes risky, e.g. a shell command matched
  // against pattern lists.
  //
  // `destructive` is kept as a deprecated alias for tier: true === 'ask'.
  // New tools should use `tier`; this stays so nothing written against the
  // old field breaks.
  tier?: ToolTier | ((args: any) => ToolTier);
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

export function getTier(name: string, args: any): ToolTier {
  const tool = registry.get(name);
  if (!tool) return 'safe';
  if (tool.tier) return typeof tool.tier === 'function' ? tool.tier(args) : tool.tier;
  // Fall back to the deprecated `destructive` field.
  if (tool.destructive) {
    return (typeof tool.destructive === 'function' ? tool.destructive(args) : tool.destructive) ? 'ask' : 'safe';
  }
  return 'safe';
}

export function isDestructive(name: string, args: any): boolean {
  return getTier(name, args) === 'ask';
}

export function isBlocked(name: string, args: any): boolean {
  return getTier(name, args) === 'block';
}

// Lightweight JSON-schema validation -- just required-field presence and
// primitive type checks, not a full schema validator. Enough to catch the
// actual failure mode this exists for (model omits/mistypes an argument),
// without the maintenance cost of a real ajv-style dependency for schemas
// this simple.
function validateArgs(tool: ToolDefinition, args: any): string | null {
  const schema: any = tool.parameters;
  if (!schema || schema.type !== 'object') return null;
  const required: string[] = Array.isArray(schema.required) ? schema.required : [];
  const props: Record<string, any> = schema.properties || {};

  for (const key of required) {
    if (args == null || args[key] === undefined || args[key] === null) {
      return `Missing required argument "${key}" for tool "${tool.name}".`;
    }
  }
  for (const [key, val] of Object.entries(args ?? {})) {
    const propSchema = props[key];
    if (!propSchema || val === undefined || val === null) continue;
    const expected = propSchema.type;
    if (!expected) continue;
    const actual = Array.isArray(val) ? 'array' : typeof val;
    if (expected === 'number' && actual !== 'number') {
      return `Argument "${key}" for tool "${tool.name}" must be a number, got ${actual}.`;
    }
    if (expected === 'string' && actual !== 'string') {
      return `Argument "${key}" for tool "${tool.name}" must be a string, got ${actual}.`;
    }
    if (expected === 'boolean' && actual !== 'boolean') {
      return `Argument "${key}" for tool "${tool.name}" must be a boolean, got ${actual}.`;
    }
    if (expected === 'array' && actual !== 'array') {
      return `Argument "${key}" for tool "${tool.name}" must be an array, got ${actual}.`;
    }
  }
  return null;
}

export async function dispatch(name: string, args: any): Promise<ToolCallResult> {
  const tool = registry.get(name);
  if (!tool) {
    return { text: `Unknown tool: ${name}` };
  }
  // Defense in depth: even if a caller forgets to check the tier before
  // dispatching (agentLoop.ts does), a blocked call never actually runs.
  if (getTier(name, args) === 'block') {
    return { text: `Blocked: "${name}" is not permitted with these arguments (tier: BLOCK). This is not something the user can approve past -- pick a different approach.` };
  }
  const validationError = validateArgs(tool, args);
  if (validationError) {
    // Caught before the handler ever runs -- turns a would-be crash deep
    // inside a tool (e.g. destructuring an undefined x/y) into a clear,
    // recoverable message the model can act on immediately.
    return { text: `Invalid arguments: ${validationError}` };
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

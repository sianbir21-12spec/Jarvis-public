// server/state/usage.ts
//
// Lightweight local usage logging: messages/day, tool-call counts, and
// chat response latency, so the Dashboard panel has something to show.
// Same persistence pattern as memoryStore.ts / runtimeConfig.ts -- a
// JSON file in the Electron userData dir, cached in memory, flushed to
// disk on every write. No telemetry leaves the machine; this is purely
// local, for the user's own Dashboard view.

import fs from 'fs';
import path from 'path';
import os from 'os';

export interface UsageEvent {
  // 'chat_message' = one user message sent in regular chat.
  // 'tool_call' = one agent tool invocation (name in `tool`).
  // 'agent_run' = one full agent task run (task_complete or error).
  type: 'chat_message' | 'tool_call' | 'agent_run';
  timestamp: number;
  tool?: string;
  // Wall-clock latency in ms, where meaningful (chat response time,
  // agent run duration). Omitted for events where it isn't tracked.
  latencyMs?: number;
}

export interface UsageLog {
  events: UsageEvent[];
}

// Keeps the log file bounded -- this is a rolling window for the
// Dashboard's charts, not an audit trail. Oldest events are dropped
// first once the cap is hit.
const MAX_EVENTS = 5000;

function usageDir(): string {
  if (process.env.JARVIS_CONFIG_DIR) return process.env.JARVIS_CONFIG_DIR;
  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'jarvis-desktop');
  }
  return path.join(os.homedir(), '.jarvis-desktop');
}

function usagePath(): string {
  return path.join(usageDir(), 'usage.json');
}

let cache: UsageEvent[] | null = null;

function load(): UsageEvent[] {
  if (cache) return cache;
  let result: UsageEvent[] = [];
  try {
    const raw = fs.readFileSync(usagePath(), 'utf8');
    const parsed = JSON.parse(raw);
    result = Array.isArray(parsed?.events) ? parsed.events.filter(isValidEvent) : [];
  } catch {
    result = [];
  }
  cache = result;
  return result;
}

function isValidEvent(x: any): x is UsageEvent {
  return x && typeof x.type === 'string' && typeof x.timestamp === 'number';
}

function persist(events: UsageEvent[]): void {
  const dir = usageDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(usagePath(), JSON.stringify({ events }, null, 2), 'utf8');
  cache = events;
}

/**
 * Records one usage event. Fire-and-forget by design -- logging failures
 * should never break the chat/agent flow that triggered them, so callers
 * don't need to await or handle errors from this.
 */
export function logUsageEvent(event: Omit<UsageEvent, 'timestamp'> & { timestamp?: number }): void {
  try {
    const events = [...load(), { ...event, timestamp: event.timestamp ?? Date.now() }];
    while (events.length > MAX_EVENTS) events.shift();
    persist(events);
  } catch {
    // Best-effort only -- see comment above.
  }
}

/** Raw events, optionally limited to the last `sinceMs` milliseconds. */
export function getUsageEvents(sinceMs?: number): UsageEvent[] {
  const events = load();
  if (!sinceMs) return events;
  const cutoff = Date.now() - sinceMs;
  return events.filter((e) => e.timestamp >= cutoff);
}

export interface UsageSummary {
  // Messages sent per day, oldest first, for the last `days` days
  // (including days with zero messages, so the chart has a consistent
  // x-axis rather than gaps).
  messagesByDay: Array<{ date: string; count: number }>;
  // Tool-call counts, most-called first.
  toolCallCounts: Array<{ tool: string; count: number }>;
  // Chat latency stats over the window, in ms.
  latency: { avgMs: number; p50Ms: number; p95Ms: number; sampleCount: number };
  totals: { chatMessages: number; toolCalls: number; agentRuns: number };
}

export function getUsageSummary(days = 14): UsageSummary {
  const windowMs = days * 24 * 60 * 60 * 1000;
  const events = getUsageEvents(windowMs);

  // messagesByDay: build a zero-filled bucket per day first, then tally.
  const dayBuckets = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    dayBuckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const e of events) {
    if (e.type !== 'chat_message') continue;
    const key = new Date(e.timestamp).toISOString().slice(0, 10);
    if (dayBuckets.has(key)) dayBuckets.set(key, (dayBuckets.get(key) || 0) + 1);
  }
  const messagesByDay = Array.from(dayBuckets.entries()).map(([date, count]) => ({ date, count }));

  // toolCallCounts
  const toolCounts = new Map<string, number>();
  for (const e of events) {
    if (e.type !== 'tool_call' || !e.tool) continue;
    toolCounts.set(e.tool, (toolCounts.get(e.tool) || 0) + 1);
  }
  const toolCallCounts = Array.from(toolCounts.entries())
    .map(([tool, count]) => ({ tool, count }))
    .sort((a, b) => b.count - a.count);

  // latency (chat_message events only -- that's what carries meaningful
  // user-facing response time; tool-call latency is dominated by the
  // action itself, e.g. a page load, and isn't a useful gateway metric).
  const latencies = events
    .filter((e) => e.type === 'chat_message' && typeof e.latencyMs === 'number')
    .map((e) => e.latencyMs as number)
    .sort((a, b) => a - b);
  const avgMs = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
  const p50Ms = latencies.length ? latencies[Math.floor(latencies.length * 0.5)] : 0;
  const p95Ms = latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))] : 0;

  const totals = {
    chatMessages: events.filter((e) => e.type === 'chat_message').length,
    toolCalls: events.filter((e) => e.type === 'tool_call').length,
    agentRuns: events.filter((e) => e.type === 'agent_run').length
  };

  return {
    messagesByDay,
    toolCallCounts: toolCallCounts.slice(0, 12),
    latency: { avgMs, p50Ms, p95Ms, sampleCount: latencies.length },
    totals
  };
}

export function clearUsage(): void {
  persist([]);
}

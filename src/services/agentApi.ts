export interface ScreenshotAnnotation {
  x: number;
  y: number;
  w?: number;
  h?: number;
  label: string;
}

export interface PlanStep {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'done' | 'failed';
  attempts: number;
}

export type AgentEvent =
  | { type: 'status'; message: string }
  | { type: 'assistant_text'; text: string }
  | { type: 'tool_call'; name: string; args: any; step: number }
  | {
      type: 'tool_result';
      name: string;
      text: string;
      screenshot?: string;
      screenshotWidth?: number;
      screenshotHeight?: number;
      annotations?: ScreenshotAnnotation[];
      step: number;
    }
  | { type: 'confirm_required'; name: string; args: any; step: number }
  | { type: 'plan'; steps: PlanStep[] }
  | { type: 'done'; summary: string }
  | { type: 'error'; message: string };

export const agentApiService = {
  // Opens the connection to the gateway ahead of time, e.g. right when the
  // Agent panel or /agent input opens -- shaves the TCP/TLS handshake off
  // the real first step's latency. Fire-and-forget; errors are swallowed
  // since this is purely an optimization, not a correctness requirement.
  warmup(): void {
    fetch('/api/agent/warmup', { method: 'POST' }).catch(() => {});
  },

  /**
   * Streams AgentEvent objects from the backend while the agent runs.
   */
  async runTask({
    task,
    sessionId,
    signal,
    onEvent
  }: {
    task: string;
    sessionId: string;
    signal?: AbortSignal;
    onEvent: (event: AgentEvent) => void;
  }): Promise<void> {
    const response = await fetch('/api/agent/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task, sessionId }),
      signal
    });

    if (!response.ok || !response.body) {
      let message = 'Failed to start agent.';
      try {
        const data = await response.json();
        message = data.error || message;
      } catch {
        /* ignore */
      }
      onEvent({ type: 'error', message });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const dataStr = trimmed.slice(5).trim();
        if (dataStr === '[DONE]') return;
        try {
          onEvent(JSON.parse(dataStr));
        } catch {
          /* ignore malformed chunk */
        }
      }
    }
  },

  async stopTask(sessionId: string): Promise<void> {
    await fetch('/api/agent/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    }).catch(() => {});
  },

  // Approves or denies a pending destructive-action pause (`confirm_required`
  // event) for the given session.
  async confirmAction(sessionId: string, approved: boolean): Promise<void> {
    await fetch('/api/agent/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, approved })
    }).catch(() => {});
  }
};

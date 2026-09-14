export type AgentEvent =
  | { type: 'status'; message: string }
  | { type: 'assistant_text'; text: string }
  | { type: 'tool_call'; name: string; args: any; step: number }
  | { type: 'tool_result'; name: string; text: string; screenshot?: string; step: number }
  | { type: 'done'; summary: string }
  | { type: 'error'; message: string };

export const agentApiService = {
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
  }
};

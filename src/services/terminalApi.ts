export interface TerminalChunk {
  sessionId: string;
  data: string;
  stream: 'stdout' | 'stderr';
}

export const terminalApiService = {
  async start(cwd?: string): Promise<{ sessionId: string; cwd: string }> {
    const res = await fetch('/api/terminal/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cwd })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to start terminal session.');
    }
    return res.json();
  },

  // Opens a live SSE stream of output for a session. Returns a close()
  // function; onChunk fires for every burst of output (including the
  // existing scrollback, sent immediately on connect).
  streamOutput(sessionId: string, onChunk: (chunk: TerminalChunk) => void): () => void {
    const es = new EventSource(`/api/terminal/stream/${sessionId}`);
    es.onmessage = (event) => {
      try {
        onChunk(JSON.parse(event.data));
      } catch {
        /* ignore malformed chunk */
      }
    };
    return () => es.close();
  },

  // Sends a command and waits for it to finish (resolves with full output
  // + exit code). Use this for normal commands. For anything long-running
  // (dev servers, watchers), send it and don't await -- rely on
  // streamOutput for live output instead, then killSession to stop it.
  async run(sessionId: string, command: string): Promise<{ output: string; exitCode: number | null }> {
    const res = await fetch('/api/terminal/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, command })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Command failed.');
    return data;
  },

  async sendInput(sessionId: string, text: string): Promise<void> {
    await fetch('/api/terminal/input', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, text })
    }).catch(() => {});
  },

  async kill(sessionId: string): Promise<void> {
    await fetch('/api/terminal/kill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    }).catch(() => {});
  }
};

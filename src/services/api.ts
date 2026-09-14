import { ChatMessage, GatewayHealth, WebpageContext } from '../types';

export interface StreamChatParams {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  signal?: AbortSignal;
  onChunk: (text: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: Error) => void;
}

export const apiService = {
  /**
   * Streams chat completion via SSE from Express backend
   */
  async streamChat({
    messages,
    model,
    temperature,
    maxTokens,
    systemPrompt,
    signal,
    onChunk,
    onDone,
    onError
  }: StreamChatParams): Promise<void> {
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages,
          model,
          temperature,
          maxTokens,
          systemPrompt,
          stream: true
        }),
        signal
      });

      if (!response.ok) {
        let errMessage = 'JARVIS cannot reach the AI gateway.';
        try {
          const errData = await response.json();
          errMessage = errData.error || errMessage;
        } catch {
          errMessage = response.statusText || errMessage;
        }
        throw new Error(errMessage);
      }

      const body = response.body;
      if (!body) {
        throw new Error('Connection interrupted: Empty stream from backend.');
      }

      const reader = body.getReader();
      const decoder = new TextDecoder('utf-8');
      let accumulated = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;

          if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.slice(5).trim();
            if (dataStr === '[DONE]') {
              onDone(accumulated);
              return;
            }

            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.content) {
                accumulated += parsed.content;
                onChunk(parsed.content);
              }
            } catch {
              // Plain text fallback
              accumulated += dataStr;
              onChunk(dataStr);
            }
          }
        }
      }

      onDone(accumulated);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return; // Normal cancellation by user
      }
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  },

  /**
   * Fallback synchronous chat completion
   */
  async sendChatSync({
    messages,
    model,
    temperature,
    maxTokens,
    systemPrompt
  }: {
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
  }): Promise<string> {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        model,
        temperature,
        maxTokens,
        systemPrompt,
        stream: false
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Communication error' }));
      throw new Error(err.error || 'JARVIS cannot reach the AI gateway.');
    }

    const data = await res.json();
    return data.content || '';
  },

  /**
   * Health ping to the AI Gateway
   */
  async checkHealth(): Promise<GatewayHealth> {
    try {
      const res = await fetch('/api/health');
      if (!res.ok) {
        return {
          status: 'error',
          model: 'SIAN',
          gateway: 'https://omnirouuter.zeabur.app',
          message: 'Gateway responded with error status'
        };
      }
      const data = await res.json();
      return {
        status: data.status || 'online',
        latency: data.latency,
        model: data.model || 'SIAN',
        gateway: data.gateway || 'https://omnirouuter.zeabur.app'
      };
    } catch (e: any) {
      return {
        status: 'offline',
        model: 'SIAN',
        gateway: 'https://omnirouuter.zeabur.app',
        message: 'JARVIS cannot reach the AI gateway.'
      };
    }
  },

  /**
   * Extracts or sanitizes webpage context
   */
  async extractWebpageContext(payload: {
    url?: string;
    title?: string;
    text?: string;
    selection?: string;
  }): Promise<WebpageContext> {
    const res = await fetch('/api/webpage-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to extract context' }));
      throw new Error(err.error || 'Failed to extract webpage context.');
    }

    const data = await res.json();
    return data.context;
  },

  /**
   * Transcribe recorded microphone audio (Electron / fallback)
   */
  async transcribeAudio(audioBase64: string, mimeType: string): Promise<string> {
    const res = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: audioBase64, mimeType })
    });
    const data = await res.json().catch(() => ({ error: 'Transcription failed' }));
    if (!res.ok) {
      throw new Error(data.error || 'Speech transcription failed.');
    }
    return data.text || '';
  }
};

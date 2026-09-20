import dotenv from 'dotenv';
import { getConfig } from './runtimeConfig.js';
dotenv.config();

export interface OmniRouteMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface OmniRouteChatOptions {
  messages: OmniRouteMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  // Lets the caller cancel the upstream request when the browser
  // disconnects, instead of leaving the gateway call running and writing
  // into a dead socket until it finishes.
  signal?: AbortSignal;
}

export const OMNIROUTE_CONFIG = {
  get apiKey(): string {
    const key = getConfig('OMNIROUTE_API_KEY');
    if (!key) {
      throw {
        status: 500,
        message:
          'OmniRoute API key is not configured. Open Settings -> AI Gateway & Keys and paste your OmniRoute API key.'
      };
    }
    return key;
  },
  get baseUrl(): string {
    const raw = getConfig('OMNIROUTE_BASE_URL');
    return raw.replace(/\/+$/, '');
  },
  get defaultModel(): string {
    return getConfig('OMNIROUTE_MODEL');
  }
};

/**
 * Validates message array before sending to gateway
 */
export function validateMessages(messages: any[]): OmniRouteMessage[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw { status: 400, message: 'Invalid messages: Expected a non-empty array of messages.' };
  }

  return messages.map((msg, idx) => {
    if (!msg || typeof msg !== 'object') {
      throw { status: 400, message: `Invalid message format at index ${idx}.` };
    }
    const role = msg.role;
    if (!['user', 'assistant', 'system'].includes(role)) {
      throw { status: 400, message: `Invalid role "${role}" at message index ${idx}. Must be user, assistant, or system.` };
    }
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content ?? '');
    return {
      role: role as 'user' | 'assistant' | 'system',
      content
    };
  });
}

/**
 * Sends a chat completion request to OmniRoute gateway
 */
export async function fetchOmniRouteChat(options: OmniRouteChatOptions) {
  const endpoint = `${OMNIROUTE_CONFIG.baseUrl}/v1/chat/completions`;
  const apiKey = OMNIROUTE_CONFIG.apiKey;
  const model = options.model || OMNIROUTE_CONFIG.defaultModel;

  const payload = {
    model,
    messages: options.messages,
    stream: !!options.stream,
    temperature: typeof options.temperature === 'number' ? options.temperature : 0.7,
    ...(options.max_tokens ? { max_tokens: options.max_tokens } : {})
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload),
    signal: options.signal
  });

  if (!response.ok) {
    let errorDetail = '';
    try {
      const errJson = await response.json();
      errorDetail = errJson.error?.message || errJson.message || JSON.stringify(errJson);
    } catch {
      errorDetail = await response.text();
    }

    if (response.status === 401 || response.status === 403) {
      throw { status: 401, message: 'OmniRoute authentication failed.' };
    } else if (response.status === 404) {
      throw { status: 404, message: `Model ${model} is unavailable on OmniRoute.` };
    } else {
      throw {
        status: response.status,
        message: `JARVIS cannot reach the AI gateway: ${errorDetail || response.statusText}`
      };
    }
  }

  return response;
}

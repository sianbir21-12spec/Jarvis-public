import { Router, Request, Response, NextFunction } from 'express';
import { fetchOmniRouteChat, validateMessages, OMNIROUTE_CONFIG } from '../omniroute.js';
import { transcribeAudio } from '../transcribe.js';

export const chatRouter = Router();

/**
 * GET /api/config
 * Exposes safe configuration info to the client
 */
chatRouter.get('/config', (req: Request, res: Response) => {
  res.json({
    model: OMNIROUTE_CONFIG.defaultModel,
    baseUrl: OMNIROUTE_CONFIG.baseUrl,
    streaming: true,
    speechSupported: true
  });
});

/**
 * GET /api/health
 * Pings gateway status and measures latency
 */
chatRouter.get('/health', async (req: Request, res: Response) => {
  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    // Simple test ping to gateway base or models endpoint
    const pingRes = await fetch(`${OMNIROUTE_CONFIG.baseUrl}/v1/models`, {
      headers: {
        'Authorization': `Bearer ${OMNIROUTE_CONFIG.apiKey}`
      },
      signal: controller.signal
    }).catch(() => null);

    clearTimeout(timeout);
    const latency = Date.now() - startTime;

    res.json({
      status: pingRes && pingRes.ok ? 'online' : 'online', // gateway responded
      latency,
      model: OMNIROUTE_CONFIG.defaultModel,
      gateway: OMNIROUTE_CONFIG.baseUrl,
      system: 'JARVIS Core Operational'
    });
  } catch (error: any) {
    res.json({
      status: 'offline',
      latency: Date.now() - startTime,
      model: OMNIROUTE_CONFIG.defaultModel,
      gateway: OMNIROUTE_CONFIG.baseUrl,
      message: 'JARVIS cannot reach the AI gateway.'
    });
  }
});

/**
 * POST /api/chat
 * Primary chat endpoint with OpenAI-compatible SSE streaming
 */
chatRouter.post('/chat', async (req: Request, res: Response, next: NextFunction) => {
  const abortController = new AbortController();

  req.on('close', () => {
    abortController.abort();
  });

  try {
    const { messages, model, temperature, maxTokens, stream = true, systemPrompt } = req.body;

    let validated = validateMessages(messages);

    // Prepend system prompt if provided
    if (systemPrompt && typeof systemPrompt === 'string' && systemPrompt.trim()) {
      if (validated[0]?.role !== 'system') {
        validated = [{ role: 'system', content: systemPrompt.trim() }, ...validated];
      }
    }

    if (!stream) {
      // Non-streaming completion
      const gatewayResponse = await fetchOmniRouteChat({
        messages: validated,
        model,
        temperature,
        max_tokens: maxTokens,
        stream: false
      });

      const data: any = await gatewayResponse.json();
      const assistantContent = data.choices?.[0]?.message?.content || '';
      return res.json({
        content: assistantContent,
        model: data.model || model || OMNIROUTE_CONFIG.defaultModel,
        usage: data.usage || null
      });
    }

    // Streaming completion
    const gatewayResponse = await fetchOmniRouteChat({
      messages: validated,
      model,
      temperature,
      max_tokens: maxTokens,
      stream: true
    });

    const body = gatewayResponse.body;
    if (!body) {
      throw { status: 500, message: 'Connection interrupted: Empty stream body from OmniRoute.' };
    }

    // Set SSE headers for browser
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable proxy buffering
    res.flushHeaders?.();

    const reader = body.getReader();
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
        if (!trimmed || trimmed.startsWith(':')) continue;

        if (trimmed.startsWith('data:')) {
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === '[DONE]') {
            res.write('data: [DONE]\n\n');
            continue;
          }

          try {
            const parsed = JSON.parse(dataStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta !== undefined && delta !== null) {
              res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
            }
          } catch {
            // Raw text fallback if not JSON
            res.write(`data: ${JSON.stringify({ content: dataStr })}\n\n`);
          }
        }
      }
    }

    // Process leftover buffer
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith('data:')) {
        const dataStr = trimmed.slice(5).trim();
        if (dataStr === '[DONE]') {
          res.write('data: [DONE]\n\n');
        } else {
          try {
            const parsed = JSON.parse(dataStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
          } catch {
            // Ignored
          }
        }
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/webpage-context
 * Secure webpage text import / extraction
 */
chatRouter.post('/webpage-context', async (req: Request, res: Response) => {
  const { url, title, text, selection } = req.body;

  // If user provided direct context payload
  if (text || selection) {
    return res.json({
      success: true,
      context: {
        url: url || '',
        title: title || 'Imported Document',
        text: (text || '').slice(0, 15000), // safe ceiling
        selection: (selection || '').slice(0, 5000),
        timestamp: Date.now()
      }
    });
  }

  // If user asked to fetch a public URL
  if (url && typeof url === 'string') {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format provided.' });
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: 'Only HTTP/HTTPS URLs are supported.' });
    }

    const host = parsedUrl.hostname.toLowerCase();
    // SSRF protection: reject localhost and private IP ranges
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host.endsWith('.local')
    ) {
      return res.status(403).json({ error: 'Access to private or local network resources is restricted.' });
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!response.ok) {
        return res.status(400).json({ error: `Failed to fetch URL: HTTP ${response.status} ${response.statusText}` });
      }

      const html = await response.text();
      // Extract title
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const pageTitle = titleMatch ? titleMatch[1].trim() : parsedUrl.hostname;

      // Clean HTML to text
      const cleanText = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
        .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
        .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 15000);

      return res.json({
        success: true,
        context: {
          url,
          title: pageTitle,
          text: cleanText,
          timestamp: Date.now()
        }
      });
    } catch (err: any) {
      return res.status(500).json({
        error: err.name === 'AbortError' ? 'URL fetch timed out.' : 'Failed to retrieve webpage context.'
      });
    }
  }

  return res.status(400).json({ error: 'Either url or text must be provided.' });
});

/**
 * POST /api/transcribe
 * Speech-to-text for Electron (MediaRecorder audio)
 */
chatRouter.post('/transcribe', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { audio, mimeType } = req.body || {};
    if (!audio || typeof audio !== 'string') {
      return res.status(400).json({ error: 'Missing audio data.' });
    }

    const buffer = Buffer.from(audio, 'base64');
    if (!buffer.length) {
      return res.status(400).json({ error: 'Empty audio payload.' });
    }

    const result = await transcribeAudio(buffer, typeof mimeType === 'string' ? mimeType : 'audio/webm');
    res.json({ text: result.text, engine: result.engine });
  } catch (err) {
    next(err);
  }
});

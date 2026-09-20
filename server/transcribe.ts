import { GoogleGenAI } from '@google/genai';
import { OMNIROUTE_CONFIG } from './omniroute.js';
import { getConfig } from './runtimeConfig.js';

function extensionForMime(mimeType: string): string {
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
  return 'webm';
}

async function transcribeViaOmniRoute(buffer: Buffer, mimeType: string): Promise<string> {
  const ext = extensionForMime(mimeType);
  const form = new FormData();
  const bytes = new Uint8Array(buffer); // copies into a plain ArrayBuffer-backed view, avoiding the SharedArrayBuffer typing mismatch
  form.append('file', new Blob([bytes], { type: mimeType }), `speech.${ext}`);
  form.append('model', getConfig('OMNIROUTE_STT_MODEL'));

  const res = await fetch(`${OMNIROUTE_CONFIG.baseUrl}/v1/audio/transcriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OMNIROUTE_CONFIG.apiKey}`
    },
    body: form
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`OmniRoute STT failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  const data: any = await res.json();
  return (data.text || data.transcript || '').trim();
}

async function transcribeViaGemini(buffer: Buffer, mimeType: string): Promise<string> {
  const apiKey = getConfig('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('Gemini API key is not set');
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: getConfig('GEMINI_STT_MODEL'),
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: mimeType || 'audio/webm', data: buffer.toString('base64') } },
          {
            text: 'Transcribe the spoken words verbatim. Return only the transcript. If there is no speech, return an empty string.'
          }
        ]
      }
    ]
  });

  return String(response.text || '').trim();
}

export async function transcribeAudio(buffer: Buffer, mimeType: string): Promise<{ text: string; engine: string }> {
  const errors: string[] = [];

  try {
    const text = await transcribeViaOmniRoute(buffer, mimeType);
    return { text, engine: 'omniroute' };
  } catch (err: any) {
    errors.push(err?.message || 'OmniRoute STT failed');
  }

  if (getConfig('GEMINI_API_KEY')) {
    try {
      const text = await transcribeViaGemini(buffer, mimeType);
      return { text, engine: 'gemini' };
    } catch (err: any) {
      errors.push(err?.message || 'Gemini STT failed');
    }
  }

  throw {
    status: 502,
    message:
      'Speech transcription is not available. OmniRoute did not accept Whisper audio. Add a Gemini API key in Settings -> AI Gateway & Keys (recommended for Electron voice), or use Chrome at http://localhost:3000. ' +
      errors.join(' | ')
  };
}

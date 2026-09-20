export type JarvisState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export interface WebpageContext {
  url: string;
  title: string;
  text: string;
  selection?: string;
  timestamp?: number;
}

export interface AttachedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  content: string;
}

// A file the assistant produced from its own response (code block, document,
// data, etc.) that the user can download. Generated client-side for plain
// text/code, or via /api/files/generate on the server for binary formats
// (.docx / .xlsx / .pdf) that need a real writer library.
export interface GeneratedFile {
  id: string;
  filename: string;
  mimeType: string;
  // Present for text-based files generated entirely in the browser.
  content?: string;
  // Present once a server-generated binary file has been fetched, as a
  // blob: URL ready to hand to an <a download> link.
  blobUrl?: string;
  format: 'text' | 'docx' | 'xlsx' | 'pdf';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  context?: WebpageContext;
  isStreaming?: boolean;
  error?: boolean;
  errorMessage?: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface AppSettings {
  model: string;
  baseUrl: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  voiceEnabled: boolean;
  autoSpeak: boolean;
  speechRate: number;
  speechPitch: number;
  voiceURI: string;
  enterToSend: boolean;
  streamingEnabled: boolean;
  soundEffects: boolean;
  theme: 'dark' | 'light';
  notificationsEnabled: boolean;
}

export interface CommandExecutionResult {
  handled: boolean;
  feedback?: string;
  type?: 'clear' | 'new' | 'explain' | 'speak' | 'context' | 'voice_toggle' | 'help' | 'custom_prompt';
  promptToSend?: string;
}

export interface GatewayHealth {
  status: 'online' | 'offline' | 'checking' | 'error';
  latency?: number;
  model: string;
  gateway: string;
  message?: string;
}

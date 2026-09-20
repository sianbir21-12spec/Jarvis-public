import { Conversation, AppSettings, ChatMessage } from '../types';

const CONVERSATIONS_KEY = 'jarvis_conversations_v1';
const ACTIVE_CONV_KEY = 'jarvis_active_conv_id';
const SETTINGS_KEY = 'jarvis_settings_v1';

export const DEFAULT_SYSTEM_PROMPT = `You are JARVIS, a highly capable personal AI assistant.
You are concise, intelligent, technically precise, and proactive.

When solving technical problems:
- reason carefully
- identify assumptions
- provide practical solutions
- provide code when useful
- never fabricate capabilities

When interacting with the user:
- be natural
- be helpful
- avoid unnecessary repetition
- clearly distinguish facts from assumptions

You are running through an OmniRoute-compatible AI gateway.
Do not claim to have browser, filesystem, microphone, camera, or operating-system access unless the application actually provides that capability.

FILE ATTACHMENTS: You have no code execution environment, no Python interpreter, no sandbox, and no "files" variable or dictionary of any kind. Never write or present code that pretends to read, extract, or list attached files (e.g. a fake "files[...]" lookup or a fabricated extraction script) -- that capability does not exist and presenting one is a fabrication.
When the user attaches a file, its content -- including the unpacked contents of zip archives -- has already been extracted server-side and is included directly in their message under an "[ATTACHED FILES]:" heading. Read that text directly and answer based on it. If no "[ATTACHED FILES]:" section is present in the user's message, no file was actually attached to that message, regardless of what the user says -- tell them plainly that you don't see a file on this message and ask them to attach it again.`;

export const DEFAULT_SETTINGS: AppSettings = {
  model: 'SIAN',
  baseUrl: 'https://omnirouuter.zeabur.app',
  temperature: 0.7,
  maxTokens: 2048,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  voiceEnabled: true,
  autoSpeak: false,
  speechRate: 1.0,
  speechPitch: 1.0,
  voiceURI: '',
  enterToSend: true,
  streamingEnabled: true,
  soundEffects: true,
  theme: 'dark',
  notificationsEnabled: true
};

export const storageService = {
  getConversations(): Conversation[] {
    try {
      const data = localStorage.getItem(CONVERSATIONS_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('Failed to load conversations from storage', e);
      return [];
    }
  },

  saveConversation(conversation: Conversation): void {
    try {
      const all = storageService.getConversations();
      const index = all.findIndex((c) => c.id === conversation.id);
      if (index >= 0) {
        all[index] = conversation;
      } else {
        all.unshift(conversation);
      }
      localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(all));
    } catch (e) {
      console.error('Failed to save conversation to storage', e);
    }
  },

  deleteConversation(id: string): void {
    try {
      const all = storageService.getConversations().filter((c) => c.id !== id);
      localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(all));
      if (storageService.getActiveConversationId() === id) {
        localStorage.removeItem(ACTIVE_CONV_KEY);
      }
    } catch (e) {
      console.error('Failed to delete conversation', e);
    }
  },

  getActiveConversationId(): string | null {
    try {
      return localStorage.getItem(ACTIVE_CONV_KEY);
    } catch {
      return null;
    }
  },

  setActiveConversationId(id: string | null): void {
    try {
      if (id) {
        localStorage.setItem(ACTIVE_CONV_KEY, id);
      } else {
        localStorage.removeItem(ACTIVE_CONV_KEY);
      }
    } catch (e) {
      console.error('Failed to set active conversation ID', e);
    }
  },

  getSettings(): AppSettings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return DEFAULT_SETTINGS;
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed };
    } catch {
      return DEFAULT_SETTINGS;
    }
  },

  saveSettings(settings: AppSettings): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save settings', e);
    }
  },

  clearAllConversations(): void {
    try {
      localStorage.removeItem(CONVERSATIONS_KEY);
      localStorage.removeItem(ACTIVE_CONV_KEY);
    } catch (e) {
      console.error('Failed to clear all conversations', e);
    }
  },

  createNewConversation(initialTitle = 'New Protocol'): Conversation {
    const newConv: Conversation = {
      id: 'conv_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      title: initialTitle,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    storageService.saveConversation(newConv);
    storageService.setActiveConversationId(newConv.id);
    return newConv;
  }
};

// server/tools/memory.tools.ts
//
// Lets the autonomous agent read and write long-term memory during a run
// (e.g. "remember that I prefer PowerShell over cmd" or "what do you
// remember about my printer setup"), on top of the same store the
// Settings UI's Memory section manages. Non-destructive -- these never
// need the confirm_required pause.

import { registerTools } from './registry.js';
import { addMemory, searchMemories, deleteMemory } from '../memory/memoryStore.js';

registerTools([
  {
    name: 'memory_remember',
    description:
      'Save a durable fact to long-term memory so it is available in future chat and agent sessions (e.g. a stated preference, a recurring project detail, a correction the user gave you). Do not use this for one-off task details that only matter for the current request.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The fact to remember, written plainly (e.g. "Prefers PowerShell over cmd for terminal tasks").' },
        category: { type: 'string', description: 'Short freeform label, e.g. "preference", "project", "fact". Optional.' }
      },
      required: ['text']
    },
    handler: async (args) => {
      const entry = addMemory(String(args.text || ''), String(args.category || 'general'), 'agent');
      return { text: `Saved to memory: "${entry.text}"` };
    }
  },
  {
    name: 'memory_recall',
    description: 'Search long-term memory for facts relevant to a query. Use this if you need to check what you already know before asking the user something they may have already told you.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword(s) to search for. Leave blank to list the most recent memories.' }
      },
      required: []
    },
    handler: async (args) => {
      const results = searchMemories(String(args.query || ''), 20);
      if (results.length === 0) return { text: 'No matching memories found.' };
      const text = results.map((e) => `[${e.id}] (${e.category}) ${e.text}`).join('\n');
      return { text };
    }
  },
  {
    name: 'memory_forget',
    description: 'Delete a specific memory by its id (as returned by memory_recall). Use when the user asks you to forget something or a saved fact turns out to be wrong/outdated.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The memory id to delete.' }
      },
      required: ['id']
    },
    handler: async (args) => {
      const ok = deleteMemory(String(args.id || ''));
      return { text: ok ? 'Memory deleted.' : `No memory found with id "${args.id}".` };
    }
  }
]);

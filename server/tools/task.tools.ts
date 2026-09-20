// server/tools/task.tools.ts
// The one tool that isn't a real action -- lets the agent signal it's done.

import { registerTools } from './registry.js';

registerTools([
  {
    name: 'task_complete',
    description: 'Call this when the requested task is finished (or cannot be completed) to end the session with a summary for the user.',
    parameters: {
      type: 'object',
      properties: { summary: { type: 'string', description: 'Short summary of what was done or why it could not be completed.' } },
      required: ['summary']
    },
    handler: async (args) => ({ text: args.summary || 'Task complete.', isTaskComplete: true })
  }
]);

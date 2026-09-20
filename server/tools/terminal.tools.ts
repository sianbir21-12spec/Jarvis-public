// server/tools/terminal.tools.ts
// Registers terminal_* tools. Implementation lives in terminalControl.ts.

import { registerTools } from './registry.js';
import * as terminal from './terminalControl.js';
import { BLOCKED_PATTERNS, ASK_PATTERNS } from './desktopControl.js';

// The agent gets its own persistent terminal session (separate from
// whatever the user has open in the UI), created lazily on first use so a
// task that never touches the shell doesn't spawn one for nothing.
let agentTerminalSessionId: string | null = null;
function getAgentTerminalSession(): string {
  if (!agentTerminalSessionId) {
    agentTerminalSessionId = terminal.createSession().id;
  }
  return agentTerminalSessionId;
}

function commandTier(args: any): 'safe' | 'ask' | 'block' {
  const command = args?.command || '';
  if (BLOCKED_PATTERNS.some((p) => p.test(command))) return 'block';
  if (ASK_PATTERNS.some((p) => p.test(command))) return 'ask';
  return 'safe';
}

registerTools([
  {
    name: 'terminal_run',
    description:
      "Run a command in a persistent PowerShell terminal (like a real terminal session -- working directory and environment variables carry over between calls, unlike desktop_run_command which starts fresh each time). Use this for anything multi-step: cd into a folder then run something in it, activate an environment then use it, start and later check on a long process, etc.",
    parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
    // BLOCK-tier commands never reach this handler at all (registry.ts's
    // dispatch() refuses them). ASK-tier commands only reach here after
    // the user approves via the confirmation UI -- so unlike the previous
    // version, an approved command actually runs instead of being refused
    // a second time.
    tier: commandTier,
    handler: async (args) => {
      const sessionId = getAgentTerminalSession();
      try {
        const result = await terminal.runCommand(sessionId, args.command);
        return { text: `exit code: ${result.exitCode}\n${result.output}` };
      } catch (err: any) {
        return { text: `Terminal error: ${err.message || err}` };
      }
    }
  },
  {
    name: 'terminal_reset',
    description: "Kill and restart the agent's terminal session, e.g. if a previous command hung or you want a clean shell.",
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      if (agentTerminalSessionId) {
        terminal.killSession(agentTerminalSessionId);
        agentTerminalSessionId = null;
      }
      getAgentTerminalSession();
      return { text: 'Terminal session reset.' };
    }
  }
]);

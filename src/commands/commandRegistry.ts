export interface JarvisCommand {
  id: string;
  name: string;
  slash: string;
  description: string;
  patterns: RegExp[];
  actionType: 'clear' | 'new' | 'explain' | 'explain_code' | 'code' | 'translate' | 'search' | 'analyze_page' | 'speak' | 'voice_toggle' | 'help' | 'context' | 'agent' | 'terminal';
}

export const COMMAND_REGISTRY: JarvisCommand[] = [
  {
    id: 'clear',
    name: 'Clear Conversation',
    slash: '/clear',
    description: 'Clears all messages in the active protocol',
    patterns: [
      /^\/clear\b/i,
      /^clear\s+(chat|conversation|screen|history)\b/i,
      /^wipe\s+(chat|screen)\b/i
    ],
    actionType: 'clear'
  },
  {
    id: 'new',
    name: 'New Conversation',
    slash: '/new',
    description: 'Initializes a fresh conversation session',
    patterns: [
      /^\/new\b/i,
      /^new\s+(conversation|chat|protocol|session)\b/i,
      /^reset\s+session\b/i
    ],
    actionType: 'new'
  },
  {
    id: 'explain_code',
    name: 'Explain Code',
    slash: '/explain-code',
    description: 'Dissects code snippet with step-by-step logic, edge cases, and improvements',
    patterns: [
      /^\/explain-code\b/i,
      /^\/code-explain\b/i,
      /^\/explaincode\b/i,
      /^explain\s+(this\s+)?code\b/i,
      /^analyze\s+(this\s+)?code\b/i,
      /^review\s+(this\s+)?code\b/i,
      /^what\s+does\s+this\s+code\s+do\b/i,
      /^how\s+does\s+this\s+code\s+work\b/i
    ],
    actionType: 'explain_code'
  },
  {
    id: 'explain',
    name: 'Explain',
    slash: '/explain',
    description: 'Directs JARVIS to provide an intuitive in-depth breakdown',
    patterns: [
      /^\/explain\b/i,
      /^explain\s+this\b/i,
      /^break\s+this\s+down\b/i
    ],
    actionType: 'explain'
  },
  {
    id: 'code',
    name: 'Write Code',
    slash: '/code',
    description: 'Instructs JARVIS to formulate clean, production-grade code',
    patterns: [
      /^\/code\b/i,
      /^write\s+code\s+(for\s+this|please)?\b/i,
      /^generate\s+code\b/i
    ],
    actionType: 'code'
  },
  {
    id: 'translate',
    name: 'Translate',
    slash: '/translate',
    description: 'Translates provided text or context into requested language',
    patterns: [
      /^\/translate\b/i,
      /^translate\s+this\b/i
    ],
    actionType: 'translate'
  },
  {
    id: 'analyze_page',
    name: 'Analyze Page Context',
    slash: '/analyze',
    description: 'Inspects and extracts key insights from imported webpage context',
    patterns: [
      /^\/analyze\b/i,
      /^analyze\s+(this\s+)?(page|document|context|website)\b/i
    ],
    actionType: 'analyze_page'
  },
  {
    id: 'search',
    name: 'Search Guidance',
    slash: '/search',
    description: 'Formats search queries or synthesizes knowledge objectives',
    patterns: [
      /^\/search\b/i,
      /^search\s+(the\s+web\s+for|google\s+for|web\b)/i
    ],
    actionType: 'search'
  },
  {
    id: 'speak',
    name: 'Speak Last Response',
    slash: '/speak',
    description: 'Synthesizes and vocalizes JARVIS’s latest response',
    patterns: [
      /^\/speak\b/i,
      /^(read|speak)\s+(this|it|aloud|last\s+response)\b/i,
      /^vocalize\b/i
    ],
    actionType: 'speak'
  },
  {
    id: 'voice_toggle',
    name: 'Toggle Voice',
    slash: '/voice',
    description: 'Toggles voice response output mode on or off',
    patterns: [
      /^\/voice\b/i,
      /^voice\s+(on|off|toggle)\b/i
    ],
    actionType: 'voice_toggle'
  },
  {
    id: 'agent',
    name: 'Agent Mode',
    slash: '/agent',
    description: 'Hands the task to the autonomous desktop/browser agent, right in this chat',
    patterns: [
      /^\/agent\b/i,
      /^agent[:,]?\s+/i,
      /^use\s+agent\s+mode\s+to\b/i
    ],
    actionType: 'agent'
  },
  {
    id: 'terminal',
    name: 'Open Terminal',
    slash: '/terminal',
    description: 'Opens the built-in persistent PowerShell terminal',
    patterns: [
      /^\/terminal\b/i,
      /^\/term\b/i,
      /^open\s+(the\s+)?terminal\b/i
    ],
    actionType: 'terminal'
  },
  {
    id: 'context',
    name: 'Add Context',
    slash: '/context',
    description: 'Opens the safe webpage/document context importer',
    patterns: [
      /^\/context\b/i,
      /^(add|import)\s+(webpage\s+)?context\b/i
    ],
    actionType: 'context'
  },
  {
    id: 'help',
    name: 'Command Help',
    slash: '/help',
    description: 'Displays all available JARVIS protocol commands',
    patterns: [
      /^\/help\b/i,
      /^(show\s+)?commands\b/i,
      /^what\s+can\s+you\s+do\b/i
    ],
    actionType: 'help'
  }
];

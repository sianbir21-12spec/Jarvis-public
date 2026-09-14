import { COMMAND_REGISTRY, JarvisCommand } from './commandRegistry';
import { WebpageContext } from '../types';

export interface CommandParseResult {
  isCommand: boolean;
  command?: JarvisCommand;
  actionType?: JarvisCommand['actionType'];
  rawInput: string;
  augmentedPrompt?: string;
  uiAction?: 'clear' | 'new' | 'speak' | 'voice_toggle' | 'context' | 'help' | 'explain_code' | 'agent' | 'terminal';
  feedback?: string;
  codePayload?: {
    code: string;
    language?: string;
  };
}

export const commandParser = {
  parse(input: string, context?: WebpageContext | null, lastAssistantMessage?: string): CommandParseResult {
    const trimmed = input.trim();
    if (!trimmed) {
      return { isCommand: false, rawInput: input };
    }

    // Match against registered patterns
    for (const cmd of COMMAND_REGISTRY) {
      for (const pattern of cmd.patterns) {
        if (pattern.test(trimmed)) {
          return commandParser.handleMatchedCommand(cmd, trimmed, context, lastAssistantMessage);
        }
      }
    }

    return {
      isCommand: false,
      rawInput: input
    };
  },

  handleMatchedCommand(
    cmd: JarvisCommand,
    rawInput: string,
    context?: WebpageContext | null,
    lastAssistantMessage?: string
  ): CommandParseResult {
    switch (cmd.actionType) {
      case 'clear':
        return {
          isCommand: true,
          command: cmd,
          actionType: 'clear',
          uiAction: 'clear',
          rawInput,
          feedback: 'PROTOCOL: Conversation purged.'
        };

      case 'new':
        return {
          isCommand: true,
          command: cmd,
          actionType: 'new',
          uiAction: 'new',
          rawInput,
          feedback: 'PROTOCOL: Initializing fresh session.'
        };

      case 'speak':
        return {
          isCommand: true,
          command: cmd,
          actionType: 'speak',
          uiAction: 'speak',
          rawInput,
          feedback: lastAssistantMessage ? 'Vocalizing latest response...' : 'No assistant response available to vocalize.'
        };

      case 'voice_toggle':
        return {
          isCommand: true,
          command: cmd,
          actionType: 'voice_toggle',
          uiAction: 'voice_toggle',
          rawInput,
          feedback: 'Toggling speech vocalization.'
        };

      case 'context':
        return {
          isCommand: true,
          command: cmd,
          actionType: 'context',
          uiAction: 'context',
          rawInput,
          feedback: 'Opening context importer.'
        };

      case 'help':
        return {
          isCommand: true,
          command: cmd,
          actionType: 'help',
          uiAction: 'help',
          rawInput,
          feedback: 'Listing available protocols and commands.'
        };

      case 'explain_code': {
        const remaining = rawInput
          .replace(/^\/(explain-code|code-explain|explaincode)\s*/i, '')
          .replace(/^(explain|analyze|review)\s+(this\s+)?code\s*:?\s*/i, '')
          .trim();

        if (!remaining) {
          // No snippet provided -> open CodeExplainerModal
          return {
            isCommand: true,
            command: cmd,
            actionType: 'explain_code',
            uiAction: 'explain_code',
            rawInput,
            feedback: 'Opening Code Analysis & Explanation Protocol.'
          };
        }

        // Parse code snippet and language if enclosed in code blocks
        let extractedCode = remaining;
        let detectedLanguage = '';
        const codeBlockRegex = /```(\w+)?\s*([\s\S]*?)```/;
        const match = codeBlockRegex.exec(remaining);
        if (match) {
          detectedLanguage = match[1] || '';
          extractedCode = match[2].trim();
        }

        const structuredPrompt = `Analyze the following ${detectedLanguage ? detectedLanguage + ' ' : ''}code snippet with technical precision:

\`\`\`${detectedLanguage}
${extractedCode}
\`\`\`

Provide a clear, step-by-step breakdown:
1. **High-Level Purpose & Functionality**: What problem does this code solve and what is its role?
2. **Step-by-Step Logic & Control Flow**: Walk through key functions, variables, loops, and conditions line-by-line or block-by-block.
3. **Complexity & Edge Cases**: Time and space complexity (Big-O analysis), potential runtime bugs, null/undefined checks, or boundary traps.
4. **Actionable Improvements & Optimizations**: Idiomatic best practices, performance improvements, cleaner architecture, and provide an improved/refactored code snippet.`;

        return {
          isCommand: true,
          command: cmd,
          actionType: 'explain_code',
          rawInput,
          augmentedPrompt: structuredPrompt,
          codePayload: {
            code: extractedCode,
            language: detectedLanguage
          }
        };
      }

      case 'explain': {
        const remaining = rawInput.replace(/^\/explain\s*/i, '').replace(/^explain\s+(this\s*)?/i, '').trim();
        let prompt = 'Please explain ';
        if (remaining) {
          prompt += remaining + ' with intuitive analogies, core technical mechanics, and step-by-step breakdown.';
        } else if (context?.text) {
          prompt += `the content and purpose of the imported context titled "${context.title}".`;
        } else {
          prompt += 'the last topic in full detail with foundational clarity.';
        }
        return {
          isCommand: true,
          command: cmd,
          actionType: 'explain',
          rawInput,
          augmentedPrompt: prompt
        };
      }

      case 'code': {
        const remaining = rawInput.replace(/^\/code\s*/i, '').replace(/^write\s+code\s+(for\s+this\s*)?/i, '').trim();
        const prompt = remaining
          ? `Write clean, robust, well-documented production-ready code for: ${remaining}`
          : 'Write clean, robust, well-documented production-ready code for the concept discussed above.';
        return {
          isCommand: true,
          command: cmd,
          actionType: 'code',
          rawInput,
          augmentedPrompt: prompt
        };
      }

      case 'translate': {
        const remaining = rawInput.replace(/^\/translate\s*/i, '').replace(/^translate\s+(this\s*)?/i, '').trim();
        const prompt = remaining
          ? `Translate the following text accurately: ${remaining}`
          : 'Please translate the preceding statement or document into English (or specify the target language).';
        return {
          isCommand: true,
          command: cmd,
          actionType: 'translate',
          rawInput,
          augmentedPrompt: prompt
        };
      }

      case 'analyze_page': {
        let prompt = 'Perform an in-depth analytical breakdown of ';
        if (context?.text) {
          prompt += `the imported webpage context "${context.title}" (URL: ${context.url || 'Pasted Content'}). Highlight key arguments, architecture, takeaways, and implications.`;
        } else {
          prompt += 'the active webpage context or document. (Note: Please attach a webpage context if none is present).';
        }
        return {
          isCommand: true,
          command: cmd,
          actionType: 'analyze_page',
          rawInput,
          augmentedPrompt: prompt
        };
      }

      case 'terminal':
        return {
          isCommand: true,
          command: cmd,
          actionType: 'terminal',
          uiAction: 'terminal',
          rawInput,
          feedback: 'Opening terminal…'
        };

      case 'agent': {
        const task = rawInput
          .replace(/^\/agent\s*/i, '')
          .replace(/^agent[:,]?\s+/i, '')
          .replace(/^use\s+agent\s+mode\s+to\s*/i, '')
          .trim();
        return {
          isCommand: true,
          command: cmd,
          actionType: 'agent',
          uiAction: 'agent',
          rawInput,
          augmentedPrompt: task,
          feedback: task || 'What would you like the agent to do?'
        };
      }

      case 'search': {
        const query = rawInput.replace(/^\/search\s*/i, '').replace(/^search\s+(the\s+web\s+for\s+|web\s+)?/i, '').trim();
        return {
          isCommand: true,
          command: cmd,
          actionType: 'search',
          rawInput,
          augmentedPrompt: `Synthesize the latest technical knowledge and search parameters regarding: "${query}". Provide authoritative insights and search recommendations.`
        };
      }

      default:
        return {
          isCommand: false,
          rawInput
        };
    }
  }
};

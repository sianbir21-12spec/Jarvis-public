import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Conversation, ChatMessage, JarvisState, AppSettings, GatewayHealth, WebpageContext, AttachedFile } from './types';
import { storageService, DEFAULT_SETTINGS } from './services/storage';
import { apiService } from './services/api';
import { voiceService } from './services/voice';
import { commandParser } from './commands/commandParser';
import { StatusIndicator } from './components/StatusIndicator';
import { Sidebar } from './components/Sidebar';
import { Chat } from './components/Chat';
import { InputBar } from './components/InputBar';
import { Settings } from './components/Settings';
import { WebpageContextModal } from './components/WebpageContextModal';
import { CodeExplainerModal } from './components/CodeExplainerModal';
import { AgentPanel } from './components/AgentPanel';
import { TerminalPanel } from './components/TerminalPanel';
import { agentApiService, AgentEvent } from './services/agentApi';

export default function App() {
  // Persistence state
  const [conversations, setConversations] = useState<Conversation[]>(() => storageService.getConversations());
  const [activeId, setActiveId] = useState<string | null>(() => storageService.getActiveConversationId());
  const [settings, setSettings] = useState<AppSettings>(() => storageService.getSettings());

  // System & HUD state
  const [jarvisState, setJarvisState] = useState<JarvisState>('idle');
  const [health, setHealth] = useState<GatewayHealth>({
    status: 'checking',
    model: settings.model,
    gateway: settings.baseUrl
  });

  // UI Modals & Panels
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isContextModalOpen, setIsContextModalOpen] = useState(false);
  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);
  const [isAgentPanelOpen, setIsAgentPanelOpen] = useState(false);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [codeModalInitialSnippet, setCodeModalInitialSnippet] = useState('');
  const [codeModalInitialLang, setCodeModalInitialLang] = useState('typescript');

  // Active interaction state
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [activeContext, setActiveContext] = useState<WebpageContext | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const agentAbortControllerRef = useRef<AbortController | null>(null);
  const agentSessionIdRef = useRef<string | null>(null);
  const agentWarmedRef = useRef(false);

  // Initialize or recover active conversation
  useEffect(() => {
    if (conversations.length === 0) {
      const initial = storageService.createNewConversation('System Protocol Alpha');
      setConversations([initial]);
      setActiveId(initial.id);
    } else if (!activeId || !conversations.some((c) => c.id === activeId)) {
      setActiveId(conversations[0].id);
      storageService.setActiveConversationId(conversations[0].id);
    }
  }, []);

  const activeConversation = conversations.find((c) => c.id === activeId) || conversations[0];

  // Periodic Gateway Health Check
  useEffect(() => {
    const checkGateway = async () => {
      const res = await apiService.checkHealth();
      setHealth(res);
    };
    checkGateway();
    const timer = setInterval(checkGateway, 30000);
    return () => clearInterval(timer);
  }, []);

  // Update conversation helper
  const updateActiveConversation = useCallback(
    (updater: (conv: Conversation) => Conversation) => {
      setConversations((prev) => {
        const index = prev.findIndex((c) => c.id === activeId);
        if (index === -1) return prev;
        const updated = updater(prev[index]);
        const nextList = [...prev];
        nextList[index] = updated;
        storageService.saveConversation(updated);
        return nextList;
      });
    },
    [activeId]
  );

  // Stop vocal speech
  const handleStopSpeaking = useCallback(() => {
    voiceService.stopSpeaking();
    setSpeakingMessageId(null);
    if (jarvisState === 'speaking') {
      setJarvisState('idle');
    }
  }, [jarvisState]);

  // Speak a message
  const handleSpeakMessage = useCallback(
    (text: string, messageId?: string) => {
      if (!settings.voiceEnabled) return;
      handleStopSpeaking();
      setJarvisState('speaking');
      if (messageId) setSpeakingMessageId(messageId);

      voiceService.speak(text, {
        rate: settings.speechRate,
        pitch: settings.speechPitch,
        voiceURI: settings.voiceURI,
        onEnd: () => {
          setJarvisState('idle');
          setSpeakingMessageId(null);
        },
        onError: () => {
          setJarvisState('idle');
          setSpeakingMessageId(null);
        }
      });
    },
    [settings, handleStopSpeaking]
  );

  // Open Code Explainer modal
  const handleOpenCodeExplainer = (code?: string, language?: string) => {
    if (code) {
      setCodeModalInitialSnippet(code);
    } else {
      setCodeModalInitialSnippet('');
    }
    if (language) {
      setCodeModalInitialLang(language);
    }
    setIsCodeModalOpen(true);
  };

  // Submit code explanation directive
  const handleExplainCode = (snippet: string, language?: string, focus = 'comprehensive') => {
    let focusInstruction = '1. High-Level Purpose & Functionality\n2. Step-by-Step Logic & Control Flow\n3. Complexity (Big-O) & Edge Cases\n4. Actionable Improvements & Optimized Code';
    if (focus === 'logic_flow') {
      focusInstruction = '1. Line-by-Line Execution & Control Flow\n2. Variable State Transitions & Data Mutations\n3. Edge Cases & Boundary Behaviors\n4. Recommendations for Clarity';
    } else if (focus === 'performance') {
      focusInstruction = '1. Time Complexity Analysis (Big-O)\n2. Space / Memory Overhead\n3. Performance Bottlenecks\n4. High-Performance Optimized Rewrite';
    } else if (focus === 'refactor') {
      focusInstruction = '1. Code Smells & Architectural Anti-Patterns\n2. Idiomatic Best Practices in ' + (language || 'this language') + '\n3. Modern Clean Code Refactoring with Full Code Rewrite';
    }

    const prompt = `Analyze and explain this ${language || ''} code snippet step-by-step:

\`\`\`${language || ''}
${snippet}
\`\`\`

Provide a clear, step-by-step breakdown covering:
${focusInstruction}`;

    handleSendMessage(prompt);
  };

  // File attachment handling
  const MAX_ATTACHED_FILES = 5;
  const MAX_FILE_READ_BYTES = 300 * 1024; // 300KB of text content per file

  const readFileContent = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const looksTextual =
        file.type.startsWith('text/') ||
        /\.(txt|md|csv|json|js|jsx|ts|tsx|py|java|c|cpp|h|css|html|xml|yml|yaml|sh|log)$/i.test(file.name);

      if (!looksTextual) {
        resolve('[Binary file — content not extracted. File name and type were shared with JARVIS.]');
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result || '');
        resolve(
          text.length > MAX_FILE_READ_BYTES
            ? text.slice(0, MAX_FILE_READ_BYTES) + '\n\n...[truncated]'
            : text
        );
      };
      reader.onerror = () => resolve('[Could not read file content.]');
      reader.readAsText(file);
    });
  };

  const handleAttachFiles = async (fileList: FileList) => {
    const incoming = Array.from(fileList).slice(0, MAX_ATTACHED_FILES - attachedFiles.length);
    if (incoming.length === 0) return;

    const readFiles: AttachedFile[] = await Promise.all(
      incoming.map(async (file) => ({
        id: 'file_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        content: await readFileContent(file)
      }))
    );

    setAttachedFiles((prev) => [...prev, ...readFiles]);
  };

  const handleRemoveFile = (id: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  // Send message or execute command
  // Runs Agent Mode (desktop/browser control) directly inside the normal
  // chat, instead of the separate modal -- triggered by "/agent <task>",
  // "agent: <task>", or "use agent mode to <task>". Tool calls/results
  // stream into a single assistant bubble as a running log, the same way
  // regular streamed replies do, then finalize with the summary.
  const runAgentInline = async (task: string) => {
    if (isStreaming) return;

    const userMessage: ChatMessage = {
      id: 'msg_user_' + Date.now(),
      role: 'user',
      content: task,
      timestamp: Date.now()
    };
    const assistantMsgId = 'msg_assistant_' + (Date.now() + 1);
    const initialAssistantMessage: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '_Starting agent…_',
      timestamp: Date.now(),
      isStreaming: true
    };

    updateActiveConversation((conv) => ({
      ...conv,
      messages: [...conv.messages, userMessage, initialAssistantMessage],
      updatedAt: Date.now()
    }));

    setIsStreaming(true);
    setJarvisState('processing');

    const sessionId = 'agent_' + Date.now();
    agentSessionIdRef.current = sessionId;
    const controller = new AbortController();
    agentAbortControllerRef.current = controller;

    let log = '';
    const appendLine = (line: string) => {
      log += (log ? '\n' : '') + line;
      updateActiveConversation((conv) => {
        const msgs = [...conv.messages];
        const idx = msgs.findIndex((m) => m.id === assistantMsgId);
        if (idx !== -1) msgs[idx] = { ...msgs[idx], content: log, isStreaming: true };
        return { ...conv, messages: msgs, updatedAt: Date.now() };
      });
    };

    const finalizeAgent = (finalText: string, isError = false) => {
      updateActiveConversation((conv) => {
        const msgs = [...conv.messages];
        const idx = msgs.findIndex((m) => m.id === assistantMsgId);
        if (idx !== -1) {
          msgs[idx] = { ...msgs[idx], content: finalText, isStreaming: false, error: isError };
        }
        return { ...conv, messages: msgs, updatedAt: Date.now() };
      });
      setIsStreaming(false);
      agentAbortControllerRef.current = null;
      setJarvisState(isError ? 'error' : 'idle');
      voiceService.playBeep(isError ? 'error' : 'success');
      if (settings.voiceEnabled && settings.autoSpeak && finalText && !isError) {
        handleSpeakMessage(finalText, assistantMsgId);
      }
    };

    const handleEvent = (event: AgentEvent) => {
      switch (event.type) {
        case 'status':
          appendLine(`_${event.message}_`);
          break;
        case 'assistant_text':
          appendLine(event.text);
          break;
        case 'tool_call':
          appendLine(`\`▸ ${event.name}(${JSON.stringify(event.args)})\``);
          break;
        case 'tool_result':
          appendLine(`\`✓ ${event.name}\`: ${event.text.slice(0, 300)}`);
          break;
        case 'done':
          finalizeAgent(log + `\n\n**Done:** ${event.summary}`);
          break;
        case 'error':
          finalizeAgent(log + `\n\n**Error:** ${event.message}`, true);
          break;
      }
    };

    try {
      await agentApiService.runTask({ task, sessionId, signal: controller.signal, onEvent: handleEvent });
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        finalizeAgent(log + `\n\n**Error:** ${err?.message || 'Agent failed unexpectedly.'}`, true);
      }
    } finally {
      setIsStreaming(false);
    }
  };

  const handleSendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || isStreaming) return;

    // Halt any ongoing vocalization
    handleStopSpeaking();

    // Check last assistant message for contextual commands
    const lastAssistantMsg = activeConversation?.messages
      .filter((m) => m.role === 'assistant')
      .slice(-1)[0]?.content;

    // Check command parser
    const parseResult = commandParser.parse(trimmed, activeContext, lastAssistantMsg);

    // If it is a direct UI action
    if (parseResult.isCommand && parseResult.uiAction) {
      setInput('');
      switch (parseResult.uiAction) {
        case 'explain_code':
          handleOpenCodeExplainer(parseResult.codePayload?.code, parseResult.codePayload?.language);
          return;

        case 'clear':
          updateActiveConversation((conv) => ({
            ...conv,
            messages: [],
            updatedAt: Date.now()
          }));
          voiceService.playBeep('success');
          return;

        case 'new':
          handleNewConversation();
          voiceService.playBeep('success');
          return;

        case 'speak':
          if (lastAssistantMsg) {
            handleSpeakMessage(lastAssistantMsg);
          }
          return;

        case 'voice_toggle': {
          const updatedSettings = { ...settings, voiceEnabled: !settings.voiceEnabled };
          setSettings(updatedSettings);
          storageService.saveSettings(updatedSettings);
          voiceService.playBeep(updatedSettings.voiceEnabled ? 'success' : 'stop');
          return;
        }

        case 'context':
          setIsContextModalOpen(true);
          return;

        case 'agent': {
          setInput('');
          const task = (parseResult.augmentedPrompt || '').trim();
          if (!task) {
            setIsAgentPanelOpen(true); // no task text given -- fall back to the full panel
            return;
          }
          runAgentInline(task);
          return;
        }

        case 'terminal':
          setInput('');
          setIsTerminalOpen(true);
          return;

        case 'help': {
          const userMsg: ChatMessage = {
            id: 'msg_' + Date.now(),
            role: 'user',
            content: trimmed,
            timestamp: Date.now()
          };
          const helpReply: ChatMessage = {
            id: 'msg_' + (Date.now() + 1),
            role: 'assistant',
            content: `### ◉ JARVIS PROTOCOL DIRECTORY\n\nAvailable system operations:\n- **/explain-code** or *"Explain this code"*: Deep step-by-step logic, edge cases, and code optimizations.\n- **/explain** or *"Explain this"*: Comprehensive foundational breakdown.\n- **/code** or *"Write code for this"*: Production-grade code generation.\n- **/translate** or *"Translate this"*: Multi-language conversion.\n- **/analyze** or *"Analyze this page"*: Webpage and document context extraction.\n- **/speak** or *"Read this aloud"*: Audio vocalization of latest analysis.\n- **/clear** or *"Clear chat"*: Purge active conversation memory.\n- **/new** or *"New conversation"*: Initialize fresh protocol.\n- **/context**: Open secure webpage and document context importer.\\n- **/agent \\<task\\>** or *\"agent: \\<task\\>\"*: Runs the task with full desktop/browser control, right here in chat (say it or type it — voice dictation works too).\\n- **/terminal**: Opens a real, persistent PowerShell terminal built into JARVIS.`,
            timestamp: Date.now()
          };
          updateActiveConversation((conv) => ({
            ...conv,
            messages: [...conv.messages, userMsg, helpReply],
            updatedAt: Date.now()
          }));
          return;
        }
      }
    }

    const effectivePrompt = parseResult.augmentedPrompt || trimmed;

    // Create user message
    const userMessage: ChatMessage = {
      id: 'msg_user_' + Date.now(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
      context: activeContext || undefined
    };

    // Update conversation title if this is the first message
    const shouldUpdateTitle = activeConversation.messages.length === 0;
    const newTitle = shouldUpdateTitle
      ? trimmed.slice(0, 32) + (trimmed.length > 32 ? '...' : '')
      : activeConversation.title;

    // Temporary assistant message for streaming
    const assistantMsgId = 'msg_assistant_' + (Date.now() + 1);
    const initialAssistantMessage: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true
    };

    // Append to conversation
    updateActiveConversation((conv) => ({
      ...conv,
      title: newTitle,
      messages: [...conv.messages, userMessage, initialAssistantMessage],
      updatedAt: Date.now()
    }));

    setInput('');
    setAttachedFiles([]);
    setIsStreaming(true);
    setJarvisState('processing');

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Prepare message history for backend
    // Format conversation history: include active webpage context in user prompt if present
    const historyPayload = activeConversation.messages
      .filter((m) => !m.error && m.content)
      .map((m) => ({
        role: m.role,
        content: m.content
      }));

    let userFinalContent = effectivePrompt;
    if (activeContext && activeContext.text) {
      userFinalContent = `[WEBPAGE CONTEXT]:\nTitle: ${activeContext.title}\nURL: ${activeContext.url || 'None'}\nContent:\n${activeContext.text}\n${activeContext.selection ? `Focused Selection: ${activeContext.selection}\n` : ''}\n---\nDirective: ${effectivePrompt}`;
    }
    if (attachedFiles.length > 0) {
      const filesBlock = attachedFiles
        .map((f) => `--- File: ${f.name} (${f.type}) ---\n${f.content}`)
        .join('\n\n');
      userFinalContent = `[ATTACHED FILES]:\n${filesBlock}\n\n---\n${userFinalContent}`;
    }

    historyPayload.push({
      role: 'user',
      content: userFinalContent
    });

    let fullAccumulated = '';

    try {
      if (settings.streamingEnabled) {
        await apiService.streamChat({
          messages: historyPayload,
          model: settings.model,
          temperature: settings.temperature,
          maxTokens: settings.maxTokens,
          systemPrompt: settings.systemPrompt,
          signal: abortController.signal,
          onChunk: (chunk) => {
            fullAccumulated += chunk;
            updateActiveConversation((conv) => {
              const msgs = [...conv.messages];
              const targetIdx = msgs.findIndex((m) => m.id === assistantMsgId);
              if (targetIdx !== -1) {
                msgs[targetIdx] = {
                  ...msgs[targetIdx],
                  content: fullAccumulated,
                  isStreaming: true
                };
              }
              return { ...conv, messages: msgs, updatedAt: Date.now() };
            });
          },
          onDone: (finalText) => {
            fullAccumulated = finalText;
            finalizeResponse(finalText, assistantMsgId);
          },
          onError: (err) => {
            handleError(err.message, assistantMsgId);
          }
        });
      } else {
        // Fallback synchronous
        const result = await apiService.sendChatSync({
          messages: historyPayload,
          model: settings.model,
          temperature: settings.temperature,
          maxTokens: settings.maxTokens,
          systemPrompt: settings.systemPrompt
        });
        finalizeResponse(result, assistantMsgId);
      }
    } catch (err: any) {
      handleError(err.message || 'JARVIS cannot reach the AI gateway.', assistantMsgId);
    }
  };

  // Finalize assistant message
  const finalizeResponse = (finalText: string, msgId: string) => {
    setIsStreaming(false);
    abortControllerRef.current = null;

    updateActiveConversation((conv) => {
      const msgs = [...conv.messages];
      const targetIdx = msgs.findIndex((m) => m.id === msgId);
      if (targetIdx !== -1) {
        msgs[targetIdx] = {
          ...msgs[targetIdx],
          content: finalText || 'Protocol execution completed with no data payload.',
          isStreaming: false
        };
      }
      return { ...conv, messages: msgs, updatedAt: Date.now() };
    });

    // Auto-speak if enabled
    if (settings.voiceEnabled && settings.autoSpeak && finalText) {
      handleSpeakMessage(finalText, msgId);
    } else {
      setJarvisState('idle');
      voiceService.playBeep('success');
    }
  };

  // Handle generation error
  const handleError = (errorMessage: string, msgId: string) => {
    setIsStreaming(false);
    setJarvisState('error');
    voiceService.playBeep('error');
    abortControllerRef.current = null;

    updateActiveConversation((conv) => {
      const msgs = [...conv.messages];
      const targetIdx = msgs.findIndex((m) => m.id === msgId);
      if (targetIdx !== -1) {
        msgs[targetIdx] = {
          ...msgs[targetIdx],
          content: `**[SYSTEM ALERT]**: ${errorMessage}\n\nPlease verify that the OmniRoute API is operational and that network connectivity remains established.`,
          error: true,
          errorMessage,
          isStreaming: false
        };
      }
      return { ...conv, messages: msgs, updatedAt: Date.now() };
    });

    setTimeout(() => {
      setJarvisState((cur) => (cur === 'error' ? 'idle' : cur));
    }, 4000);
  };

  // Stop Generation
  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (agentAbortControllerRef.current) {
      agentAbortControllerRef.current.abort();
      agentAbortControllerRef.current = null;
      if (agentSessionIdRef.current) {
        agentApiService.stopTask(agentSessionIdRef.current);
        agentSessionIdRef.current = null;
      }
    }
    setIsStreaming(false);
    setJarvisState('idle');

    updateActiveConversation((conv) => {
      const msgs = [...conv.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'assistant' && last.isStreaming) {
        msgs[msgs.length - 1] = {
          ...last,
          content: (last.content || '') + '\n\n*[Directive generation halted by Commander.]*',
          isStreaming: false
        };
      }
      return { ...conv, messages: msgs, updatedAt: Date.now() };
    });
  };

  // Regenerate last response
  const handleRegenerate = () => {
    if (isStreaming || !activeConversation || activeConversation.messages.length < 2) return;
    const msgs = [...activeConversation.messages];
    // Pop last assistant message
    const last = msgs[msgs.length - 1];
    if (last.role === 'assistant') {
      msgs.pop();
    }
    const lastUserMsg = msgs[msgs.length - 1];
    if (!lastUserMsg || lastUserMsg.role !== 'user') return;

    // Reset conversation without last assistant response
    updateActiveConversation((conv) => ({
      ...conv,
      messages: msgs,
      updatedAt: Date.now()
    }));

    // Re-send user prompt
    handleSendMessage(lastUserMsg.content);
  };

  // Voice recognition toggle
  const handleToggleVoiceListening = () => {
    if (isListening) {
      // Electron records until you click again, then transcribes.
      voiceService.stopListening();
      setJarvisState('processing');
      return;
    }

    handleStopSpeaking();
    setIsListening(true);
    setJarvisState('listening');

    voiceService.startListening({
      onResult: (transcript, isFinal) => {
        setInput(transcript);
        if (isFinal && transcript.trim() && transcript !== 'Transcribing speech…') {
          setIsListening(false);
          setJarvisState('processing');
          handleSendMessage(transcript);
        }
      },
      onEnd: () => {
        setIsListening(false);
        setJarvisState((prev) => (prev === 'listening' ? 'idle' : prev));
      },
      onError: (errMsg) => {
        setIsListening(false);
        setJarvisState('error');
        alert(errMsg);
        setTimeout(() => setJarvisState('idle'), 2500);
      }
    });
  };

  // Conversation Management
  const handleNewConversation = () => {
    handleStopSpeaking();
    if (isStreaming) handleStopGeneration();
    const newConv = storageService.createNewConversation(`Protocol #${conversations.length + 1}`);
    setConversations((prev) => [newConv, ...prev]);
    setActiveId(newConv.id);
  };

  const handleDeleteConversation = (id: string) => {
    storageService.deleteConversation(id);
    const remaining = conversations.filter((c) => c.id !== id);
    setConversations(remaining);
    if (activeId === id) {
      const nextId = remaining.length > 0 ? remaining[0].id : null;
      setActiveId(nextId);
      storageService.setActiveConversationId(nextId);
      if (!nextId) {
        handleNewConversation();
      }
    }
  };

  const handleRenameConversation = (id: string, newTitle: string) => {
    setConversations((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, title: newTitle, updatedAt: Date.now() } : c));
      const target = next.find((c) => c.id === id);
      if (target) storageService.saveConversation(target);
      return next;
    });
  };

  const handleClearAllConversations = () => {
    storageService.clearAllConversations();
    const fresh = storageService.createNewConversation('System Protocol Alpha');
    setConversations([fresh]);
    setActiveId(fresh.id);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#040711] text-slate-100 cyber-grid select-text">
      {/* Sidebar with Conversation Management */}
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelectConversation={(id) => {
          handleStopSpeaking();
          setActiveId(id);
          storageService.setActiveConversationId(id);
        }}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        onRenameConversation={handleRenameConversation}
        onClearAll={handleClearAllConversations}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main Command Center Layout */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        {/* Top Status HUD Indicator */}
        <StatusIndicator
          health={health}
          voiceEnabled={settings.voiceEnabled}
          onToggleVoice={() => {
            const next = { ...settings, voiceEnabled: !settings.voiceEnabled };
            setSettings(next);
            storageService.saveSettings(next);
            voiceService.playBeep(next.voiceEnabled ? 'success' : 'stop');
          }}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
          onOpenContextModal={() => setIsContextModalOpen(true)}
          activeContext={activeContext}
          onOpenCodeExplainer={() => handleOpenCodeExplainer()}
          onOpenAgentPanel={() => {
            agentApiService.warmup();
            setIsAgentPanelOpen(true);
          }}
          onOpenTerminal={() => setIsTerminalOpen(true)}
        />

        {/* Conversation Message Stage & Central JARVIS Core */}
        <Chat
          messages={activeConversation?.messages || []}
          state={jarvisState}
          isStreaming={isStreaming}
          onRegenerate={handleRegenerate}
          onSpeakMessage={(text) => handleSpeakMessage(text)}
          onStopSpeaking={handleStopSpeaking}
          speakingMessageId={speakingMessageId}
          onSelectPrompt={(p) => handleSendMessage(p)}
          onCoreClick={handleToggleVoiceListening}
          activeContext={activeContext}
          onExplainCode={(code, lang) => handleOpenCodeExplainer(code, lang)}
          onOpenCodeExplainer={() => handleOpenCodeExplainer()}
        />

        {/* Bottom Command Bar */}
        <InputBar
          input={input}
          setInput={(value: string) => {
            // Warm the gateway connection the moment "/agent" or "agent:"
            // starts appearing, well before the user finishes typing and
            // hits enter -- by the time they submit, the handshake is
            // already done. warmup() is a no-op-cheap fire-and-forget, and
            // React/browsers will naturally coalesce/dedupe rapid repeats
            // via the underlying keep-alive connection, so it's fine to
            // call this on every keystroke rather than debouncing.
            if (!agentWarmedRef.current && /^\/agent\b|^agent[:,]?\s/i.test(value)) {
              agentWarmedRef.current = true;
              agentApiService.warmup();
            } else if (agentWarmedRef.current && !/^\/agent\b|^agent[:,]?\s/i.test(value)) {
              agentWarmedRef.current = false;
            }
            setInput(value);
          }}
          onSubmit={handleSendMessage}
          onStop={handleStopGeneration}
          isStreaming={isStreaming}
          state={jarvisState}
          isListening={isListening}
          onToggleListen={handleToggleVoiceListening}
          enterToSend={settings.enterToSend}
          activeContext={activeContext}
          onClearContext={() => setActiveContext(null)}
          onOpenContextModal={() => setIsContextModalOpen(true)}
          onOpenCodeExplainer={() => handleOpenCodeExplainer()}
          attachedFiles={attachedFiles}
          onAttachFiles={handleAttachFiles}
          onRemoveFile={handleRemoveFile}
        />
      </div>

      {/* Settings Modal */}
      <Settings
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSaveSettings={(next) => {
          setSettings(next);
          storageService.saveSettings(next);
        }}
        health={health}
      />

      {/* Webpage Context Importer Modal */}
      <WebpageContextModal
        isOpen={isContextModalOpen}
        onClose={() => setIsContextModalOpen(false)}
        activeContext={activeContext}
        onApplyContext={(ctx) => setActiveContext(ctx)}
      />

      {/* Code Explainer & Analysis Protocol Modal */}
      <CodeExplainerModal
        isOpen={isCodeModalOpen}
        onClose={() => setIsCodeModalOpen(false)}
        onSubmitCode={handleExplainCode}
        initialCode={codeModalInitialSnippet}
        initialLanguage={codeModalInitialLang}
      />

      {/* Agent Mode: autonomous desktop & browser control */}
      <AgentPanel isOpen={isAgentPanelOpen} onClose={() => setIsAgentPanelOpen(false)} />
      <TerminalPanel isOpen={isTerminalOpen} onClose={() => setIsTerminalOpen(false)} />
    </div>
  );
}

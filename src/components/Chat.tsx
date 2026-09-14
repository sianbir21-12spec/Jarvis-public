import React, { useRef, useEffect } from 'react';
import { ChatMessage, JarvisState, WebpageContext } from '../types';
import { Message } from './Message';
import { JarvisCore } from './JarvisCore';
import { Sparkles, Terminal, Mic, Globe, Shield, Zap, Code2, BookmarkCheck } from 'lucide-react';

interface ChatProps {
  messages: ChatMessage[];
  state: JarvisState;
  isStreaming: boolean;
  onRegenerate: () => void;
  onSpeakMessage: (text: string) => void;
  onStopSpeaking: () => void;
  speakingMessageId: string | null;
  onSelectPrompt: (prompt: string) => void;
  onCoreClick: () => void;
  activeContext?: WebpageContext | null;
  onExplainCode?: (code: string, language?: string) => void;
  onOpenCodeExplainer?: () => void;
}

export const Chat: React.FC<ChatProps> = ({
  messages,
  state,
  isStreaming,
  onRegenerate,
  onSpeakMessage,
  onStopSpeaking,
  speakingMessageId,
  onSelectPrompt,
  onCoreClick,
  activeContext,
  onExplainCode,
  onOpenCodeExplainer
}) => {
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages or streaming chunks
  useEffect(() => {
    if (scrollEndRef.current) {
      scrollEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isStreaming]);

  return (
    <div 
      id="jarvis-chat-area"
      ref={containerRef}
      className="flex-1 overflow-y-auto custom-scrollbar flex flex-col relative"
    >
      {/* Central JARVIS Visual Core Indicator */}
      <div className="sticky top-0 z-10 py-2 bg-slate-950/70 backdrop-blur-md border-b border-cyan-500/10">
        <JarvisCore state={state} onCoreClick={onCoreClick} />
      </div>

      {/* Messages list or Welcome Empty State */}
      {messages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/50 border border-cyan-500/40 text-cyan-300 text-xs font-mono mb-4">
            <Zap className="w-3.5 h-3.5 text-cyan-400" />
            <span>JARVIS SYSTEM READY • MODEL: SIAN</span>
          </div>

          <h2 className="text-xl md:text-3xl font-hud font-bold tracking-wider text-slate-100 mb-2">
            AT YOUR SERVICE, COMMANDER
          </h2>
          <p className="text-xs md:text-sm text-slate-400 font-mono max-w-lg mb-8 leading-relaxed">
            Neural gateway active through OmniRoute. Speech synthesis, real-time streaming, code analysis, and file context ingestion online.
          </p>

          {/* Quick Prompt Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full text-left">
            <button
              onClick={() => onOpenCodeExplainer ? onOpenCodeExplainer() : onSelectPrompt('/explain-code')}
              className="p-3.5 rounded-xl bg-slate-900/60 hover:bg-cyan-950/40 border border-cyan-500/20 hover:border-cyan-500/50 transition-all text-slate-300 hover:text-cyan-200 group"
            >
              <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono font-semibold mb-1">
                <Code2 className="w-4 h-4" />
                <span>CODE EXPLAINER & AUDIT</span>
              </div>
              <p className="text-xs text-slate-400 group-hover:text-slate-300">
                Step-by-step logic breakdown, edge cases, and performance optimizations.
              </p>
            </button>

            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-cyan-500/20 text-slate-300">
              <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono font-semibold mb-1">
                <BookmarkCheck className="w-4 h-4" />
                <span>FILE UPLOAD</span>
              </div>
              <p className="text-xs text-slate-400">
                Use the upload icon in the command bar to attach files to your message.
              </p>
            </div>

            <button
              onClick={() => onSelectPrompt('Provide an architectural breakdown of modern AI gateway routing and streaming SSE protocols.')}
              className="p-3.5 rounded-xl bg-slate-900/60 hover:bg-cyan-950/40 border border-cyan-500/20 hover:border-cyan-500/50 transition-all text-slate-300 hover:text-cyan-200 group"
            >
              <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono font-semibold mb-1">
                <Terminal className="w-4 h-4" />
                <span>SYSTEM ARCHITECTURE</span>
              </div>
              <p className="text-xs text-slate-400 group-hover:text-slate-300">
                Explain AI gateway routing, latency optimization, and SSE mechanics.
              </p>
            </button>

            <button
              onClick={() => onSelectPrompt('/analyze')}
              className="p-3.5 rounded-xl bg-slate-900/60 hover:bg-cyan-950/40 border border-cyan-500/20 hover:border-cyan-500/50 transition-all text-slate-300 hover:text-cyan-200 group"
            >
              <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono font-semibold mb-1">
                <Globe className="w-4 h-4" />
                <span>CONTEXT EXTRACTION</span>
              </div>
              <p className="text-xs text-slate-400 group-hover:text-slate-300">
                Analyze imported webpage text, document summaries, or URL extracts.
              </p>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 pb-4">
          {messages.map((msg, index) => (
            <Message
              key={msg.id || index}
              message={msg}
              onRegenerate={
                index === messages.length - 1 && msg.role === 'assistant'
                  ? onRegenerate
                  : undefined
              }
              onSpeak={onSpeakMessage}
              onStopSpeaking={onStopSpeaking}
              isSpeakingThis={speakingMessageId === msg.id}
              onExplainCode={onExplainCode}
            />
          ))}
          <div ref={scrollEndRef} />
        </div>
      )}
    </div>
  );
};

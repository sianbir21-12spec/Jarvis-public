import React, { useState, useRef, useEffect } from 'react';
import { Send, Square, Sparkles, X, Terminal, Paperclip, FileText, Code2, Upload } from 'lucide-react';
import { VoiceButton } from './VoiceButton';
import { JarvisState, WebpageContext, AttachedFile } from '../types';
import { COMMAND_REGISTRY } from '../commands/commandRegistry';

interface InputBarProps {
  input: string;
  setInput: (text: string) => void;
  onSubmit: (text: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  state: JarvisState;
  isListening: boolean;
  onToggleListen: () => void;
  enterToSend: boolean;
  activeContext?: WebpageContext | null;
  onClearContext?: () => void;
  onOpenContextModal?: () => void;
  onOpenCodeExplainer?: () => void;
  attachedFiles?: AttachedFile[];
  onAttachFiles?: (files: FileList) => void;
  onRemoveFile?: (id: string) => void;
}

export const InputBar: React.FC<InputBarProps> = ({
  input,
  setInput,
  onSubmit,
  onStop,
  isStreaming,
  state,
  isListening,
  onToggleListen,
  enterToSend,
  activeContext,
  onClearContext,
  onOpenContextModal,
  onOpenCodeExplainer,
  attachedFiles,
  onAttachFiles,
  onRemoveFile
}) => {
  const [showCommands, setShowCommands] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(textareaRef.current.scrollHeight, 180);
      textareaRef.current.style.height = `${Math.max(48, newHeight)}px`;
    }
  }, [input]);

  // Handle command autocompletion suggestions
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    if (val.startsWith('/') && !val.includes(' ')) {
      setShowCommands(true);
    } else {
      setShowCommands(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && enterToSend) {
      e.preventDefault();
      if (input.trim() && !isStreaming) {
        onSubmit(input);
        setShowCommands(false);
      }
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isStreaming) {
      onSubmit(input);
      setShowCommands(false);
    }
  };

  const handleSelectCommand = (slash: string) => {
    setInput(slash + ' ');
    setShowCommands(false);
    textareaRef.current?.focus();
  };

  const filteredCommands = COMMAND_REGISTRY.filter((c) =>
    c.slash.toLowerCase().startsWith(input.trim().toLowerCase())
  );

  return (
    <div 
      id="jarvis-bottom-console" 
      className="p-3 md:p-4 bg-slate-950/90 backdrop-blur-lg border-t border-cyan-500/20 relative z-20"
    >
      {/* Autocomplete slash commands dropdown */}
      {showCommands && filteredCommands.length > 0 && (
        <div className="absolute bottom-full left-4 right-4 mb-2 max-w-xl mx-auto bg-slate-900/95 border border-cyan-500/40 rounded-xl p-2 shadow-2xl backdrop-blur-xl z-30 max-h-56 overflow-y-auto custom-scrollbar">
          <div className="text-[10px] font-mono text-cyan-400 px-2 py-1 flex items-center gap-1.5 border-b border-cyan-500/20 mb-1">
            <Terminal className="w-3 h-3" />
            <span>JARVIS SYSTEM COMMAND DIRECTORY</span>
          </div>
          {filteredCommands.map((cmd) => (
            <button
              key={cmd.id}
              type="button"
              onClick={() => handleSelectCommand(cmd.slash)}
              className="w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between hover:bg-cyan-950/50 hover:border-cyan-500/30 border border-transparent transition-colors group"
            >
              <span className="font-mono text-xs font-semibold text-cyan-300 group-hover:text-cyan-200">
                {cmd.slash}
              </span>
              <span className="text-xs text-slate-400 font-mono tracking-tight">
                {cmd.description}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="max-w-4xl mx-auto flex flex-col gap-2">
        {/* Context Preview Pill if context is attached */}
        {activeContext && (
          <div className="flex items-center justify-between px-3 py-1 bg-indigo-950/40 border border-indigo-500/30 rounded-lg text-xs font-mono text-indigo-200">
            <div className="flex items-center gap-2 truncate">
              <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="text-indigo-400 font-semibold">Web Context:</span>
              <span className="truncate">{activeContext.title || activeContext.url || 'Pasted Document'}</span>
            </div>
            <button
              onClick={onClearContext}
              title="Remove attached webpage context"
              className="p-1 hover:text-red-400 text-slate-400 transition-colors ml-2"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Attached files preview pills */}
        {attachedFiles && attachedFiles.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {attachedFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-cyan-950/40 border border-cyan-500/30 rounded-lg text-xs font-mono text-cyan-200"
              >
                <FileText className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="truncate max-w-[160px]">{file.name}</span>
                <button
                  type="button"
                  onClick={() => onRemoveFile?.(file.id)}
                  title="Remove attached file"
                  className="p-0.5 hover:text-red-400 text-slate-400 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input Bar Form */}
        <form onSubmit={handleFormSubmit} className="relative flex items-end gap-2 bg-slate-900/60 rounded-2xl p-1.5 border border-cyan-500/30 focus-within:border-cyan-400/80 focus-within:shadow-[0_0_20px_rgba(6,182,212,0.2)] transition-all">
          {/* Voice Input Button */}
          <VoiceButton
            state={state}
            isListening={isListening}
            onToggleListen={onToggleListen}
            disabled={isStreaming}
          />

          {/* Context attachment quick trigger */}
          <button
            type="button"
            onClick={onOpenContextModal}
            title="Import Webpage or Text Context"
            className="p-2 text-slate-400 hover:text-cyan-300 hover:bg-cyan-950/40 rounded-xl transition-colors shrink-0"
          >
            <Paperclip className="w-5 h-5" />
          </button>

          {/* Code Explainer quick trigger */}
          {onOpenCodeExplainer && (
            <button
              type="button"
              id="inputbar-code-explainer-btn"
              onClick={onOpenCodeExplainer}
              title="Explain Code Snippet with JARVIS (/explain-code)"
              className="p-2 text-slate-400 hover:text-cyan-300 hover:bg-cyan-950/40 rounded-xl transition-colors shrink-0"
            >
              <Code2 className="w-5 h-5" />
            </button>
          )}

          {/* File Upload quick trigger */}
          {onAttachFiles && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    onAttachFiles(e.target.files);
                  }
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                id="inputbar-upload-btn"
                onClick={() => fileInputRef.current?.click()}
                title="Upload files to include in your message"
                className="p-2 text-slate-400 hover:text-cyan-300 hover:bg-cyan-950/40 rounded-xl transition-colors shrink-0"
              >
                <Upload className="w-5 h-5" />
              </button>
            </>
          )}

          {/* Multiline textarea */}
          <textarea
            ref={textareaRef}
            id="jarvis-command-input"
            rows={1}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            placeholder={
              isListening
                ? 'JARVIS is listening to your speech...'
                : 'Ask JARVIS or type / for command protocols...'
            }
            className="flex-1 bg-transparent text-slate-100 placeholder-slate-500 text-sm md:text-base font-mono resize-none focus:outline-none px-2 py-2.5 max-h-44 custom-scrollbar"
          />

          {/* Action Button: Send or Stop */}
          {isStreaming ? (
            <button
              id="btn-stop-generation"
              type="button"
              onClick={onStop}
              aria-label="Stop Generation"
              className="p-2.5 rounded-xl bg-red-600/90 text-white hover:bg-red-500 transition-colors shadow-lg flex items-center justify-center shrink-0"
              title="Abort response generation"
            >
              <Square className="w-4 h-4 fill-current" />
            </button>
          ) : (
            <button
              id="btn-send-command"
              type="submit"
              disabled={!input.trim()}
              aria-label="Send Directive"
              className={`p-2.5 rounded-xl transition-all duration-200 flex items-center justify-center shrink-0 ${
                input.trim()
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-[0_0_15px_rgba(6,182,212,0.4)] hover:brightness-110'
                  : 'bg-slate-800/60 text-slate-600 cursor-not-allowed'
              }`}
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </form>

        {/* Command shortcut pills */}
        <div className="hidden sm:flex items-center gap-1.5 overflow-x-auto custom-scrollbar py-0.5 text-[11px] font-mono text-slate-400">
          <span className="text-cyan-400/80 mr-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> Quick:
          </span>
          {[
            { label: '/explain-code', text: '/explain-code ' },
            { label: '/explain', text: '/explain ' },
            { label: '/code', text: '/code ' },
            { label: '/analyze', text: '/analyze ' },
            { label: '/clear', text: '/clear' }
          ].map((pill) => (
            <button
              key={pill.label}
              type="button"
              onClick={() => handleSelectCommand(pill.text)}
              className="px-2 py-0.5 rounded-md bg-slate-900/60 hover:bg-cyan-950/60 border border-cyan-500/20 hover:border-cyan-500/40 text-slate-300 hover:text-cyan-300 transition-colors"
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

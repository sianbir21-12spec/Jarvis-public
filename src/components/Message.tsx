import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ChatMessage } from '../types';
import { Copy, Check, Volume2, VolumeX, RotateCcw, User, Cpu, AlertCircle, FileText, Sparkles, Download, Loader2 } from 'lucide-react';
import { fileGenService, ExportFormat } from '../services/fileGen';

interface MessageProps {
  message: ChatMessage;
  onRegenerate?: () => void;
  onSpeak?: (text: string) => void;
  onStopSpeaking?: () => void;
  isSpeakingThis?: boolean;
  onExplainCode?: (code: string, language?: string) => void;
}

export const Message: React.FC<MessageProps> = ({
  message,
  onRegenerate,
  onSpeak,
  onStopSpeaking,
  isSpeakingThis = false,
  onExplainCode
}) => {
  const [copied, setCopied] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const isUser = message.role === 'user';
  const isError = message.error;

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = async (format: ExportFormat) => {
    setExportMenuOpen(false);
    setExportError(null);
    setExporting(format);
    try {
      await fileGenService.exportAs(format, message.content, fileGenService.suggestFilename(message.content));
    } catch (err: any) {
      setExportError(err?.message || `Failed to export as ${format.toUpperCase()}.`);
      setTimeout(() => setExportError(null), 4000);
    } finally {
      setExporting(null);
    }
  };

  const EXPORT_OPTIONS: { format: ExportFormat; label: string }[] = [
    { format: 'md', label: 'Markdown (.md)' },
    { format: 'txt', label: 'Plain Text (.txt)' },
    { format: 'docx', label: 'Word (.docx)' },
    { format: 'pdf', label: 'PDF (.pdf)' },
    { format: 'xlsx', label: 'Excel (.xlsx)' }
  ];

  const formattedTime = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div
      id={`message-${message.id}`}
      className={`group w-full py-4 px-3 md:px-6 transition-colors ${
        isUser
          ? 'bg-transparent'
          : isError
          ? 'bg-red-950/20 border-y border-red-500/20'
          : 'bg-slate-900/30 border-y border-cyan-500/10'
      }`}
    >
      <div className="max-w-4xl mx-auto flex gap-3 md:gap-4">
        {/* Avatar */}
        <div className="shrink-0 pt-0.5">
          {isUser ? (
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-sky-600 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-cyan-500/10">
              <User className="w-4 h-4" />
            </div>
          ) : (
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-cyan-300 border ${
              isError
                ? 'bg-red-950 border-red-500/40 text-red-400'
                : 'bg-slate-950 border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
            }`}>
              {isError ? <AlertCircle className="w-4 h-4" /> : <Cpu className="w-4 h-4" />}
            </div>
          )}
        </div>

        {/* Content & Metadata */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-hud font-semibold tracking-wider ${
                isUser ? 'text-sky-300' : isError ? 'text-red-400' : 'text-cyan-300'
              }`}>
                {isUser ? 'COMMANDER' : 'J.A.R.V.I.S.'}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {formattedTime}
              </span>
            </div>

            {/* Actions Toolbar */}
            <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
              {/* Copy message */}
              <button
                onClick={handleCopy}
                title="Copy Message Text"
                className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-slate-800/60 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>

              {/* Export / Save as file */}
              {!isUser && !isError && (
                <div className="relative">
                  <button
                    onClick={() => setExportMenuOpen((v) => !v)}
                    title="Save Response as File"
                    disabled={exporting !== null}
                    className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-slate-800/60 transition-colors disabled:opacity-50"
                  >
                    {exporting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {exportMenuOpen && (
                    <>
                      {/* Backdrop to close on outside click */}
                      <div className="fixed inset-0 z-10" onClick={() => setExportMenuOpen(false)} />
                      <div className="absolute right-0 mt-1 z-20 w-40 rounded-lg border border-cyan-500/20 bg-slate-950/95 backdrop-blur-md shadow-xl py-1">
                        {EXPORT_OPTIONS.map((opt) => (
                          <button
                            key={opt.format}
                            onClick={() => handleExport(opt.format)}
                            className="w-full text-left px-3 py-1.5 text-xs font-mono text-slate-300 hover:text-cyan-300 hover:bg-cyan-950/40 transition-colors"
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {exportError && (
                    <div className="absolute right-0 mt-1 z-20 w-48 rounded-lg border border-red-500/30 bg-red-950/90 px-2 py-1.5 text-[11px] font-mono text-red-300">
                      {exportError}
                    </div>
                  )}
                </div>
              )}

              {/* Speak / Vocalize */}
              {!isUser && !isError && onSpeak && (
                <button
                  onClick={() => {
                    if (isSpeakingThis) {
                      onStopSpeaking?.();
                    } else {
                      onSpeak(message.content);
                    }
                  }}
                  title={isSpeakingThis ? 'Halt Vocalization' : 'Vocalize Response'}
                  className={`p-1 rounded transition-colors ${
                    isSpeakingThis
                      ? 'text-cyan-400 bg-cyan-950/60'
                      : 'text-slate-400 hover:text-cyan-300 hover:bg-slate-800/60'
                  }`}
                >
                  {isSpeakingThis ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                </button>
              )}

              {/* Regenerate */}
              {!isUser && onRegenerate && (
                <button
                  onClick={onRegenerate}
                  title="Regenerate Analysis"
                  className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-slate-800/60 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Attached Context Badge if user attached webpage context */}
          {message.context && (
            <div className="mb-2 p-2 rounded-lg bg-indigo-950/30 border border-indigo-500/30 text-xs font-mono text-indigo-300 flex items-start gap-2">
              <FileText className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
              <div className="overflow-hidden">
                <span className="font-semibold block truncate">
                  Context: {message.context.title || message.context.url}
                </span>
                {message.context.url && (
                  <span className="text-[10px] text-slate-400 block truncate">{message.context.url}</span>
                )}
              </div>
            </div>
          )}

          {/* Message Text Body */}
          <div className="text-sm md:text-base leading-relaxed text-slate-200">
            {isUser ? (
              <p className="whitespace-pre-wrap font-sans">{message.content}</p>
            ) : (
              <div className={`markdown-body font-sans ${message.isStreaming ? 'terminal-cursor' : ''}`}>
                <ReactMarkdown
                  components={{
                    code({ node, className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || '');
                      const isInline = !match && !String(children).includes('\n');
                      const codeContent = String(children).replace(/\n$/, '');

                      if (isInline) {
                        return <code className={className} {...props}>{children}</code>;
                      }

                      return (
                        <div className="my-3 rounded-lg overflow-hidden border border-cyan-500/25 bg-slate-950/90 shadow-lg">
                          <div className="px-3 py-1.5 bg-slate-900 border-b border-cyan-500/20 flex items-center justify-between text-xs font-mono text-cyan-400">
                            <span>{match ? match[1].toUpperCase() : 'CODE'}</span>
                            <div className="flex items-center gap-3">
                              {onExplainCode && (
                                <button
                                  type="button"
                                  onClick={() => onExplainCode(codeContent, match ? match[1] : undefined)}
                                  className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-200 transition-colors"
                                  title="Explain this code step-by-step with JARVIS"
                                >
                                  <Sparkles className="w-3 h-3" /> Explain
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(codeContent);
                                }}
                                className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-cyan-300 transition-colors"
                              >
                                <Copy className="w-3 h-3" /> Copy
                              </button>
                            </div>
                          </div>
                          <pre className="p-3 text-xs md:text-sm font-mono-code text-cyan-100 overflow-x-auto custom-scrollbar">
                            <code>{children}</code>
                          </pre>
                        </div>
                      );
                    }
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

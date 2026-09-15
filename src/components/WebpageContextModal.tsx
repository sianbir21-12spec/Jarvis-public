import React, { useState } from 'react';
import { WebpageContext } from '../types';
import { apiService } from '../services/api';
import { Globe, FileText, X, Check, Loader2, AlertCircle, Sparkles } from 'lucide-react';

interface WebpageContextModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeContext?: WebpageContext | null;
  onApplyContext: (context: WebpageContext | null) => void;
}

export const WebpageContextModal: React.FC<WebpageContextModalProps> = ({
  isOpen,
  onClose,
  activeContext,
  onApplyContext
}) => {
  const [mode, setMode] = useState<'url' | 'text'>('url');
  const [url, setUrl] = useState(activeContext?.url || '');
  const [title, setTitle] = useState(activeContext?.title || '');
  const [text, setText] = useState(activeContext?.text || '');
  const [selection, setSelection] = useState(activeContext?.selection || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFetchUrl = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const extracted = await apiService.extractWebpageContext({ url: url.trim() });
      setTitle(extracted.title || url);
      setText(extracted.text || '');
    } catch (err: any) {
      setError(err.message || 'Unable to fetch URL contents. Please paste text directly.');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (!text.trim() && !url.trim()) {
      setError('Please provide a URL or paste text content.');
      return;
    }

    let derivedTitle = 'Pasted Web Context';
    if (url.trim()) {
      try {
        derivedTitle = new URL(url.trim()).hostname;
      } catch {
        derivedTitle = url.trim();
      }
    }

    const newContext: WebpageContext = {
      url: url.trim(),
      title: title.trim() || derivedTitle,
      text: text.trim(),
      selection: selection.trim() || undefined,
      timestamp: Date.now()
    };

    onApplyContext(newContext);
    onClose();
  };

  const handleClear = () => {
    onApplyContext(null);
    onClose();
  };

  const loadSample = () => {
    setTitle('Quantum Supremacy & Entanglement Overview');
    setUrl('https://en.wikipedia.org/wiki/Quantum_supremacy');
    setText(
      'Quantum supremacy or quantum advantage is the demonstration that a programmable quantum device can solve a problem that no classical supercomputer can solve in any feasible amount of time. The concept was coined by John Preskill in 2012. Quantum computing relies on qubits, which can exist in superpositions and entangled states, opening vast parallel state spaces.'
    );
    setMode('text');
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-slate-950 border border-cyan-500/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-cyan-500/20 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-cyan-400" />
            <h2 className="text-sm font-hud font-bold tracking-wider text-cyan-200">
              WEBPAGE CONTEXT PROTOCOL
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notice */}
        <div className="px-4 py-2 bg-cyan-950/30 border-b border-cyan-500/20 text-[11px] font-mono text-cyan-300/80">
          Safe in-browser architecture: Import public web articles or paste selection context to ground JARVIS responses.
        </div>

        {/* Content Tabs & Form */}
        <div className="p-4 overflow-y-auto custom-scrollbar space-y-4">
          {error && (
            <div className="p-2.5 rounded-lg bg-red-950/50 border border-red-500/40 text-xs font-mono text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Mode Selector */}
          <div className="flex rounded-lg bg-slate-900 p-1 border border-cyan-500/20">
            <button
              type="button"
              onClick={() => setMode('url')}
              className={`flex-1 py-1.5 text-xs font-mono rounded-md transition-colors ${
                mode === 'url' ? 'bg-cyan-950/80 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Public URL Fetch
            </button>
            <button
              type="button"
              onClick={() => setMode('text')}
              className={`flex-1 py-1.5 text-xs font-mono rounded-md transition-colors ${
                mode === 'text' ? 'bg-cyan-950/80 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Paste Web Content / Text
            </button>
          </div>

          {/* URL Input */}
          {mode === 'url' && (
            <div className="space-y-2">
              <label className="text-xs font-mono text-slate-300">Target Webpage URL:</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/article"
                  className="flex-1 bg-slate-900 border border-cyan-500/30 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
                />
                <button
                  type="button"
                  onClick={handleFetchUrl}
                  disabled={loading || !url.trim()}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-mono text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Fetch'}
                </button>
              </div>
            </div>
          )}

          {/* Context Details */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-mono text-slate-300 mb-1 block">Context Title:</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Research Brief on Autonomous Agents"
                className="w-full bg-slate-900 border border-cyan-500/30 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-mono text-slate-300">Webpage Text / Content:</label>
                <span className="text-[10px] font-mono text-slate-500">
                  {text.length} chars (approx {Math.round(text.length / 4)} tokens)
                </span>
              </div>
              <textarea
                rows={5}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste webpage article, documentation, or source text here..."
                className="w-full bg-slate-900 border border-cyan-500/30 rounded-xl p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400 custom-scrollbar"
              />
            </div>

            <div>
              <label className="text-xs font-mono text-slate-300 mb-1 block">Selected Snippet (Optional Focus):</label>
              <input
                type="text"
                value={selection}
                onChange={(e) => setSelection(e.target.value)}
                placeholder="Specific highlighted passage or paragraph..."
                className="w-full bg-slate-900 border border-cyan-500/30 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={loadSample}
              className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
            >
              <Sparkles className="w-3 h-3" /> Load Sample Quantum Physics Context
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-cyan-500/20 bg-slate-900/60 flex items-center justify-between">
          {activeContext ? (
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-1.5 rounded-lg text-xs font-mono text-red-400 hover:bg-red-950/50 border border-red-500/30 transition-colors"
            >
              Detach Context
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-mono text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-mono text-xs font-bold shadow-[0_0_12px_rgba(6,182,212,0.3)] hover:brightness-110 transition-all flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Link Context to JARVIS</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

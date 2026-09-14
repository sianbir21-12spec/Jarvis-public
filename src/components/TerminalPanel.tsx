import React, { useEffect, useRef, useState } from 'react';
import { X, TerminalSquare, RotateCcw, Send } from 'lucide-react';
import { terminalApiService, TerminalChunk } from '../services/terminalApi';

interface TerminalPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TerminalPanel: React.FC<TerminalPanelProps> = ({ isOpen, onClose }) => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [output, setOutput] = useState('');
  const [command, setCommand] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');
  const outputEndRef = useRef<HTMLDivElement | null>(null);
  const closeStreamRef = useRef<(() => void) | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const historyRef = useRef<string[]>([]);
  const historyIdxRef = useRef(-1);

  // Start a session the first time the panel opens; keep it alive across
  // close/reopen so scrollback and any long-running process persist.
  useEffect(() => {
    if (!isOpen || sessionId) return;
    setError('');
    terminalApiService
      .start()
      .then(({ sessionId: id }) => {
        setSessionId(id);
        closeStreamRef.current = terminalApiService.streamOutput(id, (chunk: TerminalChunk) => {
          setOutput((prev) => prev + chunk.data);
        });
      })
      .catch((err) => setError(err.message || 'Could not start terminal.'));

    return () => {
      // Deliberately NOT killing the session here -- closing the panel
      // should behave like minimizing a terminal window, not closing it.
    };
  }, [isOpen, sessionId]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 50);
  }, [isOpen]);

  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [output]);

  useEffect(() => {
    return () => closeStreamRef.current?.();
  }, []);

  const runCommand = async () => {
    const trimmed = command.trim();
    if (!trimmed || !sessionId || isBusy) return;
    historyRef.current.push(trimmed);
    historyIdxRef.current = historyRef.current.length;
    setOutput((prev) => `${prev}\nPS> ${trimmed}\n`);
    setCommand('');
    setIsBusy(true);
    try {
      await terminalApiService.run(sessionId, trimmed);
    } catch (err: any) {
      setOutput((prev) => `${prev}\n[error: ${err.message || 'command failed'}]\n`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      runCommand();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIdxRef.current > 0) {
        historyIdxRef.current -= 1;
        setCommand(historyRef.current[historyIdxRef.current] || '');
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdxRef.current < historyRef.current.length) {
        historyIdxRef.current += 1;
        setCommand(historyRef.current[historyIdxRef.current] || '');
      }
    } else if (e.key === 'c' && e.ctrlKey && sessionId) {
      // Ctrl+C: send a raw break instead of trying to run it as a command.
      e.preventDefault();
      terminalApiService.sendInput(sessionId, '\x03');
    }
  };

  const handleRestart = async () => {
    if (sessionId) await terminalApiService.kill(sessionId);
    closeStreamRef.current?.();
    closeStreamRef.current = null;
    setSessionId(null);
    setOutput('');
    setError('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-4xl h-[80vh] flex flex-col bg-slate-950 border border-emerald-500/30 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-emerald-500/20 bg-slate-900/60">
          <div className="flex items-center gap-2">
            <TerminalSquare className="w-4 h-4 text-emerald-400" />
            <span className="font-hud font-bold tracking-widest text-sm text-emerald-300">JARVIS TERMINAL</span>
            {sessionId && <span className="text-[10px] font-mono text-slate-500">{sessionId.slice(0, 8)}</span>}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleRestart}
              title="Kill and restart this session"
              className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-300 hover:bg-slate-800"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Output */}
        <div className="flex-1 overflow-y-auto p-4 font-mono text-[13px] text-emerald-100 whitespace-pre-wrap break-words bg-black/40">
          {error && <p className="text-red-400 mb-2">{error}</p>}
          {!sessionId && !error && <p className="text-slate-500">Starting terminal session…</p>}
          {output || (sessionId && <p className="text-slate-500">PowerShell session ready. Type a command below.</p>)}
          <div ref={outputEndRef} />
        </div>

        {/* Input */}
        <div className="flex items-center gap-2 p-3 border-t border-emerald-500/10 bg-slate-900/60">
          <span className="text-emerald-400 font-mono text-sm pl-1">PS&gt;</span>
          <input
            ref={inputRef}
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!sessionId}
            placeholder={isBusy ? 'Running…' : 'Type a command and press Enter (Ctrl+C to interrupt)'}
            className="flex-1 bg-transparent font-mono text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
          />
          <button
            onClick={runCommand}
            disabled={!command.trim() || !sessionId || isBusy}
            className="p-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

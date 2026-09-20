import React, { useRef, useState } from 'react';
import { X, Play, Square, Loader2, Terminal, CheckCircle2, AlertTriangle, Mic, ShieldAlert, Check, Ban, ListChecks, XCircle, Circle } from 'lucide-react';
import { agentApiService, AgentEvent, ScreenshotAnnotation, PlanStep } from '../services/agentApi';
import { voiceService } from '../services/voice';

interface AgentPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface LogEntry {
  id: string;
  kind: 'status' | 'tool_call' | 'tool_result' | 'done' | 'error' | 'text';
  title: string;
  detail?: string;
  screenshot?: string;
  screenshotWidth?: number;
  screenshotHeight?: number;
  annotations?: ScreenshotAnnotation[];
}

interface PendingConfirmation {
  name: string;
  args: any;
  step: number;
}

export const AgentPanel: React.FC<AgentPanelProps> = ({ isOpen, onClose }) => {
  const [task, setTask] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [plan, setPlan] = useState<PlanStep[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const appendLog = (entry: LogEntry) => {
    setLog((prev) => [...prev, entry]);
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 30);
  };

  // Stop any in-progress voice dictation if the panel closes mid-listen.
  React.useEffect(() => {
    if (!isOpen && isListening) {
      voiceService.stopListening();
      setIsListening(false);
    }
  }, [isOpen, isListening]);

  const handleEvent = (event: AgentEvent) => {
    const id = 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    switch (event.type) {
      case 'status':
        appendLog({ id, kind: 'status', title: event.message });
        break;
      case 'assistant_text':
        appendLog({ id, kind: 'text', title: event.text });
        break;
      case 'tool_call':
        appendLog({ id, kind: 'tool_call', title: event.name, detail: JSON.stringify(event.args) });
        break;
      case 'tool_result':
        appendLog({
          id,
          kind: 'tool_result',
          title: event.name,
          detail: event.text,
          screenshot: event.screenshot,
          screenshotWidth: event.screenshotWidth,
          screenshotHeight: event.screenshotHeight,
          annotations: event.annotations
        });
        break;
      case 'confirm_required':
        setPendingConfirmation({ name: event.name, args: event.args, step: event.step });
        appendLog({ id, kind: 'status', title: `Waiting for approval: ${event.name}` });
        break;
      case 'plan':
        setPlan(event.steps);
        break;
      case 'done':
        appendLog({ id, kind: 'done', title: 'Task complete', detail: event.summary });
        setIsRunning(false);
        setPendingConfirmation(null);
        break;
      case 'error':
        appendLog({ id, kind: 'error', title: 'Error', detail: event.message });
        setIsRunning(false);
        setPendingConfirmation(null);
        break;
    }
  };

  const handleConfirm = async (approved: boolean) => {
    if (!sessionIdRef.current || !pendingConfirmation) return;
    const { name } = pendingConfirmation;
    setPendingConfirmation(null);
    await agentApiService.confirmAction(sessionIdRef.current, approved);
    appendLog({
      id: 'confirm_' + Date.now(),
      kind: 'status',
      title: approved ? `Approved: ${name}` : `Denied: ${name}`
    });
  };

  const handleRun = async () => {
    const trimmed = task.trim();
    if (!trimmed || isRunning) return;

    setLog([]);
    setIsRunning(true);
    setPendingConfirmation(null);
    setPlan([]);
    const sessionId = 'agent_' + Date.now();
    sessionIdRef.current = sessionId;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    appendLog({ id: 'start_' + sessionId, kind: 'status', title: `Running: ${trimmed}` });

    try {
      await agentApiService.runTask({ task: trimmed, sessionId, signal: controller.signal, onEvent: handleEvent });
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        appendLog({ id: 'err_' + Date.now(), kind: 'error', title: 'Error', detail: err?.message });
      }
    } finally {
      setIsRunning(false);
    }
  };

  const handleStop = async () => {
    if (sessionIdRef.current) {
      await agentApiService.stopTask(sessionIdRef.current);
    }
    abortControllerRef.current?.abort();
    setIsRunning(false);
    setPendingConfirmation(null);
    appendLog({ id: 'stop_' + Date.now(), kind: 'status', title: 'Stopped by user.' });
  };

  const toggleVoiceInput = () => {
    if (isListening) {
      voiceService.stopListening();
      setIsListening(false);
      return;
    }
    setVoiceError('');
    setIsListening(true);
    voiceService.startListening({
      onResult: (transcript, isFinal) => {
        setTask(transcript);
        if (isFinal) setIsListening(false);
      },
      onEnd: () => setIsListening(false),
      onError: (message) => {
        setVoiceError(message);
        setIsListening(false);
      }
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-3xl h-[85vh] flex flex-col bg-slate-950 border border-cyan-500/30 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-cyan-500/20 bg-slate-900/60">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span className="font-hud font-bold tracking-widest text-sm text-cyan-300">AGENT MODE — DESKTOP & BROWSER CONTROL</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Task input */}
        <div className="p-4 border-b border-cyan-500/10 space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRun()}
              disabled={isRunning}
              placeholder="e.g. Open Chrome, search for the weather in Pune, and tell me today's forecast"
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/60"
            />
            <button
              type="button"
              onClick={toggleVoiceInput}
              disabled={isRunning}
              title={isListening ? 'Listening… click to stop' : 'Dictate the task by voice'}
              className={`flex items-center justify-center px-3 rounded-lg border text-sm transition-colors ${
                isListening
                  ? 'bg-cyan-500 text-slate-950 border-cyan-300 shadow-[0_0_16px_#06b6d4]'
                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/50'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <Mic className={`w-4 h-4 ${isListening ? 'animate-pulse' : ''}`} />
            </button>
            {isRunning ? (
              <button
                onClick={handleStop}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600/80 hover:bg-red-600 text-white text-sm font-semibold"
              >
                <Square className="w-4 h-4" /> Stop
              </button>
            ) : (
              <button
                onClick={handleRun}
                disabled={!task.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-sm font-semibold"
              >
                <Play className="w-4 h-4" /> Run
              </button>
            )}
          </div>
          {isListening && (
            <p className="text-[11px] text-cyan-400 font-mono">Listening — speak the task, then it'll fill in above. Press Run (or Enter) when ready.</p>
          )}
          {voiceError && <p className="text-[11px] text-red-400 font-mono">{voiceError}</p>}
        </div>

        {/* Live plan / timeline */}
        {plan.length > 0 && (
          <div className="mx-4 mt-3 p-3 rounded-lg border border-cyan-500/20 bg-slate-950/60">
            <div className="flex items-center gap-2 mb-2">
              <ListChecks className="w-4 h-4 text-cyan-400" />
              <span className="text-cyan-300 font-semibold text-xs font-hud tracking-wide">
                PLAN ({plan.filter((s) => s.status === 'done').length}/{plan.length})
              </span>
            </div>
            <ol className="space-y-1">
              {plan.map((step, i) => {
                const icon =
                  step.status === 'done' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : step.status === 'failed' ? (
                    <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  ) : step.status === 'in_progress' ? (
                    <Loader2 className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-spin" />
                  ) : (
                    <Circle className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                  );
                const textColor =
                  step.status === 'done'
                    ? 'text-slate-500 line-through'
                    : step.status === 'failed'
                    ? 'text-red-300'
                    : step.status === 'in_progress'
                    ? 'text-slate-100'
                    : 'text-slate-400';
                return (
                  <li key={step.id} className="flex items-start gap-2 text-xs font-mono">
                    {icon}
                    <span className={textColor}>
                      {i + 1}. {step.description}
                      {step.status === 'failed' && step.attempts > 1 && (
                        <span className="text-red-500/70"> (attempt {step.attempts})</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {/* Destructive-action confirmation */}
        {pendingConfirmation && (
          <div className="mx-4 mt-3 p-3 rounded-lg border border-amber-500/40 bg-amber-950/30">
            <div className="flex items-center gap-2 mb-1.5">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-amber-300 font-semibold text-sm font-hud tracking-wide">APPROVAL REQUIRED</span>
            </div>
            <p className="text-xs text-slate-300 font-mono mb-1">
              JARVIS wants to run: <span className="text-amber-300 font-semibold">{pendingConfirmation.name}</span>
            </p>
            <pre className="text-[11px] text-slate-400 bg-slate-950/60 rounded p-2 mb-2 overflow-x-auto whitespace-pre-wrap break-words">
              {JSON.stringify(pendingConfirmation.args, null, 2)}
            </pre>
            <div className="flex gap-2">
              <button
                onClick={() => handleConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 text-white text-xs font-semibold"
              >
                <Check className="w-3.5 h-3.5" /> Approve
              </button>
              <button
                onClick={() => handleConfirm(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/80 hover:bg-red-600 text-white text-xs font-semibold"
              >
                <Ban className="w-3.5 h-3.5" /> Deny
              </button>
            </div>
          </div>
        )}

        {/* Log */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-xs">
          {log.length === 0 && (
            <p className="text-slate-500 text-sm font-sans">
              JARVIS will take screenshots, click, type, and drive the browser autonomously to complete the task.
              Destructive actions (deleting/overwriting files, risky terminal commands) will pause for your approval — everything else runs freely. Use Stop if it goes off track.
            </p>
          )}
          {log.map((entry) => (
            <div key={entry.id} className="border border-slate-800 rounded-lg p-2 bg-slate-900/50">
              <div className="flex items-center gap-2">
                {entry.kind === 'tool_call' && <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />}
                {entry.kind === 'tool_result' && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />}
                {entry.kind === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                {entry.kind === 'error' && <AlertTriangle className="w-3.5 h-3.5 text-red-400" />}
                <span
                  className={
                    entry.kind === 'error'
                      ? 'text-red-400 font-semibold'
                      : entry.kind === 'done'
                      ? 'text-emerald-400 font-semibold'
                      : entry.kind === 'tool_call'
                      ? 'text-amber-300 font-semibold'
                      : 'text-cyan-300'
                  }
                >
                  {entry.title}
                </span>
              </div>
              {entry.detail && <p className="mt-1 text-slate-400 whitespace-pre-wrap break-words">{entry.detail}</p>}
              {entry.screenshot && (
                <div className="mt-2 inline-block relative">
                  <img
                    src={`data:image/jpeg;base64,${entry.screenshot}`}
                    alt="screenshot"
                    className="rounded border border-slate-700 max-h-48 object-contain block"
                  />
                  {entry.annotations && entry.annotations.length > 0 && entry.screenshotWidth && entry.screenshotHeight && (
                    <svg
                      className="absolute inset-0 w-full h-full pointer-events-none"
                      viewBox={`0 0 ${entry.screenshotWidth} ${entry.screenshotHeight}`}
                      preserveAspectRatio="xMidYMid meet"
                    >
                      {entry.annotations.map((a, i) => {
                        // Boxed annotation (real bounding box known) vs. a
                        // small crosshair marker for a plain coordinate
                        // click where we only know the point, not extent.
                        const hasBox = typeof a.w === 'number' && typeof a.h === 'number';
                        const markerSize = Math.max(entry.screenshotWidth! , entry.screenshotHeight!) * 0.03;
                        return (
                          <g key={i}>
                            {hasBox ? (
                              <rect
                                x={a.x}
                                y={a.y}
                                width={a.w}
                                height={a.h}
                                fill="none"
                                stroke="#22d3ee"
                                strokeWidth={Math.max(entry.screenshotWidth!, entry.screenshotHeight!) * 0.0025}
                              />
                            ) : (
                              <circle
                                cx={a.x}
                                cy={a.y}
                                r={markerSize / 2}
                                fill="none"
                                stroke="#22d3ee"
                                strokeWidth={Math.max(entry.screenshotWidth!, entry.screenshotHeight!) * 0.0025}
                              />
                            )}
                            <text
                              x={hasBox ? a.x : a.x + markerSize / 2 + 4}
                              y={(hasBox ? a.y : a.y) - 4}
                              fill="#22d3ee"
                              fontSize={Math.max(entry.screenshotWidth!, entry.screenshotHeight!) * 0.022}
                              fontFamily="monospace"
                              style={{ paintOrder: 'stroke', stroke: '#020617', strokeWidth: 3 }}
                            >
                              {a.label}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  )}
                </div>
              )}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
};

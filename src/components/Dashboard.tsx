import React, { useEffect, useState } from 'react';
import { X, BarChart3, Loader2, Gauge, Wrench, MessageSquare, Bot, Trash2 } from 'lucide-react';

interface DashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

interface UsageSummary {
  messagesByDay: Array<{ date: string; count: number }>;
  toolCallCounts: Array<{ tool: string; count: number }>;
  latency: { avgMs: number; p50Ms: number; p95Ms: number; sampleCount: number };
  totals: { chatMessages: number; toolCalls: number; agentRuns: number };
}

const DAY_OPTIONS = [7, 14, 30];

/**
 * Small inline SVG bar chart -- deliberately not pulling in a charting
 * library for a handful of bars. Values are scaled to the tallest bar in
 * the set; a flat baseline is drawn even when every value is 0 so the
 * chart doesn't look broken on a fresh install with no history yet.
 */
const BarChart: React.FC<{
  data: Array<{ label: string; value: number }>;
  height?: number;
  barColor?: string;
}> = ({ data, height = 120, barColor = '#22d3ee' }) => {
  const max = Math.max(1, ...data.map((d) => d.value));
  const barWidth = 100 / Math.max(1, data.length);

  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      {data.map((d, i) => {
        const barHeight = (d.value / max) * (height - 20);
        const x = i * barWidth;
        return (
          <g key={i}>
            <rect
              x={x + barWidth * 0.15}
              y={height - 16 - barHeight}
              width={barWidth * 0.7}
              height={Math.max(1, barHeight)}
              fill={barColor}
              opacity={0.85}
              rx={0.5}
            />
            <text
              x={x + barWidth / 2}
              y={height - 4}
              fontSize={3.2}
              textAnchor="middle"
              fill="#64748b"
              fontFamily="monospace"
            >
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

export const Dashboard: React.FC<DashboardProps> = ({ isOpen, onClose }) => {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [days, setDays] = useState(14);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const load = async (d: number) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/usage/summary?days=${d}`);
      const data = await res.json();
      setSummary(data);
    } catch {
      setError('Could not reach the JARVIS backend to load usage data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) load(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, days]);

  const handleClear = async () => {
    if (!confirmingClear) {
      setConfirmingClear(true);
      return;
    }
    try {
      await fetch('/api/usage', { method: 'DELETE' });
      await load(days);
    } catch {
      setError('Failed to clear usage history.');
    } finally {
      setConfirmingClear(false);
    }
  };

  if (!isOpen) return null;

  const messagesChartData =
    summary?.messagesByDay.map((d) => ({
      // Just day-of-month -- full ISO dates don't fit under 30 bars.
      label: d.date.slice(8, 10),
      value: d.count
    })) || [];

  const toolChartData =
    summary?.toolCallCounts.map((t) => ({
      label: t.tool.replace(/^desktop_|^browser_|^memory_/, '').slice(0, 8),
      value: t.count
    })) || [];

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-3xl h-[85vh] flex flex-col bg-slate-950 border border-cyan-500/30 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-cyan-500/20 bg-slate-900/60">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-cyan-400" />
            <span className="font-hud font-bold tracking-widest text-sm text-cyan-300">USAGE DASHBOARD</span>
          </div>
          <div className="flex items-center gap-2">
            {DAY_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`text-[11px] font-mono px-2 py-1 rounded-lg border transition-colors ${
                  days === d
                    ? 'border-cyan-500/60 text-cyan-300 bg-cyan-500/10'
                    : 'border-slate-700 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/40'
                }`}
              >
                {d}d
              </button>
            ))}
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">
          {loading ? (
            <div className="text-sm font-mono text-slate-500 flex items-center gap-2 py-10 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading usage data…
            </div>
          ) : error ? (
            <div className="text-xs font-mono text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {error}
            </div>
          ) : summary ? (
            <>
              {/* Totals row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-900/70 border border-cyan-500/15 rounded-xl p-3 flex items-center gap-3">
                  <MessageSquare className="w-5 h-5 text-cyan-400 shrink-0" />
                  <div>
                    <div className="text-lg font-hud font-bold text-cyan-200">{summary.totals.chatMessages}</div>
                    <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wide">
                      Chat messages ({days}d)
                    </div>
                  </div>
                </div>
                <div className="bg-slate-900/70 border border-cyan-500/15 rounded-xl p-3 flex items-center gap-3">
                  <Wrench className="w-5 h-5 text-amber-400 shrink-0" />
                  <div>
                    <div className="text-lg font-hud font-bold text-amber-200">{summary.totals.toolCalls}</div>
                    <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wide">
                      Tool calls ({days}d)
                    </div>
                  </div>
                </div>
                <div className="bg-slate-900/70 border border-cyan-500/15 rounded-xl p-3 flex items-center gap-3">
                  <Bot className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <div className="text-lg font-hud font-bold text-emerald-200">{summary.totals.agentRuns}</div>
                    <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wide">
                      Agent runs ({days}d)
                    </div>
                  </div>
                </div>
              </div>

              {/* Messages per day */}
              <div className="space-y-2">
                <h3 className="text-xs font-hud font-semibold text-cyan-400 flex items-center gap-2 border-b border-cyan-500/20 pb-1">
                  <MessageSquare className="w-4 h-4" />
                  <span>MESSAGES PER DAY</span>
                </h3>
                {messagesChartData.length > 0 ? (
                  <BarChart data={messagesChartData} />
                ) : (
                  <p className="text-xs font-mono text-slate-500 py-4 text-center">No data yet.</p>
                )}
              </div>

              {/* Tool call counts */}
              <div className="space-y-2">
                <h3 className="text-xs font-hud font-semibold text-amber-400 flex items-center gap-2 border-b border-amber-500/20 pb-1">
                  <Wrench className="w-4 h-4" />
                  <span>TOP TOOL CALLS</span>
                </h3>
                {toolChartData.length > 0 ? (
                  <BarChart data={toolChartData} barColor="#fbbf24" />
                ) : (
                  <p className="text-xs font-mono text-slate-500 py-4 text-center">No tool calls logged yet.</p>
                )}
              </div>

              {/* Latency */}
              <div className="space-y-2">
                <h3 className="text-xs font-hud font-semibold text-emerald-400 flex items-center gap-2 border-b border-emerald-500/20 pb-1">
                  <Gauge className="w-4 h-4" />
                  <span>CHAT RESPONSE LATENCY</span>
                </h3>
                {summary.latency.sampleCount > 0 ? (
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="bg-slate-900/70 border border-emerald-500/15 rounded-xl p-3">
                      <div className="text-base font-hud font-bold text-emerald-200">{summary.latency.avgMs}ms</div>
                      <div className="text-[10px] font-mono text-slate-500">avg</div>
                    </div>
                    <div className="bg-slate-900/70 border border-emerald-500/15 rounded-xl p-3">
                      <div className="text-base font-hud font-bold text-emerald-200">{summary.latency.p50Ms}ms</div>
                      <div className="text-[10px] font-mono text-slate-500">p50</div>
                    </div>
                    <div className="bg-slate-900/70 border border-emerald-500/15 rounded-xl p-3">
                      <div className="text-base font-hud font-bold text-emerald-200">{summary.latency.p95Ms}ms</div>
                      <div className="text-[10px] font-mono text-slate-500">p95</div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs font-mono text-slate-500 py-4 text-center">No latency samples yet.</p>
                )}
              </div>

              {/* Clear history */}
              <div className="pt-2 border-t border-slate-800 flex justify-end">
                <button
                  type="button"
                  onClick={handleClear}
                  className={`flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1.5 rounded-lg border transition-colors ${
                    confirmingClear
                      ? 'border-red-500/60 text-red-300 bg-red-500/10'
                      : 'border-slate-700 text-slate-400 hover:text-red-300 hover:border-red-500/40'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {confirmingClear ? 'Confirm clear history?' : 'Clear usage history'}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

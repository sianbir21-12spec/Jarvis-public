import React, { useState, useEffect, useMemo } from 'react';
import { AppSettings, GatewayHealth } from '../types';
import { DEFAULT_SYSTEM_PROMPT } from '../services/storage';
import { voiceService } from '../services/voice';
import { notificationService } from '../services/notifications';
import { apiService } from '../services/api';
import { CredentialsSection } from './CredentialsSection';
import { MemorySection } from './MemorySection';
import { 
  Settings as SettingsIcon, 
  X, 
  Sliders, 
  Volume2, 
  VolumeX, 
  Cpu, 
  RotateCcw, 
  Check, 
  Activity, 
  ShieldCheck, 
  Play, 
  Square, 
  Gauge, 
  Mic, 
  Sparkles, 
  Search,
  Monitor,
  AlertTriangle
} from 'lucide-react';

const CONFIRM_PHRASE = 'I UNDERSTAND';

const ComputerControlSection: React.FC = () => {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState('');

  const refreshStatus = () => {
    fetch('/api/computer-control/status')
      .then((r) => r.json())
      .then((data) => setEnabled(!!data.enabled))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refreshStatus();
  }, []);

  const disable = async () => {
    await fetch('/api/computer-control/disable', { method: 'POST' }).catch(() => {});
    setEnabled(false);
    setShowConfirm(false);
    setConfirmText('');
  };

  const confirmEnable = async () => {
    if (confirmText.trim().toUpperCase() !== CONFIRM_PHRASE) return;
    setError('');
    try {
      const res = await fetch('/api/computer-control/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: confirmText.trim().toUpperCase() })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to enable.');
        return;
      }
      setEnabled(true);
      setShowConfirm(false);
      setConfirmText('');
    } catch {
      setError('Could not reach JARVIS backend.');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between border-b border-cyan-500/20 pb-1">
        <div className="flex items-center gap-2">
          <Monitor className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-hud font-semibold text-cyan-400">COMPUTER CONTROL (AGENT MODE)</h3>
        </div>
        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
          enabled ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40' : 'bg-slate-800 text-slate-400 border-slate-600'
        }`}>
          {loading ? '…' : enabled ? 'ACTIVE' : 'OFF'}
        </span>
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">
        Controls whether the Agent Mode panel (autonomous desktop + browser control) is allowed to run at all.
        This resets to OFF every time the JARVIS server restarts — it is never remembered between sessions.
      </p>

      {enabled ? (
        <button
          type="button"
          onClick={disable}
          className="px-3 py-1.5 rounded-lg text-xs font-mono bg-red-950/60 border border-red-500/40 text-red-300 hover:bg-red-950"
        >
          Disable Computer Control
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          className="px-3 py-1.5 rounded-lg text-xs font-mono bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-950"
        >
          Enable Computer Control…
        </button>
      )}

      {showConfirm && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-950/20 p-3 space-y-2">
          <div className="flex items-start gap-2 text-amber-300 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              JARVIS will be able to click and type <strong>anywhere on your screen</strong>, in any application, and run
              PowerShell commands, fully autonomously with no per-step confirmation. Only enable this if you trust the
              model's judgment and plan to watch it work. Type <strong>{CONFIRM_PHRASE}</strong> to confirm.
            </p>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2">
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_PHRASE}
              className="flex-1 bg-slate-900 border border-amber-500/30 rounded px-2 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-amber-400"
            />
            <button
              type="button"
              onClick={confirmEnable}
              disabled={confirmText.trim().toUpperCase() !== CONFIRM_PHRASE}
              className="px-3 py-1 rounded text-xs font-mono bg-amber-500/20 border border-amber-500/50 text-amber-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-amber-500/30"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => { setShowConfirm(false); setConfirmText(''); setError(''); }}
              className="px-3 py-1 rounded text-xs font-mono bg-slate-800 border border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (settings: AppSettings) => void;
  health: GatewayHealth;
}

export const Settings: React.FC<SettingsProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  health
}) => {
  const [formData, setFormData] = useState<AppSettings>(settings);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [pingResult, setPingResult] = useState<GatewayHealth | null>(null);
  const [isPinging, setIsPinging] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [voiceSearch, setVoiceSearch] = useState('');
  const [isAuditioning, setIsAuditioning] = useState(false);

  useEffect(() => {
    setFormData(settings);
    if (isOpen) {
      voiceService.loadVoices().then((v) => {
        setAvailableVoices(v);
      });
      const unsubscribe = voiceService.onVoicesChanged((v) => {
        setAvailableVoices(v);
      });
      return () => {
        unsubscribe();
      };
    }
  }, [settings, isOpen]);

  // Filtered voice list
  const filteredVoices = useMemo(() => {
    if (!voiceSearch.trim()) return availableVoices;
    const q = voiceSearch.toLowerCase();
    return availableVoices.filter(
      (v) => v.name.toLowerCase().includes(q) || v.lang.toLowerCase().includes(q)
    );
  }, [availableVoices, voiceSearch]);

  if (!isOpen) return null;

  const handlePingGateway = async () => {
    setIsPinging(true);
    try {
      const res = await apiService.checkHealth();
      setPingResult(res);
    } catch {
      setPingResult({
        status: 'offline',
        model: formData.model,
        gateway: formData.baseUrl,
        message: 'Could not reach server'
      });
    } finally {
      setIsPinging(false);
    }
  };

  const handleTestVoice = () => {
    if (isAuditioning) {
      voiceService.stopSpeaking();
      setIsAuditioning(false);
      return;
    }

    setIsAuditioning(true);
    voiceService.speak(
      `JARVIS vocal synthesis diagnostic verified, Commander. Voice rate calibrated to ${formData.speechRate}x. All operational protocols nominal.`,
      {
        rate: formData.speechRate,
        pitch: formData.speechPitch,
        voiceURI: formData.voiceURI,
        onEnd: () => setIsAuditioning(false),
        onError: () => setIsAuditioning(false)
      }
    );
  };

  const handleSetRatePreset = (rate: number) => {
    setFormData((prev) => ({ ...prev, speechRate: rate }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings(formData);
    setSavedNotice(true);
    setTimeout(() => {
      setSavedNotice(false);
      onClose();
    }, 600);
  };

  const resetSystemPrompt = () => {
    setFormData((prev) => ({ ...prev, systemPrompt: DEFAULT_SYSTEM_PROMPT }));
  };

  // Descriptive label for rate
  const getRateLabel = (rate: number) => {
    if (rate <= 0.8) return 'Deliberate / Slow';
    if (rate <= 1.05) return 'Standard Normal';
    if (rate <= 1.3) return 'Tactical Brisk';
    return 'High-Speed Rapid';
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-slate-950 border border-cyan-500/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 border-b border-cyan-500/20 flex items-center justify-between bg-slate-900/70">
          <div className="flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-cyan-400" />
            <h2 className="text-sm font-hud font-bold tracking-wider text-cyan-200">
              JARVIS PROTOCOL CONFIGURATION
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">
          {/* Security Notice */}
          <div className="p-3 rounded-xl bg-slate-900/80 border border-cyan-500/20 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
            <div className="text-xs font-mono text-slate-300">
              <span className="text-cyan-300 font-semibold block mb-0.5">Secure Gateway Isolation</span>
              API keys are stored by the backend in a local per-user config file. The interface only ever sees a masked preview, never the full token.
            </div>
          </div>

          {/* Section 0: Credentials (OmniRoute + Gemini) */}
          <CredentialsSection />

          {/* Section 0.5: Long-term memory */}
          <MemorySection />

          {/* Section 1: AI Model & OmniRoute */}
          <div className="space-y-4">
            <h3 className="text-xs font-hud font-semibold text-cyan-400 flex items-center gap-2 border-b border-cyan-500/20 pb-1">
              <Cpu className="w-4 h-4" />
              <span>OMNIROUTE GATEWAY</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-mono text-slate-300 mb-1 block">AI Model Identifier:</label>
                <input
                  type="text"
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  placeholder="SIAN"
                  className="w-full bg-slate-900 border border-cyan-500/30 rounded-xl px-3 py-2 text-xs font-mono text-cyan-200 focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="text-xs font-mono text-slate-300 mb-1 block">OmniRoute Base Gateway:</label>
                <input
                  type="text"
                  value={formData.baseUrl}
                  onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                  placeholder="https://omnirouuter.zeabur.app"
                  className="w-full bg-slate-900 border border-cyan-500/30 rounded-xl px-3 py-2 text-xs font-mono text-slate-300 focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            {/* Gateway Connectivity Test */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/40 border border-cyan-500/10">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-mono text-slate-300">Test Gateway Handshake:</span>
                {pingResult && (
                  <span className={`text-xs font-mono px-2 py-0.5 rounded ${
                    pingResult.status === 'online' ? 'text-emerald-400 bg-emerald-950/40' : 'text-red-400 bg-red-950/40'
                  }`}>
                    {pingResult.status.toUpperCase()} {pingResult.latency ? `(${pingResult.latency}ms)` : ''}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handlePingGateway}
                disabled={isPinging}
                className="px-3 py-1 rounded-lg bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-900/60 font-mono text-xs transition-colors"
              >
                {isPinging ? 'Pinging...' : 'Ping Gateway'}
              </button>
            </div>
          </div>

          {/* Section 2: Generation Hyperparameters */}
          <div className="space-y-4">
            <h3 className="text-xs font-hud font-semibold text-cyan-400 flex items-center gap-2 border-b border-cyan-500/20 pb-1">
              <Sliders className="w-4 h-4" />
              <span>HYPERPARAMETERS</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="flex justify-between text-xs font-mono text-slate-300 mb-1">
                  <span>Temperature:</span>
                  <span className="text-cyan-400">{formData.temperature.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1.5"
                  step="0.05"
                  value={formData.temperature}
                  onChange={(e) => setFormData({ ...formData, temperature: parseFloat(e.target.value) })}
                  className="w-full accent-cyan-400"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-mono text-slate-300 mb-1">
                  <span>Max Tokens:</span>
                  <span className="text-cyan-400">{formData.maxTokens}</span>
                </div>
                <input
                  type="range"
                  min="256"
                  max="4096"
                  step="128"
                  value={formData.maxTokens}
                  onChange={(e) => setFormData({ ...formData, maxTokens: parseInt(e.target.value, 10) })}
                  className="w-full accent-cyan-400"
                />
              </div>
            </div>

            {/* Toggle Toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-mono text-slate-300 select-none">
                <input
                  type="checkbox"
                  checked={formData.streamingEnabled}
                  onChange={(e) => setFormData({ ...formData, streamingEnabled: e.target.checked })}
                  className="rounded accent-cyan-500"
                />
                <span>Streaming SSE Responses</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-mono text-slate-300 select-none">
                <input
                  type="checkbox"
                  checked={formData.enterToSend}
                  onChange={(e) => setFormData({ ...formData, enterToSend: e.target.checked })}
                  className="rounded accent-cyan-500"
                />
                <span>Enter key sends directive</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-mono text-slate-300 select-none">
                <input
                  type="checkbox"
                  checked={formData.notificationsEnabled}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    setFormData({ ...formData, notificationsEnabled: enabled });
                    if (enabled) notificationService.requestPermission();
                  }}
                  className="rounded accent-cyan-500"
                />
                <span>
                  Push notifications
                  {notificationService.getPermission() === 'denied' && (
                    <span className="text-amber-400 ml-1">(blocked in browser)</span>
                  )}
                </span>
              </label>
            </div>
          </div>

          {/* Section: Computer Control (Agent Mode) */}
          <ComputerControlSection />

          {/* Section 3: Voice & Speech Synthesis */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-cyan-500/20 pb-1">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-cyan-400" />
                <h3 className="text-xs font-hud font-semibold text-cyan-400">
                  VOICE SYNTHESIS & ACOUSTICS
                </h3>
                {availableVoices.length > 0 && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-500/20">
                    {availableVoices.length} VOICES
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleTestVoice}
                className={`text-[11px] font-mono px-2.5 py-1 rounded-lg border flex items-center gap-1.5 transition-all ${
                  isAuditioning
                    ? 'bg-amber-950/60 border-amber-500/40 text-amber-300 animate-pulse'
                    : 'bg-cyan-950/60 border-cyan-500/30 text-cyan-300 hover:bg-cyan-900/60'
                }`}
              >
                {isAuditioning ? (
                  <>
                    <Square className="w-3 h-3 fill-amber-400 text-amber-400" />
                    <span>Halt Diagnostic</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3 text-cyan-400" />
                    <span>Audition Voice</span>
                  </>
                )}
              </button>
            </div>

            {/* Voice Feature Toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Voice Interface Master Switch */}
              <div className={`p-3 rounded-xl border transition-all ${
                formData.voiceEnabled 
                  ? 'bg-slate-900/90 border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.1)]' 
                  : 'bg-slate-950/60 border-slate-800 text-slate-500'
              }`}>
                <label className="flex items-start justify-between gap-2 cursor-pointer select-none">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Mic className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="text-xs font-hud font-semibold text-slate-200">
                        VOICE INTERFACE
                      </span>
                    </div>
                    <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                      Enables microphone dictation and speech synthesis.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.voiceEnabled}
                    onChange={(e) => setFormData({ ...formData, voiceEnabled: e.target.checked })}
                    className="rounded accent-cyan-400 mt-1 w-4 h-4 cursor-pointer"
                  />
                </label>
              </div>

              {/* Auto-Speak AI Responses */}
              <div className={`p-3 rounded-xl border transition-all ${
                formData.autoSpeak 
                  ? 'bg-slate-900/90 border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.1)]' 
                  : 'bg-slate-950/60 border-slate-800 text-slate-500'
              }`}>
                <label className="flex items-start justify-between gap-2 cursor-pointer select-none">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="text-xs font-hud font-semibold text-slate-200">
                        AUTO-SPEAK RESPONSES
                      </span>
                    </div>
                    <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                      Automatically vocalize AI answers when streaming finishes.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.autoSpeak}
                    onChange={(e) => setFormData({ ...formData, autoSpeak: e.target.checked })}
                    className="rounded accent-cyan-400 mt-1 w-4 h-4 cursor-pointer"
                  />
                </label>
              </div>
            </div>

            {/* Speech Synthesis Rate (Speed) */}
            <div className="p-3.5 rounded-xl bg-slate-900/70 border border-cyan-500/20 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-hud font-semibold text-slate-200">
                    SPEECH SYNTHESIS RATE
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono font-bold text-cyan-300 px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/30">
                    {formData.speechRate.toFixed(2)}x
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    ({getRateLabel(formData.speechRate)})
                  </span>
                </div>
              </div>

              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.05"
                value={formData.speechRate}
                onChange={(e) => setFormData({ ...formData, speechRate: parseFloat(e.target.value) })}
                className="w-full accent-cyan-400 cursor-pointer"
              />

              {/* Rate Presets */}
              <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                <span className="text-[10px] font-mono text-slate-500 mr-1">PRESETS:</span>
                {[
                  { label: '0.75x Slow', val: 0.75 },
                  { label: '1.0x Normal', val: 1.0 },
                  { label: '1.25x Brisk', val: 1.25 },
                  { label: '1.5x Rapid', val: 1.5 }
                ].map((preset) => (
                  <button
                    key={preset.val}
                    type="button"
                    onClick={() => handleSetRatePreset(preset.val)}
                    className={`px-2 py-1 rounded-md text-[11px] font-mono border transition-all ${
                      Math.abs(formData.speechRate - preset.val) < 0.01
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 font-bold shadow-[0_0_8px_rgba(6,182,212,0.3)]'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Vocal Profile Selection & Pitch */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Choose from Available Voices */}
              <div className="md:col-span-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-hud font-semibold text-slate-300">
                    AVAILABLE VOCAL PROFILES
                  </label>
                  {availableVoices.length > 8 && (
                    <div className="relative w-36">
                      <Search className="w-3 h-3 text-slate-500 absolute left-2 top-2" />
                      <input
                        type="text"
                        value={voiceSearch}
                        onChange={(e) => setVoiceSearch(e.target.value)}
                        placeholder="Filter voices..."
                        className="w-full bg-slate-900 border border-cyan-500/20 rounded-lg pl-6 pr-2 py-0.5 text-[11px] font-mono text-slate-300 focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                  )}
                </div>

                <select
                  value={formData.voiceURI}
                  onChange={(e) => setFormData({ ...formData, voiceURI: e.target.value })}
                  className="w-full bg-slate-900 border border-cyan-500/30 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
                >
                  <option value="">Default Recommended System Voice (British / Sci-Fi tone)</option>
                  {filteredVoices.map((v) => {
                    const isJarvisLike =
                      v.lang.startsWith('en-GB') ||
                      v.name.includes('UK') ||
                      v.name.includes('Daniel') ||
                      v.name.includes('George') ||
                      v.name.includes('Natural');
                    return (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        {isJarvisLike ? '★ ' : ''}{v.name} ({v.lang}){v.localService ? ' [Local]' : ''}
                      </option>
                    );
                  })}
                </select>
                <p className="text-[10px] font-mono text-slate-500">
                  {formData.voiceURI
                    ? `Active Voice: ${availableVoices.find((v) => v.voiceURI === formData.voiceURI)?.name || formData.voiceURI}`
                    : 'Using intelligent fallback: British / UK English tone if available on host.'}
                </p>
              </div>

              {/* Pitch Adjustment */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-hud font-semibold text-slate-300">
                    VOCAL PITCH
                  </label>
                  <span className="text-xs font-mono text-cyan-300">
                    {formData.speechPitch.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.7"
                  max="1.3"
                  step="0.05"
                  value={formData.speechPitch}
                  onChange={(e) => setFormData({ ...formData, speechPitch: parseFloat(e.target.value) })}
                  className="w-full accent-cyan-400 cursor-pointer mt-2"
                />
                <div className="flex justify-between text-[10px] font-mono text-slate-500">
                  <span>Deeper</span>
                  <span>Default (1.0)</span>
                  <span>Brighter</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: System Prompt */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono text-slate-300">Core Persona Directives (System Prompt):</label>
              <button
                type="button"
                onClick={resetSystemPrompt}
                className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" /> Reset to JARVIS Default
              </button>
            </div>
            <textarea
              rows={6}
              value={formData.systemPrompt}
              onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
              className="w-full bg-slate-900 border border-cyan-500/30 rounded-xl p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400 custom-scrollbar leading-relaxed"
            />
          </div>

          {/* Footer Save Button */}
          <div className="pt-2 flex items-center justify-between border-t border-cyan-500/20">
            {savedNotice ? (
              <span className="text-xs font-mono text-emerald-400 flex items-center gap-1">
                <Check className="w-4 h-4" /> Parameters Saved to Memory
              </span>
            ) : (
              <span className="text-[11px] font-mono text-slate-500">
                Theme: Cyber Dark Mode (Optimized)
              </span>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-mono text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-mono text-xs font-bold shadow-[0_0_15px_rgba(6,182,212,0.3)] hover:brightness-110 transition-all flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Apply Parameters</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

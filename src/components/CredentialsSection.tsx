import React, { useEffect, useState } from 'react';
import { KeyRound, Eye, EyeOff, Save, Check, AlertTriangle, Plug, Loader2 } from 'lucide-react';

/**
 * Lets the user enter OmniRoute + Gemini credentials from inside the app.
 *
 * The backend owns the actual secrets: this panel only ever receives masked
 * values (e.g. "sk-a...z9f1") plus a "_SET" flag. A key is sent to the server
 * exactly once, when the user types a new one and saves.
 */

type ConfigView = Record<string, any>;

interface FieldState {
  OMNIROUTE_BASE_URL: string;
  OMNIROUTE_MODEL: string;
  AGENT_MODEL: string;
  AGENT_FALLBACK_MODEL: string;
  OMNIROUTE_STT_MODEL: string;
  GEMINI_STT_MODEL: string;
}

const SOURCE_LABEL: Record<string, string> = {
  app: 'set in app',
  env: 'from .env',
  default: 'default'
};

const SourceTag: React.FC<{ source?: string }> = ({ source }) => {
  if (!source) return null;
  return (
    <span className="ml-2 text-[10px] font-mono uppercase tracking-wide text-slate-500">
      {SOURCE_LABEL[source] ?? source}
    </span>
  );
};

export const CredentialsSection: React.FC = () => {
  const [config, setConfig] = useState<ConfigView | null>(null);
  const [fields, setFields] = useState<FieldState>({
    OMNIROUTE_BASE_URL: '',
    OMNIROUTE_MODEL: '',
    AGENT_MODEL: '',
    AGENT_FALLBACK_MODEL: '',
    OMNIROUTE_STT_MODEL: '',
    GEMINI_STT_MODEL: ''
  });

  // Secret inputs start empty; a blank value means "leave the stored key alone".
  const [omniKey, setOmniKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [showOmni, setShowOmni] = useState(false);
  const [showGemini, setShowGemini] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [testing, setTesting] = useState<'' | 'omniroute' | 'gemini'>('');
  const [testResult, setTestResult] = useState<{ target: string; ok: boolean; message: string } | null>(null);

  const loadConfig = async () => {
    try {
      const res = await fetch('/api/settings/config');
      const data = await res.json();
      setConfig(data);
      setFields({
        OMNIROUTE_BASE_URL: data.OMNIROUTE_BASE_URL || '',
        OMNIROUTE_MODEL: data.OMNIROUTE_MODEL || '',
        AGENT_MODEL: data.AGENT_MODEL || '',
        AGENT_FALLBACK_MODEL: data.AGENT_FALLBACK_MODEL || '',
        OMNIROUTE_STT_MODEL: data.OMNIROUTE_STT_MODEL || '',
        GEMINI_STT_MODEL: data.GEMINI_STT_MODEL || ''
      });
    } catch {
      setError('Could not reach the JARVIS backend to load configuration.');
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaved(false);

    const payload: Record<string, string> = { ...fields };
    if (omniKey.trim()) payload.OMNIROUTE_API_KEY = omniKey.trim();
    if (geminiKey.trim()) payload.GEMINI_API_KEY = geminiKey.trim();

    try {
      const res = await fetch('/api/settings/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || data?.message || 'Failed to save configuration.');
        return;
      }

      setConfig(data.config);
      setOmniKey('');
      setGeminiKey('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError('Could not reach the JARVIS backend.');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (target: 'omniroute' | 'gemini') => {
    setTesting(target);
    setTestResult(null);
    try {
      const res = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target })
      });
      const data = await res.json();
      setTestResult({
        target,
        ok: !!data.ok,
        message: data.ok ? data.message : data.error || 'Test failed.'
      });
    } catch {
      setTestResult({ target, ok: false, message: 'Could not reach the JARVIS backend.' });
    } finally {
      setTesting('');
    }
  };

  const inputClass =
    'w-full bg-slate-900 border border-cyan-500/30 rounded-xl px-3 py-2 text-xs font-mono text-cyan-200 focus:outline-none focus:border-cyan-400';

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-hud font-semibold text-cyan-400 flex items-center gap-2 border-b border-cyan-500/20 pb-1">
        <KeyRound className="w-4 h-4" />
        <span>AI GATEWAY &amp; KEYS</span>
      </h3>

      {/* --- OmniRoute API key --- */}
      <div>
        <label className="text-xs font-mono text-slate-300 mb-1 block">
          OmniRoute API Key:
          {config?.OMNIROUTE_API_KEY_SET ? (
            <span className="ml-2 text-emerald-400">configured ({config.OMNIROUTE_API_KEY})</span>
          ) : (
            <span className="ml-2 text-amber-400">not set</span>
          )}
          <SourceTag source={config?.OMNIROUTE_API_KEY_SOURCE} />
        </label>
        <div className="flex gap-2">
          <input
            type={showOmni ? 'text' : 'password'}
            value={omniKey}
            onChange={(e) => setOmniKey(e.target.value)}
            placeholder={config?.OMNIROUTE_API_KEY_SET ? 'Leave blank to keep current key' : 'sk-...'}
            autoComplete="off"
            spellCheck={false}
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => setShowOmni((v) => !v)}
            className="px-3 rounded-xl bg-slate-900 border border-cyan-500/30 text-slate-400 hover:text-cyan-300"
            aria-label={showOmni ? 'Hide key' : 'Show key'}
          >
            {showOmni ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => handleTest('omniroute')}
            disabled={testing === 'omniroute'}
            className="px-3 py-1 rounded-xl bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-900/60 font-mono text-xs flex items-center gap-1 disabled:opacity-50"
          >
            {testing === 'omniroute' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plug className="w-3 h-3" />}
            Test
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-mono text-slate-300 mb-1 block">
            Base URL:
            <SourceTag source={config?.OMNIROUTE_BASE_URL_SOURCE} />
          </label>
          <input
            type="text"
            value={fields.OMNIROUTE_BASE_URL}
            onChange={(e) => setFields({ ...fields, OMNIROUTE_BASE_URL: e.target.value })}
            placeholder="https://omnirouuter.zeabur.app"
            className={inputClass}
          />
        </div>

        <div>
          <label className="text-xs font-mono text-slate-300 mb-1 block">
            Chat Model:
            <SourceTag source={config?.OMNIROUTE_MODEL_SOURCE} />
          </label>
          <input
            type="text"
            value={fields.OMNIROUTE_MODEL}
            onChange={(e) => setFields({ ...fields, OMNIROUTE_MODEL: e.target.value })}
            placeholder="SIAN"
            className={inputClass}
          />
        </div>

        <div>
          <label className="text-xs font-mono text-slate-300 mb-1 block">
            Agent Model (needs tools + vision):
            <SourceTag source={config?.AGENT_MODEL_SOURCE} />
          </label>
          <input
            type="text"
            value={fields.AGENT_MODEL}
            onChange={(e) => setFields({ ...fields, AGENT_MODEL: e.target.value })}
            placeholder="blank = reuse chat model"
            className={inputClass}
          />
        </div>

        <div>
          <label className="text-xs font-mono text-slate-300 mb-1 block">
            Agent Fallback Model (used if the primary agent model errors/times out):
            <SourceTag source={config?.AGENT_FALLBACK_MODEL_SOURCE} />
          </label>
          <input
            type="text"
            value={fields.AGENT_FALLBACK_MODEL}
            onChange={(e) => setFields({ ...fields, AGENT_FALLBACK_MODEL: e.target.value })}
            placeholder="blank = no fallback, error surfaces as-is"
            className={inputClass}
          />
        </div>

        <div>
          <label className="text-xs font-mono text-slate-300 mb-1 block">
            OmniRoute STT Model:
            <SourceTag source={config?.OMNIROUTE_STT_MODEL_SOURCE} />
          </label>
          <input
            type="text"
            value={fields.OMNIROUTE_STT_MODEL}
            onChange={(e) => setFields({ ...fields, OMNIROUTE_STT_MODEL: e.target.value })}
            placeholder="whisper-1"
            className={inputClass}
          />
        </div>
      </div>

      {/* --- Gemini --- */}
      <div className="pt-2 border-t border-cyan-500/10">
        <label className="text-xs font-mono text-slate-300 mb-1 block">
          Gemini API Key (voice transcription fallback):
          {config?.GEMINI_API_KEY_SET ? (
            <span className="ml-2 text-emerald-400">configured ({config.GEMINI_API_KEY})</span>
          ) : (
            <span className="ml-2 text-amber-400">not set</span>
          )}
          <SourceTag source={config?.GEMINI_API_KEY_SOURCE} />
        </label>
        <div className="flex gap-2">
          <input
            type={showGemini ? 'text' : 'password'}
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
            placeholder={config?.GEMINI_API_KEY_SET ? 'Leave blank to keep current key' : 'AIza...'}
            autoComplete="off"
            spellCheck={false}
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => setShowGemini((v) => !v)}
            className="px-3 rounded-xl bg-slate-900 border border-cyan-500/30 text-slate-400 hover:text-cyan-300"
            aria-label={showGemini ? 'Hide key' : 'Show key'}
          >
            {showGemini ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => handleTest('gemini')}
            disabled={testing === 'gemini'}
            className="px-3 py-1 rounded-xl bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-900/60 font-mono text-xs flex items-center gap-1 disabled:opacity-50"
          >
            {testing === 'gemini' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plug className="w-3 h-3" />}
            Test
          </button>
        </div>

        <div className="mt-3">
          <label className="text-xs font-mono text-slate-300 mb-1 block">
            Gemini STT Model:
            <SourceTag source={config?.GEMINI_STT_MODEL_SOURCE} />
          </label>
          <input
            type="text"
            value={fields.GEMINI_STT_MODEL}
            onChange={(e) => setFields({ ...fields, GEMINI_STT_MODEL: e.target.value })}
            placeholder="gemini-3.6-flash"
            className={inputClass}
          />
        </div>
      </div>

      {/* --- Feedback --- */}
      {testResult && (
        <div
          className={`p-2 rounded-lg text-xs font-mono flex items-start gap-2 ${
            testResult.ok
              ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-500/30'
              : 'bg-red-950/40 text-red-300 border border-red-500/30'
          }`}
        >
          {testResult.ok ? (
            <Check className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span>{testResult.message}</span>
        </div>
      )}

      {error && (
        <div className="p-2 rounded-lg text-xs font-mono bg-red-950/40 text-red-300 border border-red-500/30">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-xl bg-cyan-600/80 hover:bg-cyan-500 text-white font-mono text-xs flex items-center gap-2 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          Save Credentials
        </button>
        {saved && (
          <span className="text-xs font-mono text-emerald-400 flex items-center gap-1">
            <Check className="w-3 h-3" /> Saved
          </span>
        )}
      </div>

      {config?.configPath && (
        <p className="text-[10px] font-mono text-slate-500 break-all">
          Stored locally at {config.configPath}
        </p>
      )}
    </div>
  );
};

import React from 'react';
import { GatewayHealth, WebpageContext } from '../types';
import { Wifi, WifiOff, Cpu, Volume2, VolumeX, FileText, Settings as SettingsIcon, Menu, Code2, MonitorCog, TerminalSquare } from 'lucide-react';

interface StatusIndicatorProps {
  health: GatewayHealth;
  voiceEnabled: boolean;
  onToggleVoice: () => void;
  onOpenSettings: () => void;
  onToggleSidebar: () => void;
  onOpenContextModal: () => void;
  activeContext?: WebpageContext | null;
  onOpenCodeExplainer?: () => void;
  onOpenAgentPanel?: () => void;
  onOpenTerminal?: () => void;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  health,
  voiceEnabled,
  onToggleVoice,
  onOpenSettings,
  onToggleSidebar,
  onOpenContextModal,
  activeContext,
  onOpenCodeExplainer,
  onOpenAgentPanel,
  onOpenTerminal
}) => {
  const isOnline = health.status === 'online';

  return (
    <header 
      id="jarvis-top-hud"
      className="h-14 border-b border-cyan-500/20 bg-slate-950/80 backdrop-blur-md px-4 flex items-center justify-between z-20 select-none"
    >
      {/* Left side: Hamburger + App Title */}
      <div className="flex items-center gap-3">
        <button
          id="btn-toggle-sidebar"
          onClick={onToggleSidebar}
          aria-label="Toggle Conversation Protocols"
          className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-cyan-950/40 border border-transparent hover:border-cyan-500/30 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          <span className="font-hud font-extrabold text-base md:text-lg tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-300 to-blue-500">
            JARVIS
          </span>
          <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold tracking-wider bg-cyan-950/60 border border-cyan-500/30 text-cyan-300">
            MARK-VII
          </span>
        </div>
      </div>

      {/* Middle: Status HUD Pills */}
      <div className="hidden md:flex items-center gap-3">
        {/* Gateway connection pill */}
        <div 
          id="status-gateway-pill"
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono border transition-all ${
            isOnline 
              ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-400' 
              : 'bg-rose-950/30 border-rose-500/40 text-rose-400'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
          <span>{isOnline ? 'ONLINE' : 'GATEWAY OFFLINE'}</span>
          {health.latency !== undefined && (
            <span className="text-[10px] text-slate-400">({health.latency}ms)</span>
          )}
        </div>

        {/* Model pill */}
        <div 
          id="status-model-pill"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-cyan-950/40 border border-cyan-500/30 text-cyan-300"
        >
          <Cpu className="w-3.5 h-3.5 text-cyan-400" />
          <span>MODEL: {health.model || 'SIAN'}</span>
        </div>

        {/* Webpage context pill */}
        {activeContext && (
          <button
            id="status-context-pill"
            onClick={onOpenContextModal}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-indigo-950/50 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-900/50 transition-colors"
            title={activeContext.title}
          >
            <FileText className="w-3.5 h-3.5 text-indigo-400" />
            <span className="max-w-[120px] truncate">{activeContext.title || 'Page Context'}</span>
          </button>
        )}
      </div>

      {/* Right side: Voice toggle & Settings */}
      <div className="flex items-center gap-1.5 md:gap-2">
        {/* Terminal: real persistent PowerShell session, built into JARVIS */}
        {onOpenTerminal && (
          <button
            id="btn-open-terminal"
            onClick={onOpenTerminal}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono border transition-all text-slate-400 hover:text-emerald-300 hover:bg-emerald-950/30 border-emerald-500/20"
            title="Open Terminal"
          >
            <TerminalSquare className="w-4 h-4 text-emerald-400" />
            <span className="hidden lg:inline">Terminal</span>
          </button>
        )}

        {/* Agent Mode: autonomous desktop & browser control */}
        {onOpenAgentPanel && (
          <button
            id="btn-open-agent-panel"
            onClick={onOpenAgentPanel}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono border transition-all text-slate-400 hover:text-amber-300 hover:bg-amber-950/30 border-amber-500/20"
            title="Open Agent Mode (desktop & browser control)"
          >
            <MonitorCog className="w-4 h-4 text-amber-400" />
            <span className="hidden lg:inline">Agent Mode</span>
          </button>
        )}

        {/* Code Explainer Quick Access */}
        {onOpenCodeExplainer && (
          <button
            id="btn-quick-code-explainer"
            onClick={onOpenCodeExplainer}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono border transition-all text-slate-400 hover:text-cyan-300 hover:bg-cyan-950/40 border-cyan-500/20"
            title="Open Code Explainer & Analysis"
          >
            <Code2 className="w-4 h-4 text-cyan-400" />
            <span className="hidden lg:inline">Code Audit</span>
          </button>
        )}

        {/* Webpage context button (mobile/tablet accessible) */}
        <button
          id="btn-open-context"
          onClick={onOpenContextModal}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono border transition-all ${
            activeContext
              ? 'bg-indigo-950/60 border-indigo-400/50 text-indigo-300'
              : 'text-slate-400 hover:text-cyan-300 hover:bg-cyan-950/30 border-cyan-500/20'
          }`}
          title="Attach Webpage Context"
        >
          <FileText className="w-4 h-4" />
          <span className="hidden sm:inline">{activeContext ? 'Context Linked' : 'Add Context'}</span>
        </button>

        {/* Voice Toggle */}
        <button
          id="btn-quick-voice-toggle"
          onClick={onToggleVoice}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono border transition-all ${
            voiceEnabled
              ? 'bg-cyan-950/60 border-cyan-500/50 text-cyan-300'
              : 'text-slate-400 hover:text-slate-200 border-slate-800 bg-slate-900/50'
          }`}
          title={voiceEnabled ? 'Voice Vocalization Active' : 'Voice Vocalization Muted'}
        >
          {voiceEnabled ? (
            <>
              <Volume2 className="w-4 h-4 text-cyan-400" />
              <span className="hidden sm:inline">VOICE: ON</span>
            </>
          ) : (
            <>
              <VolumeX className="w-4 h-4 text-slate-500" />
              <span className="hidden sm:inline">VOICE: OFF</span>
            </>
          )}
        </button>

        {/* Settings button */}
        <button
          id="btn-open-settings"
          onClick={onOpenSettings}
          aria-label="Open JARVIS System Settings"
          className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-cyan-950/40 border border-transparent hover:border-cyan-500/30 transition-colors"
        >
          <SettingsIcon className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
};

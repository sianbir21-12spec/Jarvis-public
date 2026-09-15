import React from 'react';
import { JarvisState } from '../types';
import { Mic, Activity, Cpu, Volume2, AlertTriangle } from 'lucide-react';

interface JarvisCoreProps {
  state: JarvisState;
  onCoreClick?: () => void;
  compact?: boolean;
}

export const JarvisCore: React.FC<JarvisCoreProps> = ({ state, onCoreClick, compact = false }) => {
  // Determine color and state labels
  const getStateDetails = () => {
    switch (state) {
      case 'listening':
        return {
          label: 'LISTENING',
          subtext: 'Awaiting Commander input...',
          color: 'from-cyan-400 to-sky-500',
          glowClass: 'hud-glow-cyan',
          ringColor: 'border-cyan-400',
          icon: Mic,
          statusColor: 'text-cyan-400 bg-cyan-950/60 border-cyan-500/40'
        };
      case 'processing':
        return {
          label: 'PROCESSING',
          subtext: 'Analyzing neural pathways...',
          color: 'from-blue-500 to-indigo-500',
          glowClass: 'hud-glow-blue',
          ringColor: 'border-blue-400',
          icon: Cpu,
          statusColor: 'text-blue-400 bg-blue-950/60 border-blue-500/40'
        };
      case 'speaking':
        return {
          label: 'SPEAKING',
          subtext: 'Transmitting vocal synthesis...',
          color: 'from-teal-400 to-cyan-300',
          glowClass: 'hud-glow-cyan',
          ringColor: 'border-teal-400',
          icon: Volume2,
          statusColor: 'text-teal-400 bg-teal-950/60 border-teal-500/40'
        };
      case 'error':
        return {
          label: 'ANOMALY',
          subtext: 'System alert registered',
          color: 'from-red-500 to-amber-500',
          glowClass: 'hud-glow-red',
          ringColor: 'border-red-400',
          icon: AlertTriangle,
          statusColor: 'text-red-400 bg-red-950/60 border-red-500/40'
        };
      case 'idle':
      default:
        return {
          label: 'ONLINE',
          subtext: 'Awaiting command directive',
          color: 'from-cyan-500 to-blue-600',
          glowClass: 'hud-glow-cyan',
          ringColor: 'border-cyan-500/50',
          icon: Activity,
          statusColor: 'text-cyan-400 bg-cyan-950/40 border-cyan-500/30'
        };
    }
  };

  const details = getStateDetails();
  const Icon = details.icon;

  if (compact) {
    return (
      <div 
        id="jarvis-core-compact"
        onClick={onCoreClick}
        className="flex items-center gap-3 cursor-pointer select-none group"
      >
        <div className="relative w-9 h-9 flex items-center justify-center">
          {/* Outer rotating dash ring */}
          <div className={`absolute inset-0 rounded-full border border-dashed ${details.ringColor} jarvis-ring-outer opacity-75`} />
          {/* Inner pulse */}
          <div className={`w-6 h-6 rounded-full bg-gradient-to-tr ${details.color} opacity-80 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
            <div className="w-2 h-2 rounded-full bg-white animate-ping" />
          </div>
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-hud font-bold tracking-widest text-cyan-300">JARVIS</span>
          <span className="text-[10px] text-slate-400 font-mono tracking-wider">{details.label}</span>
        </div>
      </div>
    );
  }

  return (
    <div 
      id="jarvis-core-main"
      className="flex flex-col items-center justify-center p-4 select-none my-2 transition-all duration-500"
    >
      <div 
        onClick={onCoreClick}
        className={`relative w-36 h-36 md:w-44 md:h-44 flex items-center justify-center cursor-pointer transition-transform duration-300 ${state === 'listening' ? 'jarvis-listening-ring' : ''}`}
      >
        {/* Outer Orbit Dots */}
        <div className="absolute inset-0 rounded-full border border-cyan-500/20 jarvis-ring-outer">
          <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-cyan-400 shadow-[0_0_10px_#06b6d4]" />
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-sky-400 shadow-[0_0_8px_#38bdf8]" />
          <div className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-2 h-2 rounded-full bg-cyan-300 shadow-[0_0_8px_#67e8f9]" />
          <div className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-blue-400 shadow-[0_0_8px_#60a5fa]" />
        </div>

        {/* Middle Segment Ring */}
        <div className="absolute inset-3 rounded-full border-2 border-dashed border-cyan-500/40 jarvis-ring-middle" />

        {/* Inner Counter Ring with tick marks */}
        <div className="absolute inset-7 rounded-full border border-cyan-400/60 jarvis-ring-inner">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-2 bg-cyan-300" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-2 bg-cyan-300" />
          <div className="absolute top-1/2 left-0 -translate-y-1/2 w-2 h-1 bg-cyan-300" />
          <div className="absolute top-1/2 right-0 -translate-y-1/2 w-2 h-1 bg-cyan-300" />
        </div>

        {/* Central Glowing Core */}
        <div className={`relative w-20 h-20 md:w-24 md:h-24 rounded-full bg-gradient-to-br ${details.color} p-[2px] jarvis-core-pulse ${details.glowClass}`}>
          <div className="w-full h-full rounded-full bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-2 text-center border border-cyan-400/40">
            {state === 'speaking' ? (
              /* Audio frequency equalizer wave */
              <div className="flex items-center justify-center gap-1 h-8">
                {[0.4, 0.8, 1, 0.6, 0.9, 0.5, 0.7].map((h, i) => (
                  <div
                    key={i}
                    className="w-1 bg-cyan-400 rounded-full animate-pulse"
                    style={{
                      height: `${h * 24}px`,
                      animationDelay: `${i * 120}ms`,
                      animationDuration: '600ms'
                    }}
                  />
                ))}
              </div>
            ) : (
              <>
                <Icon className={`w-6 h-6 md:w-7 md:h-7 text-cyan-300 transition-all ${state === 'processing' ? 'animate-spin' : ''}`} />
                <span className="font-hud font-extrabold text-[10px] md:text-xs tracking-widest text-cyan-200 mt-1">
                  JARVIS
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Futuristic Status Badge Below Core */}
      <div className="mt-3 flex flex-col items-center gap-1">
        <div className={`px-3 py-0.5 rounded-full text-xs font-mono font-semibold tracking-wider border uppercase flex items-center gap-1.5 shadow-sm ${details.statusColor}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-current animate-ping" />
          <span>{details.label}</span>
        </div>
        <p className="text-[11px] text-slate-400 font-mono tracking-tight text-center">
          {details.subtext}
        </p>
      </div>
    </div>
  );
};

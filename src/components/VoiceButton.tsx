import React from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { JarvisState } from '../types';

interface VoiceButtonProps {
  state: JarvisState;
  isListening: boolean;
  onToggleListen: () => void;
  disabled?: boolean;
}

export const VoiceButton: React.FC<VoiceButtonProps> = ({
  state,
  isListening,
  onToggleListen,
  disabled = false
}) => {
  return (
    <div className="relative inline-flex items-center justify-center">
      {/* Dynamic Pulse Ring when listening */}
      {isListening && (
        <>
          <div className="absolute inset-0 rounded-xl bg-cyan-500/30 animate-ping" />
          <div className="absolute -inset-1 rounded-xl border border-cyan-400/60 animate-pulse" />
        </>
      )}

      <button
        id="btn-voice-input"
        type="button"
        onClick={onToggleListen}
        disabled={disabled}
        aria-label={isListening ? 'Stop Voice Recording' : 'Start Voice Recording'}
        title={isListening ? 'Click to stop listening' : 'Speak to JARVIS'}
        className={`relative z-10 p-2.5 rounded-xl border transition-all duration-300 flex items-center justify-center ${
          isListening
            ? 'bg-cyan-500 text-slate-950 border-cyan-300 shadow-[0_0_20px_#06b6d4] scale-105'
            : state === 'speaking'
            ? 'bg-teal-950/60 text-teal-400 border-teal-500/40 hover:bg-teal-900/60'
            : 'bg-slate-900/80 text-slate-400 hover:text-cyan-300 hover:bg-cyan-950/40 border-cyan-500/20 hover:border-cyan-500/50'
        } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        {isListening ? (
          <Mic className="w-5 h-5 animate-bounce" />
        ) : state === 'processing' ? (
          <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
        ) : (
          <Mic className="w-5 h-5" />
        )}
      </button>
    </div>
  );
};

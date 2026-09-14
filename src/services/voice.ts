// Browser + Electron Voice Service
// Chrome/Edge: Web Speech API (live captions)
// Electron: MediaRecorder -> POST /api/transcribe (Web Speech has no Google keys in Electron)

export interface VoiceListenOptions {
  onResult: (transcript: string, isFinal: boolean) => void;
  onEnd: () => void;
  onError: (errorMessage: string) => void;
}

export interface VoiceSpeakOptions {
  rate?: number;
  pitch?: number;
  voiceURI?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: any) => void;
}

class VoiceService {
  private recognition: any = null;
  private isListening = false;
  private voices: SpeechSynthesisVoice[] = [];
  private audioCtx: AudioContext | null = null;
  private voiceListeners: ((voices: SpeechSynthesisVoice[]) => void)[] = [];
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private mediaStream: MediaStream | null = null;
  private recorderMime = 'audio/webm';

  constructor() {
    this.initVoices();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        this.initVoices();
        this.notifyVoiceListeners();
      };
    }
  }

  public isElectron(): boolean {
    return typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent);
  }

  private hasNativeSpeech(): boolean {
    if (typeof window === 'undefined') return false;
    return !!(
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    );
  }

  private initVoices() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const list = window.speechSynthesis.getVoices();
      if (list && list.length > 0) {
        this.voices = list;
      }
    }
  }

  private notifyVoiceListeners() {
    for (const listener of this.voiceListeners) {
      try {
        listener(this.voices);
      } catch (e) {
        console.error('Error in voice change listener', e);
      }
    }
  }

  public onVoicesChanged(listener: (voices: SpeechSynthesisVoice[]) => void): () => void {
    this.voiceListeners.push(listener);
    if (this.voices.length > 0) {
      listener(this.voices);
    }
    return () => {
      this.voiceListeners = this.voiceListeners.filter((l) => l !== listener);
    };
  }

  public async loadVoices(): Promise<SpeechSynthesisVoice[]> {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return [];
    }

    const immediate = window.speechSynthesis.getVoices();
    if (immediate && immediate.length > 0) {
      this.voices = immediate;
      return immediate;
    }

    return new Promise((resolve) => {
      let resolved = false;
      const handler = () => {
        if (resolved) return;
        resolved = true;
        this.voices = window.speechSynthesis.getVoices();
        resolve(this.voices);
      };

      window.speechSynthesis.onvoiceschanged = () => {
        handler();
        this.notifyVoiceListeners();
      };

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.voices = window.speechSynthesis.getVoices();
          resolve(this.voices);
        }
      }, 500);
    });
  }

  public isSpeechRecognitionSupported(): boolean {
    if (typeof window === 'undefined') return false;
    if (this.isElectron()) return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    return this.hasNativeSpeech();
  }

  public isSpeechSynthesisSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  }

  public getVoices(): SpeechSynthesisVoice[] {
    if (!this.voices.length && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.voices = window.speechSynthesis.getVoices();
    }
    return this.voices;
  }

  public playBeep(type: 'start' | 'stop' | 'error' | 'success') {
    try {
      if (!this.audioCtx) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;
        this.audioCtx = new AudioContextClass();
      }

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      const now = this.audioCtx.currentTime;

      if (type === 'start') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(660, now);
        osc.frequency.exponentialRampToValueAtTime(1100, now + 0.12);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'stop') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.12);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'success') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.setValueAtTime(780, now + 0.08);
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === 'error') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.setValueAtTime(180, now + 0.1);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch {
      // Audio context might be restricted before user gesture
    }
  }

  public startListening(options: VoiceListenOptions) {
    this.stopListening();

    if (this.isElectron() || !this.hasNativeSpeech()) {
      void this.startMediaRecorderListening(options);
      return;
    }

    this.startWebSpeechListening(options);
  }

  private startWebSpeechListening(options: VoiceListenOptions) {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      this.recognition.onstart = () => {
        this.isListening = true;
        this.playBeep('start');
      };

      this.recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        const currentText = finalTranscript || interimTranscript;
        options.onResult(currentText, !!finalTranscript);
      };

      this.recognition.onerror = (event: any) => {
        this.isListening = false;
        if (event.error === 'network') {
          void this.startMediaRecorderListening(options);
          return;
        }
        let msg = 'Speech recognition error occurred.';
        if (event.error === 'not-allowed') {
          msg = 'Microphone permission was denied. Allow microphone access and try again.';
        } else if (event.error === 'no-speech') {
          msg = 'No speech was detected. Please try again.';
        }
        this.playBeep('error');
        options.onError(msg);
      };

      this.recognition.onend = () => {
        if (this.mediaRecorder) return;
        this.isListening = false;
        this.playBeep('stop');
        options.onEnd();
      };

      this.recognition.start();
    } catch (err: any) {
      this.isListening = false;
      options.onError(err.message || 'Unable to start speech recognition.');
    }
  }

  private pickRecorderMime(): string {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4'
    ];
    for (const type of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return 'audio/webm';
  }

  private async startMediaRecorderListening(options: VoiceListenOptions) {
    if (!navigator.mediaDevices?.getUserMedia) {
      options.onError('Microphone capture is not available in this window.');
      return;
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      this.recorderMime = this.pickRecorderMime();
      this.recordedChunks = [];
      this.mediaRecorder = new MediaRecorder(this.mediaStream, { mimeType: this.recorderMime });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.onerror = () => {
        this.cleanupRecorder();
        this.playBeep('error');
        options.onError('Microphone recording failed.');
        options.onEnd();
      };

      this.mediaRecorder.onstop = async () => {
        const blob = new Blob(this.recordedChunks, {
          type: this.recorderMime.split(';')[0]
        });
        this.cleanupRecorder();

        if (blob.size < 800) {
          this.playBeep('error');
          options.onError('No speech was detected. Click the mic, speak, then click again to stop.');
          options.onEnd();
          return;
        }

        options.onResult('Transcribing speech…', false);
        try {
          const text = await this.transcribeBlob(blob);
          if (text.trim()) {
            this.playBeep('success');
            options.onResult(text.trim(), true);
          } else {
            this.playBeep('error');
            options.onError('No speech was detected. Please try again.');
          }
        } catch (err: any) {
          this.playBeep('error');
          options.onError(err?.message || 'Transcription failed.');
        } finally {
          this.isListening = false;
          options.onEnd();
        }
      };

      this.mediaRecorder.start(250);
      this.isListening = true;
      this.playBeep('start');
    } catch (err: any) {
      this.cleanupRecorder();
      this.isListening = false;
      const denied = /denied|notallowed|permission/i.test(String(err?.name || err?.message || ''));
      options.onError(
        denied
          ? 'Microphone permission was denied. Allow the mic for JARVIS and try again.'
          : err?.message || 'Unable to access the microphone.'
      );
    }
  }

  private async transcribeBlob(blob: Blob): Promise<string> {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) {
      binary += String.fromCharCode(...bytes.subarray(i, i + step));
    }

    const res = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audio: btoa(binary),
        mimeType: blob.type || 'audio/webm'
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Speech transcription failed.');
    }
    return typeof data.text === 'string' ? data.text : '';
  }

  private cleanupRecorder() {
    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        track.stop();
      }
    }
    this.mediaStream = null;
    this.mediaRecorder = null;
    this.recordedChunks = [];
  }

  public stopListening() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {
        this.cleanupRecorder();
      }
      this.isListening = false;
      return;
    }

    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch {
        // Ignored
      }
    }
    this.isListening = false;
  }

  public speak(text: string, options: VoiceSpeakOptions = {}): void {
    if (!this.isSpeechSynthesisSupported()) {
      options.onError?.('Speech synthesis is not supported on this browser.');
      return;
    }

    const cleanText = text
      .replace(/```[\s\S]*?```/g, 'Code block omitted.')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/[*#_~>]/g, '')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      .trim();

    if (!cleanText) return;

    this.stopSpeaking();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = options.rate || 1.0;
    utterance.pitch = options.pitch || 1.0;

    const voices = this.getVoices();
    if (options.voiceURI) {
      const selected = voices.find((v) => v.voiceURI === options.voiceURI);
      if (selected) utterance.voice = selected;
    }

    if (!utterance.voice && voices.length > 0) {
      const jarvisVoice =
        voices.find((v) => v.lang.startsWith('en-GB') || v.name.includes('UK') || v.name.includes('George') || v.name.includes('Daniel') || v.name.includes('Male')) ||
        voices.find((v) => v.lang.startsWith('en')) ||
        voices[0];
      if (jarvisVoice) utterance.voice = jarvisVoice;
    }

    utterance.onstart = () => {
      options.onStart?.();
    };

    utterance.onend = () => {
      options.onEnd?.();
    };

    utterance.onerror = (e) => {
      options.onError?.(e);
    };

    window.speechSynthesis.speak(utterance);
  }

  public stopSpeaking() {
    if (this.isSpeechSynthesisSupported()) {
      window.speechSynthesis.cancel();
    }
  }

  public isSpeaking(): boolean {
    if (!this.isSpeechSynthesisSupported()) return false;
    return window.speechSynthesis.speaking;
  }
}

export const voiceService = new VoiceService();

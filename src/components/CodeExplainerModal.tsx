import React, { useState } from 'react';
import { 
  Code2, 
  X, 
  Sparkles, 
  Play, 
  Copy, 
  Check, 
  Terminal, 
  Cpu, 
  SlidersHorizontal 
} from 'lucide-react';

interface CodeExplainerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitCode: (code: string, language: string, focus: string) => void;
  initialCode?: string;
  initialLanguage?: string;
}

export const COMMON_LANGUAGES = [
  { id: 'typescript', label: 'TypeScript', ext: 'ts' },
  { id: 'javascript', label: 'JavaScript', ext: 'js' },
  { id: 'python', label: 'Python', ext: 'py' },
  { id: 'cpp', label: 'C / C++', ext: 'cpp' },
  { id: 'java', label: 'Java', ext: 'java' },
  { id: 'go', label: 'Go', ext: 'go' },
  { id: 'rust', label: 'Rust', ext: 'rs' },
  { id: 'csharp', label: 'C#', ext: 'cs' },
  { id: 'sql', label: 'SQL', ext: 'sql' },
  { id: 'bash', label: 'Bash / Shell', ext: 'sh' },
  { id: 'html', label: 'HTML / CSS', ext: 'html' },
  { id: 'php', label: 'PHP', ext: 'php' },
  { id: 'ruby', label: 'Ruby', ext: 'rb' },
  { id: 'swift', label: 'Swift', ext: 'swift' },
  { id: 'kotlin', label: 'Kotlin', ext: 'kt' }
];

export const ANALYSIS_MODES = [
  {
    id: 'comprehensive',
    title: 'Full Analysis (Standard)',
    description: 'Functionality, step-by-step logic, edge cases, and actionable improvements.'
  },
  {
    id: 'logic_flow',
    title: 'Deep Execution Flow',
    description: 'Detailed trace of variable states, control branches, and runtime dynamics.'
  },
  {
    id: 'performance',
    title: 'Complexity & Performance',
    description: 'Time & space complexity (Big-O), memory overhead, and latency optimizations.'
  },
  {
    id: 'refactor',
    title: 'Modernization & Refactoring',
    description: 'Idiomatic patterns, readability, type safety, and clean architecture rewrite.'
  }
];

const CODE_SAMPLES: Record<string, { code: string; language: string }> = {
  python: {
    language: 'python',
    code: `def find_longest_consecutive_subsequence(nums: list[int]) -> int:
    num_set = set(nums)
    longest_streak = 0

    for num in num_set:
        # Check if num is the start of a streak
        if num - 1 not in num_set:
            current_num = num
            current_streak = 1

            while current_num + 1 in num_set:
                current_num += 1
                current_streak += 1

            longest_streak = max(longest_streak, current_streak)

    return longest_streak`
  },
  typescript: {
    language: 'typescript',
    code: `interface Task<T> {
  id: string;
  run: () => Promise<T>;
}

export async function runWithConcurrency<T>(
  tasks: Task<T>[],
  limit: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let currentIndex = 0;

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (currentIndex < tasks.length) {
      const idx = currentIndex++;
      results[idx] = await tasks[idx].run();
    }
  });

  await Promise.all(workers);
  return results;
}`
  },
  rust: {
    language: 'rust',
    code: `use std::sync::{Arc, Mutex};
use std::thread;

fn parallel_accumulator(data: Vec<i32>) -> i32 {
    let sum = Arc::new(Mutex::new(0));
    let mut handles = vec![];

    for chunk in data.chunks(4) {
        let sum_clone = Arc::clone(&sum);
        let chunk_data = chunk.to_vec();
        let handle = thread::spawn(move || {
            let partial: i32 = chunk_data.iter().sum();
            let mut lock = sum_clone.lock().unwrap();
            *lock += partial;
        });
        handles.push(handle);
    }

    for handle in handles {
        handle.join().unwrap();
    }

    let result = *sum.lock().unwrap();
    result
}`
  }
};

export const CodeExplainerModal: React.FC<CodeExplainerModalProps> = ({
  isOpen,
  onClose,
  onSubmitCode,
  initialCode = '',
  initialLanguage = 'typescript'
}) => {
  const [code, setCode] = useState(initialCode);
  const [language, setLanguage] = useState(initialLanguage);
  const [focus, setFocus] = useState('comprehensive');
  const [copied, setCopied] = useState(false);

  // Sync props if modal opens with code
  React.useEffect(() => {
    if (initialCode) {
      setCode(initialCode);
    }
    if (initialLanguage) {
      setLanguage(initialLanguage);
    }
  }, [initialCode, initialLanguage, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    onSubmitCode(code.trim(), language, focus);
    onClose();
  };

  const loadSample = (langKey: string) => {
    const sample = CODE_SAMPLES[langKey];
    if (sample) {
      setCode(sample.code);
      setLanguage(sample.language);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 md:p-6">
      <div className="w-full max-w-3xl bg-slate-950 border border-cyan-500/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-4 border-b border-cyan-500/20 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-950 border border-cyan-500/40 flex items-center justify-center text-cyan-300">
              <Code2 className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-sm font-hud font-bold tracking-wider text-cyan-200">
                CODE ANALYSIS & EXPLANATION PROTOCOL
              </h2>
              <p className="text-[11px] font-mono text-slate-400">
                Step-by-step logic dissection, edge case auditing, and optimizations
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-5 space-y-4">
          {/* Language & Preset Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/50 p-3 rounded-xl border border-cyan-500/20">
            <div className="flex items-center gap-2">
              <label className="text-xs font-mono text-slate-300">Language:</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="bg-slate-950 border border-cyan-500/30 rounded-lg px-2.5 py-1.5 text-xs font-mono text-cyan-200 focus:outline-none focus:border-cyan-400"
              >
                {COMMON_LANGUAGES.map((lang) => (
                  <option key={lang.id} value={lang.id}>
                    {lang.label} (.{lang.ext})
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Sample Presets */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-mono text-slate-400 mr-1 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-cyan-400" /> Presets:
              </span>
              <button
                type="button"
                onClick={() => loadSample('python')}
                className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 hover:bg-cyan-950/60 border border-slate-700 hover:border-cyan-500/30 text-slate-300 transition-colors"
              >
                Python Streak
              </button>
              <button
                type="button"
                onClick={() => loadSample('typescript')}
                className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 hover:bg-cyan-950/60 border border-slate-700 hover:border-cyan-500/30 text-slate-300 transition-colors"
              >
                TS Concurrency
              </button>
              <button
                type="button"
                onClick={() => loadSample('rust')}
                className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 hover:bg-cyan-950/60 border border-slate-700 hover:border-cyan-500/30 text-slate-300 transition-colors"
              >
                Rust Mutex
              </button>
            </div>
          </div>

          {/* Code Input Area */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-mono text-slate-300 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                <span>Input Code Snippet:</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-slate-500">
                  {code.split('\n').length} lines • {code.length} chars
                </span>
                {code && (
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="text-[11px] font-mono text-slate-400 hover:text-cyan-300 flex items-center gap-1 transition-colors"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                )}
              </div>
            </div>

            <textarea
              rows={10}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={`// Paste your ${language} code snippet here...\nfunction example() {\n  // JARVIS will explain functionality, logic & potential improvements\n}`}
              className="w-full bg-slate-950/90 border border-cyan-500/30 rounded-xl p-3 text-xs md:text-sm font-mono-code text-cyan-100 placeholder-slate-600 focus:outline-none focus:border-cyan-400 focus:shadow-[0_0_15px_rgba(6,182,212,0.15)] custom-scrollbar resize-y"
              required
            />
          </div>

          {/* Analysis Mode Selector */}
          <div>
            <label className="text-xs font-mono text-slate-300 mb-2 flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
              <span>Analysis Depth & Focus:</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {ANALYSIS_MODES.map((mode) => (
                <div
                  key={mode.id}
                  onClick={() => setFocus(mode.id)}
                  className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                    focus === mode.id
                      ? 'bg-cyan-950/40 border-cyan-400 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                      : 'bg-slate-900/40 border-slate-800 hover:border-cyan-500/30 text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono font-semibold text-slate-200">
                      {mode.title}
                    </span>
                    {focus === mode.id && <span className="w-2 h-2 rounded-full bg-cyan-400" />}
                  </div>
                  <p className="text-[11px] font-mono text-slate-400 leading-tight">
                    {mode.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Guidelines Notice */}
          <div className="p-3 rounded-xl bg-slate-900/50 border border-cyan-500/10 text-[11px] font-mono text-slate-400 leading-relaxed flex items-start gap-2">
            <Cpu className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
            <span>
              JARVIS will generate a 4-stage breakdown: <strong>1. Functionality Overview</strong>, <strong>2. Step-by-Step Logic Walkthrough</strong>, <strong>3. Complexity & Boundary Conditions</strong>, and <strong>4. Actionable Improvements</strong> with optimized code samples.
            </span>
          </div>

          {/* Modal Footer */}
          <div className="pt-2 flex items-center justify-between border-t border-cyan-500/20">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-mono text-slate-400 hover:text-white"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={!code.trim()}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-mono text-xs font-bold shadow-[0_0_15px_rgba(6,182,212,0.3)] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>Explain Code with JARVIS</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

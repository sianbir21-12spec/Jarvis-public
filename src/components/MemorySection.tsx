import React, { useEffect, useState } from 'react';
import { BrainCircuit, Plus, Trash2, Pencil, Check, X, Loader2, Bot, User as UserIcon } from 'lucide-react';

/**
 * Settings panel for JARVIS's long-term memory store (server/memory/memoryStore.ts).
 * Lets the user see everything JARVIS has remembered -- whether they typed
 * it here or the agent saved it itself via memory_remember -- and edit,
 * delete, or add entries. Mirrors CredentialsSection's fetch-driven,
 * backend-owns-the-data pattern.
 */

interface MemoryEntry {
  id: string;
  text: string;
  category: string;
  createdAt: number;
  updatedAt: number;
  source: 'user' | 'agent';
}

const inputClass =
  'w-full bg-slate-900 border border-cyan-500/30 rounded-xl px-3 py-2 text-xs font-mono text-cyan-200 focus:outline-none focus:border-cyan-400';

export const MemorySection: React.FC = () => {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [newText, setNewText] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editCategory, setEditCategory] = useState('');

  const [confirmingClear, setConfirmingClear] = useState(false);

  const load = async () => {
    try {
      const res = await fetch('/api/memory');
      const data = await res.json();
      setEntries(Array.isArray(data.entries) ? data.entries : []);
    } catch {
      setError('Could not reach the JARVIS backend to load memory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdd = async () => {
    if (!newText.trim()) return;
    setAdding(true);
    setError('');
    try {
      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newText.trim(), category: newCategory.trim() || 'general' })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Failed to save memory.');
        return;
      }
      setNewText('');
      setNewCategory('');
      await load();
    } catch {
      setError('Could not reach the JARVIS backend.');
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (entry: MemoryEntry) => {
    setEditingId(entry.id);
    setEditText(entry.text);
    setEditCategory(entry.category);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
    setEditCategory('');
  };

  const saveEdit = async (id: string) => {
    try {
      const res = await fetch(`/api/memory/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: editText.trim(), category: editCategory.trim() || 'general' })
      });
      if (!res.ok) {
        setError('Failed to update memory.');
        return;
      }
      cancelEdit();
      await load();
    } catch {
      setError('Could not reach the JARVIS backend.');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/memory/${id}`, { method: 'DELETE' });
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch {
      setError('Failed to delete memory.');
    }
  };

  const handleClearAll = async () => {
    if (!confirmingClear) {
      setConfirmingClear(true);
      return;
    }
    try {
      await fetch('/api/memory', { method: 'DELETE' });
      setEntries([]);
    } catch {
      setError('Failed to clear memory.');
    } finally {
      setConfirmingClear(false);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-hud font-semibold text-cyan-400 flex items-center justify-between border-b border-cyan-500/20 pb-1">
        <span className="flex items-center gap-2">
          <BrainCircuit className="w-4 h-4" />
          <span>LONG-TERM MEMORY</span>
        </span>
        {entries.length > 0 && (
          <button
            type="button"
            onClick={handleClearAll}
            className={`text-[10px] font-mono px-2 py-1 rounded-lg border transition-colors ${
              confirmingClear
                ? 'border-red-500/60 text-red-300 bg-red-500/10'
                : 'border-slate-700 text-slate-400 hover:text-red-300 hover:border-red-500/40'
            }`}
          >
            {confirmingClear ? 'Confirm clear all?' : 'Clear all'}
          </button>
        )}
      </h3>

      <p className="text-[11px] font-mono text-slate-400">
        Durable facts JARVIS keeps across chat and agent sessions -- preferences, recurring project
        details, corrections you've given it. The agent can also save these itself mid-task via its
        memory_remember tool (shown with a bot icon below).
      </p>

      {error && (
        <div className="text-[11px] font-mono text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Add new entry */}
      <div className="flex gap-2 items-start">
        <input
          type="text"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !adding) handleAdd();
          }}
          placeholder="Add something for JARVIS to remember…"
          className={`${inputClass} flex-1`}
        />
        <input
          type="text"
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          placeholder="category"
          className={`${inputClass} w-28`}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={adding || !newText.trim()}
          className="p-2 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        </button>
      </div>

      {/* List */}
      <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
        {loading ? (
          <div className="text-xs font-mono text-slate-500 flex items-center gap-2 py-4 justify-center">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading memory…
          </div>
        ) : entries.length === 0 ? (
          <div className="text-xs font-mono text-slate-500 text-center py-4">Nothing remembered yet.</div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className="bg-slate-900/70 border border-cyan-500/15 rounded-xl px-3 py-2 flex items-start gap-2"
            >
              {entry.source === 'agent' ? (
                <Bot className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
              ) : (
                <UserIcon className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
              )}

              {editingId === entry.id ? (
                <div className="flex-1 space-y-1.5">
                  <input
                    type="text"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className={inputClass}
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      className={`${inputClass} w-28`}
                    />
                    <button
                      type="button"
                      onClick={() => saveEdit(entry.id)}
                      className="p-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-slate-200 break-words">{entry.text}</p>
                    <span className="text-[10px] font-mono uppercase tracking-wide text-cyan-500/70">
                      {entry.category}
                    </span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(entry)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-slate-800"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(entry.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

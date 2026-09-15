import React, { useState } from 'react';
import { Conversation } from '../types';
import { Plus, MessageSquare, Trash2, Edit2, Check, X, Search, Download, Trash, ChevronLeft } from 'lucide-react';

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, newTitle: string) => void;
  onClearAll: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  activeId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onRenameConversation,
  onClearAll,
  isOpen,
  onClose
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const startEditing = (c: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(c.id);
    setEditTitle(c.title);
  };

  const saveEditing = (id: string, e?: React.FormEvent) => {
    e?.preventDefault();
    if (editTitle.trim()) {
      onRenameConversation(id, editTitle.trim());
    }
    setEditingId(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
  };

  const handleExport = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(conversations, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `JARVIS_PROTOCOLS_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <>
      {/* Mobile backdrop overlay */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-30 lg:hidden"
        />
      )}

      {/* Sidebar Panel */}
      <aside
        id="jarvis-sidebar"
        className={`fixed lg:static top-0 bottom-0 left-0 w-72 md:w-80 bg-slate-950/95 border-r border-cyan-500/20 z-40 flex flex-col transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-cyan-500/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-cyan-400" />
            <h2 className="text-xs font-hud font-bold tracking-widest text-cyan-300">
              CONVERSATIONS
            </h2>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-1 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-slate-900 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>

        {/* New Chat Button */}
        <div className="p-3">
          <button
            id="btn-new-chat"
            onClick={() => {
              onNewConversation();
              if (window.innerWidth < 1024) onClose();
            }}
            className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-cyan-950/80 to-blue-950/80 hover:from-cyan-900/80 hover:to-blue-900/80 border border-cyan-500/40 hover:border-cyan-400 text-cyan-200 font-mono text-xs font-semibold flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(6,182,212,0.15)] transition-all group"
          >
            <Plus className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
            <span>+ NEW PROTOCOL</span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversation archives..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-900/60 border border-cyan-500/20 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/60"
            />
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-2 space-y-1 py-1">
          {filtered.length === 0 ? (
            <div className="text-center py-8 px-4 text-slate-500 text-xs font-mono">
              {searchQuery ? 'No matching logs found.' : 'No active protocols registered.'}
            </div>
          ) : (
            filtered.map((conv) => {
              const isActive = conv.id === activeId;
              const isEditing = conv.id === editingId;

              return (
                <div
                  key={conv.id}
                  onClick={() => {
                    if (!isEditing) {
                      onSelectConversation(conv.id);
                      if (window.innerWidth < 1024) onClose();
                    }
                  }}
                  className={`group relative w-full p-2.5 rounded-xl text-left border transition-all cursor-pointer ${
                    isActive
                      ? 'bg-cyan-950/40 border-cyan-500/50 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.1)]'
                      : 'bg-slate-900/30 border-transparent hover:bg-slate-900/70 hover:border-cyan-500/20 text-slate-300'
                  }`}
                >
                  {isEditing ? (
                    <form
                      onSubmit={(e) => saveEditing(conv.id, e)}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1"
                    >
                      <input
                        type="text"
                        autoFocus
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="flex-1 bg-slate-950 border border-cyan-400 rounded px-1.5 py-0.5 text-xs font-mono text-white focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="p-1 text-emerald-400 hover:text-emerald-300"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditing}
                        className="p-1 text-red-400 hover:text-red-300"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-mono truncate font-medium">
                          {conv.title || 'Untitled Session'}
                        </p>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {conv.messages.length} directives • {new Date(conv.updatedAt).toLocaleDateString()}
                        </span>
                      </div>

                      {/* Hover Actions */}
                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                        <button
                          onClick={(e) => startEditing(conv, e)}
                          title="Rename Protocol"
                          className="p-1 text-slate-400 hover:text-cyan-300 hover:bg-slate-800 rounded"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm('Purge this conversation protocol permanently?')) {
                              onDeleteConversation(conv.id);
                            }
                          }}
                          title="Delete Protocol"
                          className="p-1 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-cyan-500/20 bg-slate-950 flex items-center justify-between text-xs font-mono text-slate-400">
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:text-cyan-300 hover:bg-cyan-950/40 transition-colors"
            title="Export conversation logs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>

          <button
            onClick={() => {
              if (window.confirm('Wipe ALL conversation archives from local storage?')) {
                onClearAll();
              }
            }}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:text-red-400 hover:bg-red-950/40 text-slate-500 transition-colors"
            title="Wipe all conversation logs"
          >
            <Trash className="w-3.5 h-3.5" />
            <span>Wipe All</span>
          </button>
        </div>
      </aside>
    </>
  );
};

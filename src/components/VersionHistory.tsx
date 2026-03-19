/**
 * VersionHistory.tsx — Lyric version history panel.
 *
 * Features:
 *  - Save current lyrics as a named snapshot
 *  - List all snapshots with timestamps
 *  - Preview snapshot content
 *  - Restore a snapshot (replaces current lyrics)
 *  - Rename and delete snapshots
 *  - Simple diff indicator (lines added/removed)
 */

import React, { useState } from 'react';
import { useArrangementStore } from '../store/arrangementStore';
import { useStore } from '../store/useStore';
import { History, Save, Trash2, RotateCcw, Eye, EyeOff, Edit3, Check, X } from 'lucide-react';

export function VersionHistory() {
  const { snapshots, addSnapshot, deleteSnapshot, renameSnapshot } = useArrangementStore();
  const { lyrics, setLyrics, stylePrompt, setStylePrompt, currentTemplateId } = useStore();

  const [previewId, setPreviewId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [saveLabel, setSaveLabel] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);

  const handleSave = () => {
    const label = saveLabel.trim() || undefined;
    addSnapshot(lyrics, stylePrompt, currentTemplateId, label);
    setSaveLabel('');
    setShowSaveInput(false);
  };

  const handleRestore = (id: string) => {
    const snap = snapshots.find((s) => s.id === id);
    if (!snap) return;
    // Save current state as auto-snapshot before restoring
    addSnapshot(lyrics, stylePrompt, currentTemplateId, `Auto-save before restore`);
    setLyrics(snap.lyrics);
    setStylePrompt(snap.stylePrompt);
  };

  const handleStartRename = (id: string, currentLabel: string) => {
    setEditingId(id);
    setEditLabel(currentLabel);
  };

  const handleConfirmRename = () => {
    if (editingId && editLabel.trim()) {
      renameSnapshot(editingId, editLabel.trim());
    }
    setEditingId(null);
    setEditLabel('');
  };

  const getLineDiff = (snapLyrics: string): { added: number; removed: number } => {
    const currentLines = lyrics.split('\n');
    const snapLines = snapLyrics.split('\n');
    const currentSet = new Set(currentLines.map((l) => l.trim()));
    const snapSet = new Set(snapLines.map((l) => l.trim()));

    let added = 0;
    let removed = 0;
    for (const line of currentLines) {
      if (line.trim() && !snapSet.has(line.trim())) added++;
    }
    for (const line of snapLines) {
      if (line.trim() && !currentSet.has(line.trim())) removed++;
    }
    return { added, removed };
  };

  const previewSnap = snapshots.find((s) => s.id === previewId);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          <History className="w-4 h-4" />
          Version History
        </div>
        {!showSaveInput ? (
          <button
            onClick={() => setShowSaveInput(true)}
            disabled={!lyrics.trim()}
            className="flex items-center gap-1 px-2 py-1 text-xs text-indigo-400 hover:bg-indigo-500/10 rounded-md transition-colors disabled:opacity-30"
          >
            <Save className="w-3 h-3" />
            Save
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={saveLabel}
              onChange={(e) => setSaveLabel(e.target.value)}
              placeholder="Label (optional)"
              className="w-28 bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
            <button
              onClick={handleSave}
              className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors"
            >
              <Check className="w-3 h-3" />
            </button>
            <button
              onClick={() => setShowSaveInput(false)}
              className="p-1 text-zinc-500 hover:bg-zinc-800 rounded transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Snapshot list */}
      <div className="flex-1 overflow-y-auto">
        {snapshots.length === 0 ? (
          <div className="p-4 text-center text-zinc-600 text-xs">
            <History className="w-6 h-6 mx-auto mb-2 opacity-30" />
            No snapshots yet. Save your first version above.
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/50">
            {snapshots.map((snap) => {
              const diff = getLineDiff(snap.lyrics);
              const isEditing = editingId === snap.id;
              const isPreviewing = previewId === snap.id;

              return (
                <div key={snap.id} className="p-3 hover:bg-zinc-800/30 transition-colors">
                  {/* Snapshot header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                            autoFocus
                            onKeyDown={(e) => e.key === 'Enter' && handleConfirmRename()}
                          />
                          <button
                            onClick={handleConfirmRename}
                            className="p-0.5 text-emerald-400"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="text-xs font-medium text-zinc-300 truncate">
                          {snap.label}
                        </div>
                      )}
                      <div className="text-[10px] text-zinc-600 mt-0.5">
                        {new Date(snap.timestamp).toLocaleString()}
                      </div>
                    </div>

                    {/* Diff indicator */}
                    <div className="flex items-center gap-1 text-[10px] flex-shrink-0">
                      {diff.added > 0 && (
                        <span className="text-emerald-500">+{diff.added}</span>
                      )}
                      {diff.removed > 0 && (
                        <span className="text-red-400">-{diff.removed}</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 mt-2">
                    <button
                      onClick={() => handleRestore(snap.id)}
                      className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                      title="Restore this version"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Restore
                    </button>
                    <button
                      onClick={() => setPreviewId(isPreviewing ? null : snap.id)}
                      className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-700 rounded transition-colors"
                      title="Preview"
                    >
                      {isPreviewing ? (
                        <EyeOff className="w-3 h-3" />
                      ) : (
                        <Eye className="w-3 h-3" />
                      )}
                      {isPreviewing ? 'Hide' : 'Preview'}
                    </button>
                    <button
                      onClick={() => handleStartRename(snap.id, snap.label)}
                      className="p-0.5 text-zinc-600 hover:text-zinc-300 transition-colors"
                      title="Rename"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => deleteSnapshot(snap.id)}
                      className="p-0.5 text-zinc-600 hover:text-red-400 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Preview panel */}
                  {isPreviewing && previewSnap && (
                    <div className="mt-2 p-2 bg-zinc-900 border border-zinc-800 rounded text-[10px] text-zinc-400 font-mono max-h-32 overflow-y-auto whitespace-pre-wrap">
                      {previewSnap.lyrics || '(empty)'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * ArrangementStatusBar.tsx — Visual arrangement health indicator.
 *
 * Shows a compact horizontal bar above the editor with:
 *  - Each section as a colored segment (width proportional to bar count)
 *  - Section status indicators (empty, under, good, overflow)
 *  - Total bar count and estimated duration
 *  - Clickable sections to jump to that part of the lyrics
 *
 * This is the "at a glance" view that tells you immediately
 * if your pre-chorus is bleeding into your chorus.
 */

import React from 'react';
import { useArrangementStore, selectCurrentArrangement } from '../store/arrangementStore';
import { SECTION_COLORS, SECTION_BG_COLORS, SectionType } from '../lib/arrangement';
import { AlertTriangle, Check, Minus, ArrowUp } from 'lucide-react';

interface ArrangementStatusBarProps {
  onSectionClick?: (sectionLabel: string) => void;
}

export function ArrangementStatusBar({ onSectionClick }: ArrangementStatusBarProps) {
  const arrangement = useArrangementStore(selectCurrentArrangement);
  const stats = useArrangementStore((s) => s.arrangementStats);

  if (!arrangement || !stats) return null;

  const totalBars = stats.totalBars;
  const durationMin = Math.floor(stats.estimatedDurationSec / 60);
  const durationSec = Math.round(stats.estimatedDurationSec % 60);
  const overflowCount = stats.sectionBreakdown.filter((s) => s.status === 'over').length;

  return (
    <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-950/50 space-y-2">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs">
          <span className="text-zinc-500 font-medium uppercase tracking-wider">
            Arrangement
          </span>
          <span className="text-zinc-400">
            {totalBars} bars · ~{durationMin}:{durationSec.toString().padStart(2, '0')} @ {arrangement.bpm} BPM
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {overflowCount > 0 ? (
            <span className="flex items-center gap-1 text-amber-400">
              <AlertTriangle className="w-3 h-3" />
              {overflowCount} section{overflowCount > 1 ? 's' : ''} overflow
            </span>
          ) : stats.sectionBreakdown.every((s) => s.status === 'good') ? (
            <span className="flex items-center gap-1 text-emerald-400">
              <Check className="w-3 h-3" />
              All sections fit
            </span>
          ) : null}
        </div>
      </div>

      {/* Section bar visualization */}
      <div className="flex gap-0.5 h-8 rounded-md overflow-hidden">
        {stats.sectionBreakdown.map((section) => {
          const widthPercent = (section.bars / totalBars) * 100;
          const color = SECTION_COLORS[section.type as SectionType] || '#6366f1';
          const bgColor = SECTION_BG_COLORS[section.type as SectionType] || 'rgba(99,102,241,0.08)';

          const statusIcon =
            section.status === 'over' ? (
              <AlertTriangle className="w-3 h-3 text-amber-400" />
            ) : section.status === 'empty' ? (
              <Minus className="w-3 h-3 text-zinc-500" />
            ) : section.status === 'under' ? (
              <ArrowUp className="w-3 h-3 text-blue-400 opacity-60" />
            ) : null;

          return (
            <button
              key={section.sectionId}
              onClick={() => onSectionClick?.(section.label)}
              className="relative group flex items-center justify-center transition-all hover:brightness-125 cursor-pointer"
              style={{
                width: `${widthPercent}%`,
                minWidth: '28px',
                backgroundColor: bgColor,
                borderBottom: `3px solid ${color}`,
              }}
              title={`${section.label}: ${section.actualLines}/${section.targetLines} lines (${section.bars} bars)`}
            >
              <span
                className="text-[9px] font-bold uppercase tracking-wider truncate px-1 flex items-center gap-1"
                style={{ color }}
              >
                {statusIcon}
                <span className="truncate">{section.label}</span>
              </span>

              {/* Tooltip on hover */}
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1.5 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                <div className="font-semibold" style={{ color }}>
                  {section.label}
                </div>
                <div className="text-zinc-400 mt-0.5">
                  {section.bars} bars · {section.actualLines}/{section.targetLines} lines
                </div>
                {section.status === 'over' && (
                  <div className="text-amber-400 mt-0.5">
                    ⚠ {section.overflowLines} line{section.overflowLines > 1 ? 's' : ''} overflow!
                  </div>
                )}
                {section.status === 'empty' && (
                  <div className="text-zinc-500 mt-0.5">No lyrics yet</div>
                )}
                {section.status === 'under' && (
                  <div className="text-blue-400 mt-0.5">
                    Needs {section.targetLines - section.actualLines} more line{section.targetLines - section.actualLines > 1 ? 's' : ''}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

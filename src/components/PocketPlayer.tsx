import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Play, Square, Repeat, ChevronDown, ChevronUp, Headphones } from 'lucide-react';
import {
  generateBlueprint,
  scoreProsody,
  type EntryFeel,
  type Density,
  type Direction,
  type VibeSelection,
  type ProsodyBlueprint,
} from '../lib/prosody';
import {
  createKit,
  playBlueprint,
  playLineComparison,
  stopPlayback,
  setPlayheadCallback,
  cleanup,
  type SoundKitId,
} from '../lib/pocketPlayer';
import { useArrangementStore, selectCurrentArrangement } from '../store/arrangementStore';

// ─── Constants ───────────────────────────────────────────────────────

const ENTRY_FEELS: { value: EntryFeel; label: string }[] = [
  { value: 'on-the-beat', label: 'On the beat' },
  { value: 'after-the-beat', label: 'After the beat' },
  { value: 'just-before', label: 'Just before' },
];

const DENSITIES: { value: Density; label: string }[] = [
  { value: 'sparse-dramatic', label: 'Sparse' },
  { value: 'breathing-room', label: 'Breathing room' },
  { value: 'conversational', label: 'Conversational' },
  { value: 'wordy-stacking', label: 'Wordy' },
];

const DIRECTIONS: { value: Direction; label: string }[] = [
  { value: 'rising', label: 'Rising' },
  { value: 'flat-bouncing', label: 'Flat/Bouncing' },
  { value: 'descending', label: 'Descending' },
  { value: 'dropping', label: 'Dropping' },
];

const SOUND_KIT_OPTIONS: { value: SoundKitId; label: string }[] = [
  { value: 'click', label: 'Click' },
  { value: 'woodblock', label: 'Woodblock' },
  { value: 'hihat', label: 'Hi-hat' },
  { value: 'tonal', label: 'Tonal' },
];

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// ─── Component ───────────────────────────────────────────────────────

interface PocketPlayerProps {
  currentLine?: string; // current lyric line for scoring
}

export function PocketPlayer({ currentLine }: PocketPlayerProps) {
  const arrangement = useArrangementStore(selectCurrentArrangement);
  const { vibeSelections, setVibeForSection } = useArrangementStore();

  // Vibe state
  const [entryFeel, setEntryFeel] = useState<EntryFeel>('on-the-beat');
  const [density, setDensity] = useState<Density>('conversational');
  const [direction, setDirection] = useState<Direction>('flat-bouncing');
  const [bpm, setBpm] = useState(120);
  const [rootNote, setRootNote] = useState('C');
  const [barsPerLine, setBarsPerLine] = useState(2);
  const [timeSignature] = useState(4);

  // Playback state
  const [selectedKit, setSelectedKit] = useState<SoundKitId>('click');
  const [isPlaying, setIsPlaying] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(true);
  const [playheadPos, setPlayheadPos] = useState(-1);

  // UI state
  const [expanded, setExpanded] = useState(false);
  const [blueprint, setBlueprint] = useState<ProsodyBlueprint | null>(null);

  const kitRef = useRef<ReturnType<typeof createKit> | null>(null);

  // Sync BPM from arrangement template
  useEffect(() => {
    if (arrangement?.bpm) {
      setBpm(arrangement.bpm);
    }
  }, [arrangement?.bpm]);

  // Generate blueprint when vibe changes
  useEffect(() => {
    const vibe: VibeSelection = {
      entryFeel,
      density,
      direction,
      bpm,
      barsPerLine,
      timeSignature,
    };
    const bp = generateBlueprint(vibe);
    setBlueprint(bp);
  }, [entryFeel, density, direction, bpm, barsPerLine, timeSignature]);

  // Set up playhead callback
  useEffect(() => {
    setPlayheadCallback((pos) => setPlayheadPos(pos));
    return () => {
      setPlayheadCallback(null);
      cleanup();
    };
  }, []);

  // Prosody score
  const prosodyScore = useMemo(() => {
    if (!blueprint || !currentLine?.trim()) return null;
    return scoreProsody(blueprint, currentLine);
  }, [blueprint, currentLine]);

  const scoreColor = prosodyScore
    ? prosodyScore.score >= 80 ? 'text-emerald-400'
      : prosodyScore.score >= 50 ? 'text-amber-400'
      : 'text-red-400'
    : '';

  // Playback handlers
  const handlePlay = useCallback(async () => {
    if (!blueprint) return;

    if (isPlaying) {
      stopPlayback();
      setIsPlaying(false);
      return;
    }

    // Create/recreate kit
    if (kitRef.current) kitRef.current.dispose();
    kitRef.current = createKit(selectedKit, rootNote);

    setIsPlaying(true);
    await playBlueprint(blueprint, bpm, kitRef.current, loopEnabled);

    if (!loopEnabled) {
      // Will auto-stop; set a timeout to update state
      const totalSubdivs = blueprint.pattern.length > 0
        ? Math.max(...blueprint.pattern.map(h => h.position)) + 1
        : 32;
      const durationMs = (totalSubdivs * (60000 / bpm / 4)) + 200;
      setTimeout(() => setIsPlaying(false), durationMs);
    }
  }, [blueprint, bpm, selectedKit, rootNote, loopEnabled, isPlaying]);

  const handleStop = useCallback(() => {
    stopPlayback();
    setIsPlaying(false);
  }, []);

  const handleCompare = useCallback(async () => {
    if (!blueprint || !currentLine?.trim()) return;
    if (kitRef.current) kitRef.current.dispose();
    kitRef.current = createKit(selectedKit, rootNote);
    setIsPlaying(true);
    await playLineComparison(blueprint, currentLine, bpm, kitRef.current);
    const totalSubdivs = blueprint.pattern.length > 0
      ? Math.max(...blueprint.pattern.map(h => h.position)) + 1
      : 32;
    const durationMs = (totalSubdivs * (60000 / bpm / 4)) + 200;
    setTimeout(() => setIsPlaying(false), durationMs);
  }, [blueprint, currentLine, bpm, selectedKit, rootNote]);

  // Pill button helper
  const Pill = ({ active, label, onClick, ...rest }: { active: boolean; label: string; onClick: () => void; [key: string]: any }) => (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-[11px] rounded-full font-medium transition-colors whitespace-nowrap ${
        active
          ? 'bg-indigo-500 text-white'
          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300'
      }`}
    >
      {label}
    </button>
  );

  // ─── Collapsed view ────────────────────────────────────────────────
  if (!expanded) {
    return (
      <div className="px-4 py-1.5 border-b border-zinc-800 bg-zinc-950/50 flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors font-medium"
        >
          <ChevronDown className="w-3 h-3" />
          Pocket
        </button>

        {/* Compact vibe pills */}
        <div className="flex items-center gap-1">
          {ENTRY_FEELS.map(e => (
            <Pill key={e.value} active={entryFeel === e.value} label={e.label} onClick={() => setEntryFeel(e.value)} />
          ))}
        </div>
        <div className="w-px h-4 bg-zinc-700" />
        <div className="flex items-center gap-1">
          {DENSITIES.map(d => (
            <Pill key={d.value} active={density === d.value} label={d.label} onClick={() => setDensity(d.value)} />
          ))}
        </div>

        {/* Play/Stop */}
        <div className="ml-auto flex items-center gap-1.5">
          {prosodyScore && (
            <span className={`text-[11px] font-mono font-bold ${scoreColor}`}>
              {prosodyScore.score}
            </span>
          )}
          <button
            onClick={isPlaying ? handleStop : handlePlay}
            className={`p-1.5 rounded-md transition-colors ${
              isPlaying
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                : 'bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30'
            }`}
          >
            {isPlaying ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    );
  }

  // ─── Expanded view ─────────────────────────────────────────────────
  return (
    <div className="border-b border-zinc-800 bg-zinc-950/50">
      {/* Header */}
      <div className="px-4 py-1.5 flex items-center justify-between">
        <button
          onClick={() => setExpanded(false)}
          className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors font-medium"
        >
          <ChevronUp className="w-3 h-3" />
          Pocket Rhythm Player
        </button>
        <div className="flex items-center gap-2">
          {prosodyScore && (
            <span className={`text-[11px] font-mono font-bold ${scoreColor}`}>
              Score: {prosodyScore.score}
            </span>
          )}
        </div>
      </div>

      <div className="px-4 pb-3 space-y-2.5">
        {/* Vibe Selectors */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider w-14 flex-shrink-0">Entry</span>
            <div className="flex items-center gap-1">
              {ENTRY_FEELS.map(e => (
                <Pill key={e.value} active={entryFeel === e.value} label={e.label} onClick={() => setEntryFeel(e.value)} />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider w-14 flex-shrink-0">Density</span>
            <div className="flex items-center gap-1">
              {DENSITIES.map(d => (
                <Pill key={d.value} active={density === d.value} label={d.label} onClick={() => setDensity(d.value)} />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider w-14 flex-shrink-0">Shape</span>
            <div className="flex items-center gap-1">
              {DIRECTIONS.map(d => (
                <Pill key={d.value} active={direction === d.value} label={d.label} onClick={() => setDirection(d.value)} />
              ))}
            </div>
          </div>
        </div>

        {/* Controls Row */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* BPM */}
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider">BPM</label>
            <input
              type="number"
              value={bpm}
              onChange={(e) => setBpm(Math.max(40, Math.min(300, Number(e.target.value) || 120)))}
              className="w-14 bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Bars per line */}
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Bars</label>
            <select
              value={barsPerLine}
              onChange={(e) => setBarsPerLine(Number(e.target.value))}
              className="bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500"
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={4}>4</option>
            </select>
          </div>

          {/* Root Note (only for tonal kit) */}
          {selectedKit === 'tonal' && (
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Key</label>
              <select
                value={rootNote}
                onChange={(e) => setRootNote(e.target.value)}
                className="bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500"
              >
                {NOTES.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          )}

          {/* Sound Kit Selector */}
          <div className="flex items-center gap-1">
            {SOUND_KIT_OPTIONS.map(k => (
              <Pill
                key={k.value}
                active={selectedKit === k.value}
                label={k.label}
                onClick={() => setSelectedKit(k.value)}
              />
            ))}
          </div>

          {/* Playback Controls */}
          <div className="ml-auto flex items-center gap-1.5">
            {/* Loop toggle */}
            <button
              onClick={() => setLoopEnabled(!loopEnabled)}
              className={`p-1.5 rounded-md transition-colors ${
                loopEnabled
                  ? 'bg-indigo-500/20 text-indigo-400'
                  : 'bg-zinc-800 text-zinc-500 hover:text-zinc-400'
              }`}
              title={loopEnabled ? 'Loop on' : 'Loop off'}
            >
              <Repeat className="w-3.5 h-3.5" />
            </button>

            {/* Compare button */}
            {currentLine?.trim() && (
              <button
                onClick={handleCompare}
                className="p-1.5 rounded-md bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300 transition-colors"
                title="Compare your line vs blueprint"
              >
                <Headphones className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Play/Stop */}
            <button
              onClick={isPlaying ? handleStop : handlePlay}
              className={`p-1.5 rounded-md transition-colors ${
                isPlaying
                  ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                  : 'bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30'
              }`}
            >
              {isPlaying ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Visual Pattern */}
        {blueprint && (
          <div className="space-y-1.5">
            <div className="font-mono text-sm leading-relaxed tracking-wider overflow-x-auto whitespace-nowrap py-1">
              {blueprint.pattern.length > 0 && (() => {
                const totalSubdivs = Math.max(...blueprint.pattern.map(h => h.position)) + 1;
                const hitMap = new Map(blueprint.pattern.map(h => [h.position, h.type]));
                const subdivPerBar = timeSignature * 4;

                const elements: React.JSX.Element[] = [];
                for (let i = 0; i < totalSubdivs; i++) {
                  if (i > 0 && i % subdivPerBar === 0) {
                    elements.push(
                      <span key={`bar-${i}`} className="text-zinc-600 mx-0.5">|</span>
                    );
                  }
                  const type = hitMap.get(i);
                  const isAtPlayhead = playheadPos === i && isPlaying;
                  if (type === 'S') {
                    elements.push(
                      <span
                        key={i}
                        className={`inline-block w-4 text-center ${
                          isAtPlayhead ? 'text-white scale-125' : 'text-indigo-400'
                        } transition-transform font-bold text-base`}
                      >
                        {'\u25cf'}
                      </span>
                    );
                  } else if (type === 'w') {
                    elements.push(
                      <span
                        key={i}
                        className={`inline-block w-4 text-center ${
                          isAtPlayhead ? 'text-zinc-200 scale-110' : 'text-zinc-500'
                        } transition-transform text-sm`}
                      >
                        {'\u25cb'}
                      </span>
                    );
                  } else {
                    elements.push(
                      <span
                        key={i}
                        className={`inline-block w-4 text-center ${
                          isAtPlayhead ? 'text-zinc-400' : 'text-zinc-700'
                        }`}
                      >
                        {'\u2014'}
                      </span>
                    );
                  }
                }
                return elements;
              })()}
            </div>

            {/* Nonsense syllables */}
            <div className="font-mono text-[11px] text-zinc-400 tracking-wide">
              {blueprint.nonsenseSyllables}
            </div>

            {/* Score details */}
            {prosodyScore && prosodyScore.mismatches.length > 0 && (
              <div className="text-[10px] text-zinc-500">
                {prosodyScore.mismatches.slice(0, 5).map((m, i) => (
                  <span key={i} className="mr-2">
                    <span className="text-amber-400">{m.word}</span>
                    <span className="text-zinc-600"> ({m.expected}{'\u2192'}{m.actual})</span>
                  </span>
                ))}
                {prosodyScore.mismatches.length > 5 && (
                  <span className="text-zinc-600">+{prosodyScore.mismatches.length - 5} more</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

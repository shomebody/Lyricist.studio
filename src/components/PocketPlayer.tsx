import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Square, Repeat, Music, ChevronDown } from 'lucide-react';
import {
  generateBlueprint,
  type EntryFeel,
  type Density,
  type Direction,
  type VibeSelection,
  type ProsodyBlueprint,
} from '../lib/prosody';
import {
  createKit,
  stopPlayback,
  cleanup,
  playSyllableWalk,
  type SoundKitId,
  type SyllableHighlight,
} from '../lib/pocketPlayer';
import { useArrangementStore, selectCurrentArrangement } from '../store/arrangementStore';

// ─── Constants ───────────────────────────────────────────────────────

const ENTRY_FEELS: { value: EntryFeel; label: string }[] = [
  { value: 'on-the-beat', label: 'On beat' },
  { value: 'after-the-beat', label: 'After' },
  { value: 'just-before', label: 'Before' },
];

const DENSITIES: { value: Density; label: string }[] = [
  { value: 'sparse-dramatic', label: 'Sparse' },
  { value: 'breathing-room', label: 'Breathing' },
  { value: 'conversational', label: 'Convo' },
  { value: 'wordy-stacking', label: 'Wordy' },
];

const DIRECTIONS: { value: Direction; label: string }[] = [
  { value: 'rising', label: 'Rise' },
  { value: 'flat-bouncing', label: 'Flat' },
  { value: 'descending', label: 'Descend' },
  { value: 'dropping', label: 'Drop' },
];

const KIT_OPTIONS: { value: SoundKitId; label: string }[] = [
  { value: 'click', label: 'Clk' },
  { value: 'woodblock', label: 'Wdb' },
  { value: 'hihat', label: 'HH' },
  { value: 'tonal', label: 'Ton' },
];

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// ─── Types ───────────────────────────────────────────────────────────

interface PocketPlayerFloatingProps {
  prosodyScore: number | null;
  onPlay: (kit: ReturnType<typeof createKit>, bpm: number, loop: boolean) => void;
  onStop: () => void;
  isPlaying: boolean;
  blueprint: ProsodyBlueprint | null;
  onBlueprintChange: (bp: ProsodyBlueprint) => void;
  onVibeChange: (vibe: Partial<VibeSelection>) => void;
  currentSectionId?: string;
}

export function PocketPlayerFloating({
  prosodyScore,
  onPlay,
  onStop,
  isPlaying,
  blueprint,
  onBlueprintChange,
  onVibeChange,
  currentSectionId,
}: PocketPlayerFloatingProps) {
  const arrangement = useArrangementStore(selectCurrentArrangement);
  const { vibeSelections, setVibeForSection } = useArrangementStore();

  // Resolve vibe for current section
  const sectionVibe = currentSectionId ? vibeSelections[currentSectionId] : undefined;

  const [entryFeel, setEntryFeel] = useState<EntryFeel>(
    (sectionVibe?.entryFeel as EntryFeel) || 'on-the-beat'
  );
  const [density, setDensity] = useState<Density>(
    (sectionVibe?.density as Density) || 'conversational'
  );
  const [direction, setDirection] = useState<Direction>(
    (sectionVibe?.direction as Direction) || 'flat-bouncing'
  );
  const [bpm, setBpm] = useState(arrangement?.bpm || 120);
  const [rootNote, setRootNote] = useState('C');
  const [selectedKit, setSelectedKit] = useState<SoundKitId>('click');
  const [loopEnabled, setLoopEnabled] = useState(true);
  const [showVibes, setShowVibes] = useState(false);
  const [hovered, setHovered] = useState(false);

  const kitRef = useRef<ReturnType<typeof createKit> | null>(null);

  // Sync BPM from arrangement
  useEffect(() => {
    if (arrangement?.bpm) setBpm(arrangement.bpm);
  }, [arrangement?.bpm]);

  // Sync vibe from section
  useEffect(() => {
    if (sectionVibe) {
      if (sectionVibe.entryFeel) setEntryFeel(sectionVibe.entryFeel);
      if (sectionVibe.density) setDensity(sectionVibe.density);
      if (sectionVibe.direction) setDirection(sectionVibe.direction);
    }
  }, [currentSectionId, sectionVibe]);

  // Regenerate blueprint when vibe changes
  useEffect(() => {
    const vibe: VibeSelection = {
      entryFeel, density, direction, bpm,
      barsPerLine: 2, timeSignature: 4,
    };
    const bp = generateBlueprint(vibe);
    onBlueprintChange(bp);
    onVibeChange(vibe);

    // Persist vibe to section
    if (currentSectionId) {
      setVibeForSection(currentSectionId, { entryFeel, density, direction });
    }
  }, [entryFeel, density, direction, bpm]);

  useEffect(() => {
    return () => cleanup();
  }, []);

  const handlePlay = useCallback(() => {
    if (isPlaying) {
      onStop();
      return;
    }
    if (kitRef.current) kitRef.current.dispose();
    kitRef.current = createKit(selectedKit, rootNote);
    onPlay(kitRef.current, bpm, loopEnabled);
  }, [isPlaying, selectedKit, rootNote, bpm, loopEnabled, onPlay, onStop]);

  const scoreColor = prosodyScore !== null
    ? prosodyScore >= 80 ? 'text-emerald-400'
      : prosodyScore >= 50 ? 'text-amber-400'
      : 'text-red-400'
    : '';

  // Tiny pill helper
  const Pill = ({ active, label, onClick, ...rest }: { active: boolean; label: string; onClick: () => void; [k: string]: any }) => (
    <button
      onClick={onClick}
      className={`px-1.5 py-0.5 text-[10px] rounded font-medium transition-colors ${
        active
          ? 'bg-indigo-500/80 text-white'
          : 'bg-zinc-800/80 text-zinc-500 hover:text-zinc-300'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div
      className="absolute bottom-3 right-3 z-50 transition-opacity duration-200"
      style={{ opacity: hovered ? 1 : 0.5 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Vibe popover */}
      {showVibes && (
        <div className="mb-1.5 bg-zinc-900/95 backdrop-blur-sm border border-zinc-700/50 rounded-lg p-2 space-y-1.5 shadow-xl">
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-zinc-500 uppercase w-10 flex-shrink-0">Entry</span>
            {ENTRY_FEELS.map(e => (
              <Pill key={e.value} active={entryFeel === e.value} label={e.label} onClick={() => setEntryFeel(e.value)} />
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-zinc-500 uppercase w-10 flex-shrink-0">Hits</span>
            {DENSITIES.map(d => (
              <Pill key={d.value} active={density === d.value} label={d.label} onClick={() => setDensity(d.value)} />
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-zinc-500 uppercase w-10 flex-shrink-0">Shape</span>
            {DIRECTIONS.map(d => (
              <Pill key={d.value} active={direction === d.value} label={d.label} onClick={() => setDirection(d.value)} />
            ))}
          </div>
        </div>
      )}

      {/* Main floating bar */}
      <div className="flex items-center gap-1.5 bg-zinc-900/95 backdrop-blur-sm border border-zinc-700/50 rounded-lg px-2 py-1.5 shadow-xl">
        {/* Vibe toggle */}
        <button
          onClick={() => setShowVibes(!showVibes)}
          className={`p-1 rounded transition-colors ${
            showVibes ? 'bg-indigo-500/20 text-indigo-400' : 'text-zinc-500 hover:text-zinc-300'
          }`}
          title="Vibe settings"
        >
          <Music className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-4 bg-zinc-700/50" />

        {/* Play/Stop */}
        <button
          onClick={handlePlay}
          className={`p-1 rounded transition-colors ${
            isPlaying
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              : 'bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30'
          }`}
        >
          {isPlaying ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>

        {/* Loop */}
        <button
          onClick={() => setLoopEnabled(!loopEnabled)}
          className={`p-1 rounded transition-colors ${
            loopEnabled ? 'text-indigo-400' : 'text-zinc-600 hover:text-zinc-400'
          }`}
          title={loopEnabled ? 'Loop on' : 'Loop off'}
        >
          <Repeat className="w-3 h-3" />
        </button>

        <div className="w-px h-4 bg-zinc-700/50" />

        {/* BPM */}
        <input
          type="number"
          value={bpm}
          onChange={(e) => setBpm(Math.max(40, Math.min(300, Number(e.target.value) || 120)))}
          className="w-10 bg-transparent text-[11px] text-zinc-300 text-center focus:outline-none font-mono"
          title="BPM"
        />

        <div className="w-px h-4 bg-zinc-700/50" />

        {/* Kit selector */}
        <div className="flex items-center gap-0.5">
          {KIT_OPTIONS.map(k => (
            <Pill key={k.value} active={selectedKit === k.value} label={k.label} onClick={() => setSelectedKit(k.value)} />
          ))}
        </div>

        {/* Root note (tonal only) */}
        {selectedKit === 'tonal' && (
          <>
            <div className="w-px h-4 bg-zinc-700/50" />
            <select
              value={rootNote}
              onChange={(e) => setRootNote(e.target.value)}
              className="bg-transparent text-[10px] text-zinc-400 focus:outline-none"
            >
              {NOTES.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </>
        )}

        {/* Prosody score */}
        {prosodyScore !== null && (
          <>
            <div className="w-px h-4 bg-zinc-700/50" />
            <span className={`text-[11px] font-mono font-bold ${scoreColor} min-w-[20px] text-center`}>
              {prosodyScore}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

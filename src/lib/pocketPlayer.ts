/**
 * pocketPlayer.ts — Tone.js playback engine for prosody blueprints.
 *
 * Plays rhythmic stress patterns as audible sound using Web Audio via Tone.js.
 */

import * as Tone from 'tone';
import type { ProsodyBlueprint, StressType } from './prosody';
import { extractLineStressPublic } from './prosody';

// ─── Types ───────────────────────────────────────────────────────────

export interface SoundKit {
  id: string;
  name: string;
  stressedSound: () => void;
  unstressedSound: () => void;
  dispose: () => void;
}

// ─── Sound Kit Factories ─────────────────────────────────────────────

let activeKits: SoundKit[] = [];

function disposeAllKits() {
  for (const kit of activeKits) {
    kit.dispose();
  }
  activeKits = [];
}

export function createClickKit(): SoundKit {
  const stressedSynth = new Tone.MembraneSynth({
    pitchDecay: 0.008,
    octaves: 2,
    envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.05 },
    volume: -6,
  }).toDestination();

  const unstressedSynth = new Tone.MembraneSynth({
    pitchDecay: 0.005,
    octaves: 1.5,
    envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.03 },
    volume: -18,
  }).toDestination();

  const kit: SoundKit = {
    id: 'click',
    name: 'Click',
    stressedSound: () => stressedSynth.triggerAttackRelease('C4', '32n'),
    unstressedSound: () => unstressedSynth.triggerAttackRelease('C3', '32n'),
    dispose: () => { stressedSynth.dispose(); unstressedSynth.dispose(); },
  };
  activeKits.push(kit);
  return kit;
}

export function createWoodblockKit(): SoundKit {
  const stressedSynth = new Tone.MembraneSynth({
    pitchDecay: 0.01,
    octaves: 3,
    envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.08 },
    volume: -8,
  }).toDestination();

  const unstressedSynth = new Tone.MembraneSynth({
    pitchDecay: 0.005,
    octaves: 2,
    envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.04 },
    volume: -20,
  }).toDestination();

  const kit: SoundKit = {
    id: 'woodblock',
    name: 'Woodblock',
    stressedSound: () => stressedSynth.triggerAttackRelease('G3', '32n'),
    unstressedSound: () => unstressedSynth.triggerAttackRelease('G4', '64n'),
    dispose: () => { stressedSynth.dispose(); unstressedSynth.dispose(); },
  };
  activeKits.push(kit);
  return kit;
}

export function createHihatKit(): SoundKit {
  const stressedNoise = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.02 },
    volume: -10,
  }).toDestination();

  const unstressedNoise = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 },
    volume: -26,
  }).toDestination();

  const kit: SoundKit = {
    id: 'hihat',
    name: 'Hi-hat',
    stressedSound: () => stressedNoise.triggerAttackRelease('32n'),
    unstressedSound: () => unstressedNoise.triggerAttackRelease('64n'),
    dispose: () => { stressedNoise.dispose(); unstressedNoise.dispose(); },
  };
  activeKits.push(kit);
  return kit;
}

export function createTonalKit(rootNote: string = 'C'): SoundKit {
  const stressedSynth = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.005, decay: 0.15, sustain: 0, release: 0.1 },
    volume: -8,
  }).toDestination();

  const unstressedSynth = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.005, decay: 0.1, sustain: 0, release: 0.05 },
    volume: -22,
  }).toDestination();

  const note3 = `${rootNote}3`;
  const note4 = `${rootNote}4`;

  const kit: SoundKit = {
    id: 'tonal',
    name: 'Tonal',
    stressedSound: () => stressedSynth.triggerAttackRelease(note3, '16n'),
    unstressedSound: () => unstressedSynth.triggerAttackRelease(note4, '32n'),
    dispose: () => { stressedSynth.dispose(); unstressedSynth.dispose(); },
  };
  activeKits.push(kit);
  return kit;
}

export const SOUND_KITS = ['click', 'woodblock', 'hihat', 'tonal'] as const;
export type SoundKitId = typeof SOUND_KITS[number];

export function createKit(id: SoundKitId, rootNote?: string): SoundKit {
  switch (id) {
    case 'click': return createClickKit();
    case 'woodblock': return createWoodblockKit();
    case 'hihat': return createHihatKit();
    case 'tonal': return createTonalKit(rootNote || 'C');
  }
}

// ─── Playback Engine ─────────────────────────────────────────────────

let scheduledEvents: number[] = [];
let isPlaying = false;
let playheadCallback: ((position: number) => void) | null = null;

export function setPlayheadCallback(cb: ((position: number) => void) | null) {
  playheadCallback = cb;
}

export function getIsPlaying(): boolean {
  return isPlaying;
}

export async function playBlueprint(
  blueprint: ProsodyBlueprint,
  bpm: number,
  kit: SoundKit,
  loop: boolean = false,
): Promise<void> {
  await Tone.start();
  stopPlayback();

  Tone.getTransport().bpm.value = bpm;
  isPlaying = true;

  const subdivisionTime = Tone.Time('16n').toSeconds();
  const totalSubdivisions = blueprint.pattern.length > 0
    ? Math.max(...blueprint.pattern.map(h => h.position)) + 1
    : 32;

  // Calculate total duration for looping
  const patternDuration = totalSubdivisions * subdivisionTime;

  // Schedule each hit
  for (const hit of blueprint.pattern) {
    if (hit.type === 'rest') continue;

    const time = hit.position * subdivisionTime;
    const eventId = Tone.getTransport().scheduleRepeat(
      (t) => {
        if (hit.type === 'S') kit.stressedSound();
        else kit.unstressedSound();
        if (playheadCallback) playheadCallback(hit.position);
      },
      loop ? patternDuration : Infinity,
      time,
    );
    scheduledEvents.push(eventId);
  }

  // Schedule playhead updates for visual tracking
  const playheadId = Tone.getTransport().scheduleRepeat(
    () => {
      const pos = Tone.getTransport().seconds;
      const currentSubdiv = Math.floor(pos / subdivisionTime) % totalSubdivisions;
      if (playheadCallback) playheadCallback(currentSubdiv);
    },
    '16n',
    0,
  );
  scheduledEvents.push(playheadId);

  if (!loop) {
    // Stop after one pass
    const stopId = Tone.getTransport().schedule(() => {
      stopPlayback();
    }, patternDuration + 0.1);
    scheduledEvents.push(stopId);
  }

  Tone.getTransport().start();
}

export function stopPlayback(): void {
  Tone.getTransport().stop();
  Tone.getTransport().cancel();
  scheduledEvents = [];
  isPlaying = false;
  if (playheadCallback) playheadCallback(-1);
}

export async function playLineComparison(
  blueprint: ProsodyBlueprint,
  line: string,
  bpm: number,
  kit: SoundKit,
): Promise<void> {
  await Tone.start();
  stopPlayback();

  Tone.getTransport().bpm.value = bpm;
  isPlaying = true;

  const subdivisionTime = Tone.Time('16n').toSeconds();
  const blueprintHits = blueprint.pattern.filter(h => h.type !== 'rest');

  // Create a second kit for the actual line (panned right)
  const comparisonSynth = new Tone.Synth({
    oscillator: { type: 'square' },
    envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.05 },
    volume: -12,
  }).toDestination();

  const comparisonSoftSynth = new Tone.Synth({
    oscillator: { type: 'square' },
    envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.03 },
    volume: -24,
  }).toDestination();

  // Pan: blueprint left, actual right
  const panner1 = new Tone.Panner(-0.7).toDestination();
  const panner2 = new Tone.Panner(0.7).toDestination();
  comparisonSynth.connect(panner2);
  comparisonSoftSynth.connect(panner2);

  // Get actual line stress
  const lineStresses = extractLineStressPublic(line);

  // Schedule blueprint hits (left channel — use kit)
  for (const hit of blueprint.pattern) {
    if (hit.type === 'rest') continue;
    const time = hit.position * subdivisionTime;
    const eventId = Tone.getTransport().schedule((t) => {
      if (hit.type === 'S') kit.stressedSound();
      else kit.unstressedSound();
    }, time);
    scheduledEvents.push(eventId);
  }

  // Schedule actual line hits (right channel)
  for (let i = 0; i < lineStresses.length && i < blueprintHits.length; i++) {
    const pos = blueprintHits[i].position;
    const time = pos * subdivisionTime;
    const stress = lineStresses[i];
    const eventId = Tone.getTransport().schedule((t) => {
      if (stress === 'S') comparisonSynth.triggerAttackRelease('E4', '32n', t);
      else comparisonSoftSynth.triggerAttackRelease('E5', '64n', t);
    }, time);
    scheduledEvents.push(eventId);
  }

  // Stop after one pass
  const totalSubdivisions = blueprint.pattern.length > 0
    ? Math.max(...blueprint.pattern.map(h => h.position)) + 1
    : 32;
  const patternDuration = totalSubdivisions * subdivisionTime;

  const stopId = Tone.getTransport().schedule(() => {
    stopPlayback();
    comparisonSynth.dispose();
    comparisonSoftSynth.dispose();
    panner1.dispose();
    panner2.dispose();
  }, patternDuration + 0.1);
  scheduledEvents.push(stopId);

  Tone.getTransport().start();
}

// ─── Syllable Walk Playback ──────────────────────────────────────────

export interface SyllableHighlight {
  lineNumber: number;
  charStart: number;
  charEnd: number;
  stressType: StressType;
}

export type HighlightCallback = (highlight: SyllableHighlight | null) => void;

/**
 * Play through a section's syllables, firing a callback for each one
 * to drive Monaco decoration highlighting.
 */
export async function playSyllableWalk(
  syllables: { lineNumber: number; charStart: number; charEnd: number; stressType: StressType; timeOffset: number }[],
  bpm: number,
  kit: SoundKit,
  loop: boolean,
  onHighlight: HighlightCallback,
  onStop?: () => void,
): Promise<void> {
  if (syllables.length === 0) return;

  await Tone.start();
  stopPlayback();

  Tone.getTransport().bpm.value = bpm;
  isPlaying = true;

  const lastTime = syllables[syllables.length - 1].timeOffset;
  const subdivisionTime = 60 / bpm / 4;
  const totalDuration = lastTime + subdivisionTime * 4; // add a little buffer

  for (const syl of syllables) {
    const eventId = Tone.getTransport().schedule((t) => {
      if (syl.stressType === 'S') kit.stressedSound();
      else kit.unstressedSound();
      // Use Tone.Draw for UI updates synced to audio
      Tone.getDraw().schedule(() => {
        onHighlight({
          lineNumber: syl.lineNumber,
          charStart: syl.charStart,
          charEnd: syl.charEnd,
          stressType: syl.stressType,
        });
      }, t);
    }, syl.timeOffset);
    scheduledEvents.push(eventId);
  }

  if (loop) {
    const loopId = Tone.getTransport().schedule(() => {
      Tone.getTransport().seconds = 0;
    }, totalDuration);
    scheduledEvents.push(loopId);
  } else {
    const stopId = Tone.getTransport().schedule(() => {
      onHighlight(null);
      stopPlayback();
      if (onStop) onStop();
    }, totalDuration);
    scheduledEvents.push(stopId);
  }

  Tone.getTransport().start();
}

/**
 * Dispose all active sound kits and stop playback.
 */
export function cleanup(): void {
  stopPlayback();
  disposeAllKits();
}

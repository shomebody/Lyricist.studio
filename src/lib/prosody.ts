/**
 * prosody.ts — Prosody blueprint generator for Pocket Rhythm Player.
 *
 * Generates rhythmic stress patterns from vibe selections and provides
 * scoring against actual lyric lines.
 */

// ─── Types ───────────────────────────────────────────────────────────

export type EntryFeel = 'after-the-beat' | 'on-the-beat' | 'just-before';
export type Density = 'breathing-room' | 'conversational' | 'wordy-stacking' | 'sparse-dramatic';
export type Direction = 'descending' | 'flat-bouncing' | 'rising' | 'dropping';

export interface VibeSelection {
  entryFeel: EntryFeel;
  density: Density;
  direction: Direction;
  bpm: number;
  barsPerLine: number;
  timeSignature: number;
}

export type StressType = 'S' | 'w' | 'rest';

export interface ProsodyBlueprint {
  pattern: { position: number; type: StressType }[];
  totalHits: number;
  entryBeat: number;
  nonsenseSyllables: string;
  visualPattern: string;
}

export interface ProsodyMismatch {
  position: number;
  expected: StressType;
  actual: StressType;
  word: string;
}

export interface ProsodyScore {
  score: number;
  mismatches: ProsodyMismatch[];
}

// ─── Constants ───────────────────────────────────────────────────────

const STRESSED_SYLLABLES = ['BAH', 'TAH', 'DAH', 'GAH', 'PAH', 'KAH'];
const UNSTRESSED_SYLLABLES = ['da', 'di', 'ti', 'ka', 'du', 'ki', 'ta', 'gi'];

// Strong beat positions in a bar of 16th notes (beats 1-4 and strong offbeats)
const STRONG_POSITIONS = new Set([0, 4, 8, 12]); // beats 1, 2, 3, 4
const OFFBEAT_POSITIONS = new Set([2, 6, 10, 14]); // "and" of each beat

// Function words that are typically unstressed
const FUNCTION_WORDS = new Set([
  'a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'yet', 'so',
  'in', 'on', 'at', 'to', 'by', 'of', 'up', 'as', 'if', 'it',
  'is', 'am', 'are', 'was', 'were', 'be', 'been', 'do', 'did',
  'has', 'had', 'have', 'may', 'can', 'will', 'shall',
  'i', 'me', 'my', 'he', 'him', 'his', 'she', 'her', 'we', 'us',
  'our', 'they', 'them', 'their', 'you', 'your', 'its',
  'not', 'no', 'than', 'that', 'this', 'with', 'from',
]);

// ─── Blueprint Generation ────────────────────────────────────────────

function getEntryPosition(entryFeel: EntryFeel): number {
  switch (entryFeel) {
    case 'on-the-beat': return 0;
    case 'after-the-beat': return 4; // beat 2
    case 'just-before': return -1; // last subdivision of previous bar (handled as pickup)
  }
}

function getHitRange(density: Density): [number, number] {
  switch (density) {
    case 'sparse-dramatic': return [3, 6];
    case 'breathing-room': return [8, 10];
    case 'conversational': return [12, 16];
    case 'wordy-stacking': return [18, 22];
  }
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateBlueprint(vibe: VibeSelection): ProsodyBlueprint {
  const totalSubdivisions = vibe.barsPerLine * vibe.timeSignature * 4; // 16th notes
  const [minHits, maxHits] = getHitRange(vibe.density);
  const targetHits = randInt(minHits, maxHits);
  const entryPos = getEntryPosition(vibe.entryFeel);

  // Build hit positions
  const hits: { position: number; type: StressType }[] = [];
  const usedPositions = new Set<number>();

  // Determine actual entry position
  const actualEntry = entryPos < 0 ? totalSubdivisions - 1 : entryPos;

  // Place initial stressed hit at entry point
  hits.push({ position: actualEntry, type: 'S' });
  usedPositions.add(actualEntry);

  // Determine stressed vs unstressed distribution
  // Stressed hits land on strong positions, unstressed fill gaps
  const stressedCount = Math.max(2, Math.floor(targetHits * 0.35));

  // Place stressed hits on strong beats
  const availableStrong: number[] = [];
  for (let i = 0; i < totalSubdivisions; i++) {
    const barPos = i % (vibe.timeSignature * 4);
    if (STRONG_POSITIONS.has(barPos) && !usedPositions.has(i)) {
      availableStrong.push(i);
    }
  }

  // Apply direction to stressed hit selection
  if (vibe.direction === 'rising') {
    availableStrong.sort((a, b) => a - b);
  } else if (vibe.direction === 'descending' || vibe.direction === 'dropping') {
    availableStrong.sort((a, b) => b - a);
  } else {
    // flat-bouncing: alternate from edges
    availableStrong.sort((a, b) => a - b);
  }

  // Add stressed hits
  for (let i = 0; i < Math.min(stressedCount - 1, availableStrong.length); i++) {
    const pos = availableStrong[i];
    hits.push({ position: pos, type: 'S' });
    usedPositions.add(pos);
  }

  // Fill unstressed hits based on density
  const remainingHits = targetHits - hits.length;
  if (remainingHits > 0) {
    const availableWeak: number[] = [];
    for (let i = 0; i < totalSubdivisions; i++) {
      if (!usedPositions.has(i)) {
        availableWeak.push(i);
      }
    }

    // For sparse, space them out; for wordy, cluster them
    if (vibe.density === 'sparse-dramatic') {
      // Evenly space unstressed hits
      const step = Math.max(1, Math.floor(availableWeak.length / (remainingHits + 1)));
      for (let i = 0; i < remainingHits && i * step < availableWeak.length; i++) {
        const pos = availableWeak[i * step];
        hits.push({ position: pos, type: 'w' });
        usedPositions.add(pos);
      }
    } else if (vibe.density === 'wordy-stacking') {
      // Cluster around stressed positions
      const stressedPositions = hits.map(h => h.position).sort((a, b) => a - b);
      let added = 0;
      for (const sp of stressedPositions) {
        for (let offset = 1; offset <= 3 && added < remainingHits; offset++) {
          const pos = sp + offset;
          if (pos < totalSubdivisions && !usedPositions.has(pos)) {
            hits.push({ position: pos, type: 'w' });
            usedPositions.add(pos);
            added++;
          }
        }
      }
      // Fill remaining if needed
      for (const pos of availableWeak) {
        if (added >= remainingHits) break;
        if (!usedPositions.has(pos)) {
          hits.push({ position: pos, type: 'w' });
          usedPositions.add(pos);
          added++;
        }
      }
    } else {
      // breathing-room / conversational: fairly even spacing
      const step = Math.max(1, Math.floor(availableWeak.length / remainingHits));
      for (let i = 0, added = 0; added < remainingHits && i < availableWeak.length; i += step, added++) {
        const pos = availableWeak[i];
        hits.push({ position: pos, type: 'w' });
        usedPositions.add(pos);
      }
    }
  }

  // Sort by position
  hits.sort((a, b) => a.position - b.position);

  const nonsenseSyllables = generateNonsense(hits);
  const visualPattern = buildVisualPattern(hits, totalSubdivisions, vibe.timeSignature);

  return {
    pattern: hits,
    totalHits: hits.length,
    entryBeat: actualEntry,
    nonsenseSyllables,
    visualPattern,
  };
}

// ─── Nonsense Syllable Generator ─────────────────────────────────────

export function generateNonsense(pattern: { position: number; type: StressType }[]): string {
  let lastStressed = -1;
  let lastUnstressed = -1;

  return pattern
    .filter(h => h.type !== 'rest')
    .map(hit => {
      if (hit.type === 'S') {
        let idx: number;
        do { idx = randInt(0, STRESSED_SYLLABLES.length - 1); } while (idx === lastStressed && STRESSED_SYLLABLES.length > 1);
        lastStressed = idx;
        return STRESSED_SYLLABLES[idx];
      } else {
        let idx: number;
        do { idx = randInt(0, UNSTRESSED_SYLLABLES.length - 1); } while (idx === lastUnstressed && UNSTRESSED_SYLLABLES.length > 1);
        lastUnstressed = idx;
        return UNSTRESSED_SYLLABLES[idx];
      }
    })
    .join(' ');
}

// ─── Visual Pattern Builder ──────────────────────────────────────────

function buildVisualPattern(
  hits: { position: number; type: StressType }[],
  totalSubdivisions: number,
  timeSignature: number,
): string {
  const hitMap = new Map(hits.map(h => [h.position, h.type]));
  const subdivPerBar = timeSignature * 4;
  const parts: string[] = [];

  for (let i = 0; i < totalSubdivisions; i++) {
    if (i > 0 && i % subdivPerBar === 0) {
      parts.push('|');
    }
    const type = hitMap.get(i);
    if (type === 'S') parts.push('\u25cf'); // ●
    else if (type === 'w') parts.push('\u25cb'); // ○
    else parts.push('\u2014'); // —
  }

  return parts.join(' ');
}

// ─── Prosody Scoring ─────────────────────────────────────────────────

/**
 * Estimate syllable count for a word (simple heuristic).
 */
function estimateSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 2) return 1;

  // Count vowel groups
  const vowelGroups = w.match(/[aeiouy]+/g);
  if (!vowelGroups) return 1;

  let count = vowelGroups.length;

  // Silent e at end
  if (w.endsWith('e') && !w.endsWith('le') && count > 1) count--;
  // -ed endings (walked = 1, wanted = 2)
  if (w.endsWith('ed') && !w.endsWith('ted') && !w.endsWith('ded') && count > 1) count--;

  return Math.max(1, count);
}

/**
 * Determine stress pattern of a word.
 * Returns array of 'S' or 'w' for each syllable.
 */
function getWordStress(word: string): StressType[] {
  const clean = word.toLowerCase().replace(/[^a-z']/g, '');
  if (!clean) return [];

  const syllCount = estimateSyllables(clean);

  if (syllCount === 1) {
    // Single-syllable: stressed if content word, unstressed if function word
    return [FUNCTION_WORDS.has(clean) ? 'w' : 'S'];
  }

  // Multi-syllable: apply common English stress patterns
  const stresses: StressType[] = new Array(syllCount).fill('w');

  if (syllCount === 2) {
    // Most 2-syllable nouns/adjectives: stress on 1st (MON-ster, HAP-py)
    // Most 2-syllable verbs: stress on 2nd (be-GIN, de-STROY)
    // Default to first syllable stress (more common overall)
    stresses[0] = 'S';
  } else if (syllCount === 3) {
    // 3-syllable: often stress on 1st or 2nd
    // Words ending in -tion, -sion, -ity: stress on penultimate
    if (/tion$|sion$|ity$|ical$/.test(clean)) {
      stresses[syllCount - 2] = 'S';
    } else {
      stresses[0] = 'S';
    }
  } else {
    // 4+ syllables: stress penultimate by default, with secondary on 1st
    stresses[0] = 'S';
    if (syllCount >= 4) {
      stresses[syllCount - 2] = 'S';
    }
  }

  return stresses;
}

/**
 * Extract the stress pattern of a lyric line.
 */
function extractLineStress(line: string): StressType[] {
  const words = line.trim().split(/\s+/).filter(w => w.replace(/[^a-z]/gi, '').length > 0);
  const stresses: StressType[] = [];

  for (const word of words) {
    stresses.push(...getWordStress(word));
  }

  return stresses;
}

export function extractLineStressPublic(line: string): StressType[] {
  return extractLineStress(line);
}

export function scoreProsody(blueprint: ProsodyBlueprint, line: string): ProsodyScore {
  const lineStresses = extractLineStress(line);
  const blueprintHits = blueprint.pattern.filter(h => h.type !== 'rest');

  if (lineStresses.length === 0 || blueprintHits.length === 0) {
    return { score: 100, mismatches: [] };
  }

  const words = line.trim().split(/\s+/).filter(w => w.replace(/[^a-z]/gi, '').length > 0);
  const mismatches: ProsodyMismatch[] = [];

  // Align: map each syllable to the corresponding blueprint position
  const compareLength = Math.min(lineStresses.length, blueprintHits.length);
  let matches = 0;

  let wordIdx = 0;
  let sylInWord = 0;

  for (let i = 0; i < compareLength; i++) {
    const expected = blueprintHits[i].type;
    const actual = lineStresses[i];

    if (expected === actual) {
      matches++;
    } else {
      // Find which word this syllable belongs to
      const currentWord = wordIdx < words.length ? words[wordIdx] : '?';
      mismatches.push({
        position: blueprintHits[i].position,
        expected,
        actual,
        word: currentWord,
      });
    }

    // Track word boundaries
    sylInWord++;
    if (wordIdx < words.length) {
      const wordSylCount = estimateSyllables(words[wordIdx]);
      if (sylInWord >= wordSylCount) {
        wordIdx++;
        sylInWord = 0;
      }
    }
  }

  // Penalize length mismatch
  const lengthDiff = Math.abs(lineStresses.length - blueprintHits.length);
  const lengthPenalty = lengthDiff * 5;

  const rawScore = compareLength > 0 ? (matches / compareLength) * 100 : 0;
  const score = Math.max(0, Math.round(rawScore - lengthPenalty));

  return { score, mismatches };
}

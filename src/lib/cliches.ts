// ─── Cliché Database with Severity Levels ───────────────────────────
// Based on research: AI slop patterns, dead metaphors, predictable pairs

export type ClicheSeverity = 'critical' | 'warning' | 'suggestion';

export interface ClicheEntry {
  phrase: string;
  severity: ClicheSeverity;
}

// Critical: top overused phrases that immediately signal lazy writing
const CRITICAL_CLICHES: string[] = [
  'cold as ice', 'break my heart', 'down on my knees', 'lost without you',
  'neon lights', 'echoes in the dark', 'whispers in the wind', 'burning desire',
  'heart of gold', 'shattered dreams', 'broken chains', 'rise above',
  'endless night', 'fading light',
];

// Warning: heavily overused but sometimes defensible in context
const WARNING_CLICHES: string[] = [
  'oh baby', "it's now or never", 'your heart is cold', "i'm on fire",
  'take my hand', 'hold me close', 'hold me tight',
  'want you need you love you', 'at the break of dawn', 'like the stars above',
  "can't you see", 'begging you please', 'love at first sight', 'you complete me',
  'together forever', 'never let you go', 'chasing dreams', 'under the stars',
  'time will tell', 'came into my life', 'got to have you by my side',
  'shivers down my spine', 'unbreakable', 'we rise', 'ashes to dust',
  'dancing in the rain', 'like a hurricane', 'shadows of the past',
  'ignite the fire', 'burn so bright', 'paint the sky', 'against the world',
  'tears fall like rain', 'lost in the maze', 'symphony of', 'tapestry of',
  'kaleidoscope', 'test of time', 'stars align', 'chasing the sun',
  'into the unknown', 'soaring high', 'deep inside', 'feel the beat',
  'rhythm of my heart', 'city sleeps', 'midnight hour', 'electric feel',
  'magic in the air', 'end of time', 'spark to a flame', 'out of the ashes',
];

// Dead metaphors: so overused they no longer create imagery
const DEAD_METAPHORS: string[] = [
  'drowning in tears', 'walls around my heart', 'light at the end of the tunnel',
  'standing at a crossroads', 'broken wings',
];

// Build the master list with severities
export const CLICHE_DATABASE: ClicheEntry[] = [
  ...CRITICAL_CLICHES.map(phrase => ({ phrase, severity: 'critical' as ClicheSeverity })),
  ...DEAD_METAPHORS.map(phrase => ({ phrase, severity: 'critical' as ClicheSeverity })),
  ...WARNING_CLICHES.map(phrase => ({ phrase, severity: 'warning' as ClicheSeverity })),
];

// Flat list for backward compatibility
export const AI_CLICHES = CLICHE_DATABASE.map(c => c.phrase);

// ─── AI Slop Markers (Rule AI-1) ────────────────────────────────────
// Flag if ≥3 found in a song — indicates AI-generated content

export const AI_SLOP_MARKERS: string[] = [
  'echoes', 'echoing', 'whispers', 'whispers in the dark',
  'neon', 'neon lights', 'neon glow', 'embrace',
  'soar', 'rise above', 'shattered dreams', 'fading light',
  'endless night', 'waves crashing', 'unseen tears', 'lost in time',
  'forgotten memories', 'burning bridges', 'broken chains', 'empty streets',
  'digital glow', 'stories untold', 'beneath the stars', 'under the stars',
];

// ─── Predictable Rhyme Pairs ────────────────────────────────────────
// Flag when both words appear as end-rhymes in the same section

export const PREDICTABLE_RHYME_PAIRS: [string, string][] = [
  ['love', 'above'], ['heart', 'apart'], ['fire', 'desire'],
  ['rain', 'pain'], ['night', 'light'], ['night', 'fight'],
  ['night', 'right'], ['true', 'blue'], ['fly', 'sky'],
  ['kiss', 'miss'], ['dance', 'chance'], ['hold', 'cold'],
  ['hold', 'gold'], ['eyes', 'skies'], ['eyes', 'lies'],
  ['arms', 'charms'], ['all', 'fall'], ['hand', 'understand'],
];

// ─── Cosmic/Elemental Imagery (Rule AI-5) ───────────────────────────
// Flag if ≥4 total instances across the song

export const COSMIC_WORDS: string[] = [
  'stars', 'moon', 'sun', 'fire', 'flames', 'sky',
  'rain', 'ocean', 'storm', 'heaven', 'light', 'darkness',
];

// ─── Predictable Chorus Resolutions (Rule AI-8) ─────────────────────

export const PREDICTABLE_RESOLUTIONS: string[] = [
  'forever', 'together', 'rise above',
  "we'll be alright", "we'll make it through", "we'll be okay",
];

// ─── Telling-vs-Showing Word Lists (Rules TS-1 through TS-4) ───────

export const DIRECT_EMOTIONS: string[] = [
  'sad', 'lonely', 'happy', 'angry', 'scared', 'hurt',
  'afraid', 'hopeless', 'helpless', 'depressed', 'anxious',
  'jealous', 'guilty', 'ashamed', 'devastated', 'heartbroken',
];

export const STATE_OF_BEING_VERBS: string[] = [
  'is', 'am', 'was', 'were', 'feel', 'seem', 'look', 'appear',
  'feels', 'seems', 'looks', 'appears', "i'm", "it's", "he's", "she's",
];

export const SENSORY_WORDS = {
  sight: ['bright', 'dim', 'shadow', 'gleam', 'flash', 'blur', 'glow', 'shimmer', 'flicker'],
  sound: ['loud', 'quiet', 'crash', 'ring', 'hum', 'buzz', 'crack', 'rumble', 'echo', 'roar'],
  touch: ['cold', 'warm', 'hot', 'rough', 'smooth', 'soft', 'sharp', 'wet', 'dry', 'tender'],
  taste: ['sweet', 'bitter', 'sour', 'salty', 'burn', 'sting'],
  smell: ['fresh', 'stale', 'smoke', 'perfume', 'sweat'],
  body: ['heartbeat', 'breath', 'pulse', 'shiver', 'ache', 'dizzy', 'numb', 'tremble'],
  movement: ['run', 'fall', 'spin', 'stumble', 'crawl', 'drift', 'float', 'sway', 'leap'],
};

export const CONCRETE_NOUNS: string[] = [
  // Body parts
  'hands', 'hand', 'fingers', 'finger', 'eyes', 'lips', 'mouth', 'skin',
  'bones', 'blood', 'hair', 'shoulder', 'chest', 'arms', 'feet', 'knees',
  // Objects
  'door', 'window', 'glass', 'bottle', 'phone', 'car', 'bed', 'chair',
  'table', 'mirror', 'key', 'ring', 'watch', 'clock', 'knife', 'gun',
  'cigarette', 'coffee', 'wine', 'beer', 'dress', 'shirt', 'shoes', 'jacket',
  'letter', 'photo', 'picture', 'book', 'page', 'pen', 'money', 'coin',
  // Places
  'street', 'road', 'highway', 'bridge', 'corner', 'alley', 'bar',
  'church', 'kitchen', 'bedroom', 'bathroom', 'hallway', 'porch', 'roof',
  'sidewalk', 'parking', 'basement', 'attic', 'staircase', 'elevator',
  // Nature (specific, not cosmic)
  'river', 'creek', 'mountain', 'hill', 'tree', 'leaf', 'flower', 'grass',
  'dirt', 'mud', 'sand', 'stone', 'rock', 'dust', 'snow', 'ice', 'frost',
  // Vehicles
  'truck', 'bus', 'train', 'plane', 'boat', 'bicycle',
  // Food
  'bread', 'sugar', 'salt', 'honey', 'milk', 'whiskey', 'bourbon',
];

export const FILLER_WORDS: string[] = [
  'and', 'just', 'so', 'well', 'yeah', 'oh', 'like', 'but',
];

// ─── Matching Interface ─────────────────────────────────────────────

export interface ClicheMatch {
  phrase: string;
  line: number;
  startCol: number;
  endCol: number;
  severity: ClicheSeverity;
}

export function findCliches(lyrics: string): ClicheMatch[] {
  const matches: ClicheMatch[] = [];
  const lines = lyrics.split('\n');

  lines.forEach((line, lineIndex) => {
    const lowerLine = line.toLowerCase();

    CLICHE_DATABASE.forEach(({ phrase, severity }) => {
      let startIndex = 0;
      while ((startIndex = lowerLine.indexOf(phrase, startIndex)) !== -1) {
        matches.push({
          phrase,
          line: lineIndex + 1,
          startCol: startIndex + 1,
          endCol: startIndex + phrase.length + 1,
          severity,
        });
        startIndex += phrase.length;
      }
    });
  });

  return matches;
}

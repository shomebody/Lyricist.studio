import { create } from 'zustand';
import { User } from 'firebase/auth';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface Template {
  id: string;
  name: string;
  genre: string;
  pocketMap: Record<number, number>; // line index -> target syllables
  defaultStylePrompt: string;
  description: string;
}

export interface Project {
  id: string;
  uid: string;
  title: string;
  lyrics: string;
  stylePrompt: string;
  templateId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface LyricIssue {
  id: string;
  line: number;
  originalText: string;
  issue: string;
  suggestion: string;
  severity: 'error' | 'warning' | 'info';
}

export const TEMPLATES: Record<string, Template> = {
  'prog-house': {
    id: 'prog-house',
    name: 'Progressive House',
    genre: 'EDM',
    defaultStylePrompt: 'Progressive house, 128 BPM, euphoric synth leads, driving bassline, emotional female vocals, festival anthem, build and drop',
    description: 'Builds energy through filter automation rather than lyric density. Sparse pockets with 4-8 syllable phrases.',
    pocketMap: {
      0: 8, 1: 7, 2: 8, 3: 6, // Verse 1
      4: 8, 5: 7, 6: 8, 7: 6,
    }
  },
  'modern-pop': {
    id: 'modern-pop',
    name: 'Modern Pop',
    genre: 'Pop',
    defaultStylePrompt: 'Modern pop, 110 BPM, punchy drums, clean synth bass, breathy close-mic vocals, polished production, radio hit',
    description: 'Max Martin style melodic math. Highly structured, repetitive hooks, tight syllable mirroring.',
    pocketMap: {
      0: 7, 1: 7, 2: 5, 3: 7, // Chorus
      4: 7, 5: 7, 6: 5, 7: 7,
    }
  },
  'country': {
    id: 'country',
    name: 'Modern Country',
    genre: 'Country',
    defaultStylePrompt: 'Modern country, 90 BPM, acoustic guitar, subtle pedal steel, storytelling male vocals, organic drums, radio friendly',
    description: 'Storytelling-forward. Denser syllable pockets in verses, opening up for anthemic, resolved choruses.',
    pocketMap: {
      0: 9, 1: 9, 2: 8, 3: 9, // Verse
      4: 9, 5: 9, 6: 8, 7: 9,
    }
  },
  'synth-pop': {
    id: 'synth-pop',
    name: 'Synth Pop',
    genre: 'Pop',
    defaultStylePrompt: 'Retro-futuristic synth pop, 120 BPM, four-on-the-floor, 80s arpeggiated bassline, vocoder harmonies, crisp modern production',
    description: '80s revival. Driving rhythm, symmetrical phrasing, often uses AABB or ABAB rhyme schemes.',
    pocketMap: {
      0: 8, 1: 8, 2: 8, 3: 4, // Verse
      4: 8, 5: 8, 6: 8, 7: 4,
    }
  },
  'deep-house': {
    id: 'deep-house',
    name: 'Deep House',
    genre: 'EDM',
    defaultStylePrompt: 'Deep house, 122 BPM, minimal groove, sub bass, sparse soulful vocal chops, atmospheric pads, club mix',
    description: 'Groove-forward, minimal vocal. Very sparse pockets, lots of space between phrases.',
    pocketMap: {
      0: 5, 1: 5, 2: 5, 3: 5, // Verse
      4: 5, 5: 5, 6: 5, 7: 5,
    }
  },
  'hip-hop': {
    id: 'hip-hop',
    name: 'Hip-Hop / Rap',
    genre: 'Hip-Hop',
    defaultStylePrompt: 'Modern hip-hop, 90 BPM, trap hi-hats, 808 bass, confident rap vocals, dark melodic loop, crisp snare',
    description: 'Syllable-dense, flow-focused. Heavy internal rhymes and complex rhythmic pockets.',
    pocketMap: {
      0: 12, 1: 12, 2: 12, 3: 12, // Verse
      4: 12, 5: 12, 6: 12, 7: 12,
    }
  },
  'rnb': {
    id: 'rnb',
    name: 'Contemporary R&B',
    genre: 'R&B',
    defaultStylePrompt: 'Contemporary R&B, 85 BPM, smooth bassline, lush vocal harmonies, trap-influenced hi-hats, emotional delivery',
    description: 'Melismatic vocal runs and conversational phrasing. Syllable counts often vary to allow for vocal gymnastics.',
    pocketMap: {
      0: 9, 1: 6, 2: 9, 3: 6, // Verse
      4: 9, 5: 6, 6: 9, 7: 6,
    }
  },
  'rock-anthem': {
    id: 'rock-anthem',
    name: 'Stadium Rock Anthem',
    genre: 'Rock',
    defaultStylePrompt: 'Stadium rock, 130 BPM, distorted power chords, driving drum beat, gritty male vocals, epic guitar solo, arena anthem',
    description: 'Big, punchy phrases. Choruses rely on short, memorable, highly repetitive hooks.',
    pocketMap: {
      0: 6, 1: 6, 2: 8, 3: 4, // Chorus
      4: 6, 5: 6, 6: 8, 7: 4,
    }
  },
  'indie-folk': {
    id: 'indie-folk',
    name: 'Indie Folk',
    genre: 'Folk',
    defaultStylePrompt: 'Indie folk, 80 BPM, fingerpicked acoustic guitar, intimate vocals, subtle strings, warm organic production, melancholic',
    description: 'Poetic, imagery-heavy. Often uses irregular meter and longer, conversational lines.',
    pocketMap: {
      0: 10, 1: 11, 2: 10, 3: 11, // Verse
      4: 10, 5: 11, 6: 10, 7: 11,
    }
  },
  'k-pop': {
    id: 'k-pop',
    name: 'K-Pop High Energy',
    genre: 'Pop',
    defaultStylePrompt: 'K-pop, 125 BPM, maximalist production, heavy bass drops, rapid-fire rap verses, soaring vocal chorus, dynamic arrangement',
    description: 'Highly segmented. Rapid shifts between dense rap pockets and sparse, melodic vocal hooks.',
    pocketMap: {
      0: 4, 1: 4, 2: 8, 3: 8, // Pre-Chorus into Chorus
      4: 5, 5: 5, 6: 5, 7: 5,
    }
  },
  'lofi-hiphop': {
    id: 'lofi-hiphop',
    name: 'Lo-Fi Hip Hop',
    genre: 'Hip-Hop',
    defaultStylePrompt: 'Lo-fi hip hop, 75 BPM, dusty drum breaks, vinyl crackle, jazzy piano chords, relaxed delivery, chill study beats',
    description: 'Relaxed, conversational flow. Often features spoken-word style delivery with loose syllable structures.',
    pocketMap: {
      0: 10, 1: 10, 2: 10, 3: 10,
      4: 10, 5: 10, 6: 10, 7: 10,
    }
  },
  'synthwave': {
    id: 'synthwave',
    name: 'Synthwave',
    genre: 'Electronic',
    defaultStylePrompt: 'Synthwave, 100 BPM, retro 80s synthesizers, gated snare, driving bassline, nostalgic, cinematic',
    description: 'Nostalgic and atmospheric. Uses steady, repetitive phrasing with clear AABB rhyme schemes.',
    pocketMap: {
      0: 8, 1: 8, 2: 8, 3: 8,
      4: 8, 5: 8, 6: 8, 7: 8,
    }
  },
  'metalcore': {
    id: 'metalcore',
    name: 'Metalcore',
    genre: 'Metal',
    defaultStylePrompt: 'Metalcore, 140 BPM, heavy guitar breakdowns, double kick drums, aggressive screamed vocals, melodic clean chorus',
    description: 'Aggressive and dense verses contrasting with open, soaring choruses.',
    pocketMap: {
      0: 12, 1: 12, 2: 12, 3: 12, // Verse (screamed)
      4: 6, 5: 6, 6: 6, 7: 6,     // Chorus (clean)
    }
  },
  'reggae': {
    id: 'reggae',
    name: 'Roots Reggae',
    genre: 'Reggae',
    defaultStylePrompt: 'Roots reggae, 75 BPM, one-drop drum beat, skank guitar chords, heavy bassline, soulful vocals, positive vibes',
    description: 'Syncopated and laid-back. Phrasing often falls behind the beat with repetitive, chant-like choruses.',
    pocketMap: {
      0: 7, 1: 7, 2: 7, 3: 7,
      4: 7, 5: 7, 6: 7, 7: 7,
    }
  },
  'punk-rock': {
    id: 'punk-rock',
    name: 'Punk Rock',
    genre: 'Rock',
    defaultStylePrompt: 'Punk rock, 160 BPM, fast power chords, energetic drum beat, raw shouted vocals, rebellious attitude',
    description: 'Fast, aggressive, and straight to the point. Short lines with simple, punchy rhymes.',
    pocketMap: {
      0: 6, 1: 6, 2: 6, 3: 6,
      4: 6, 5: 6, 6: 6, 7: 6,
    }
  },
  'jazz-standard': {
    id: 'jazz-standard',
    name: 'Jazz Standard',
    genre: 'Jazz',
    defaultStylePrompt: 'Jazz standard, 110 BPM, swing rhythm, walking bass, brushed snare, smooth crooner vocals, sophisticated harmony',
    description: 'Sophisticated phrasing with complex internal rhymes and conversational timing.',
    pocketMap: {
      0: 8, 1: 10, 2: 8, 3: 10,
      4: 8, 5: 10, 6: 8, 7: 10,
    }
  },
  'blues': {
    id: 'blues',
    name: '12-Bar Blues',
    genre: 'Blues',
    defaultStylePrompt: '12-bar blues, 60 BPM, slow shuffle, electric guitar licks, gritty soulful vocals, emotional pain',
    description: 'AAB lyric structure. The first line is repeated, followed by a rhyming resolution.',
    pocketMap: {
      0: 10, 1: 10, 2: 10, 3: 10, // A, A, B
      4: 10, 5: 10, 6: 10, 7: 10,
    }
  },
  'neo-soul': {
    id: 'neo-soul',
    name: 'Neo-Soul',
    genre: 'R&B',
    defaultStylePrompt: 'Neo-soul, 85 BPM, laid-back groove, electric piano, warm bass, smooth expressive vocals, organic feel',
    description: 'Fluid and expressive. Syllable counts vary to allow for vocal runs and emotional delivery.',
    pocketMap: {
      0: 9, 1: 7, 2: 9, 3: 7,
      4: 9, 5: 7, 6: 9, 7: 7,
    }
  },
  'afrobeat': {
    id: 'afrobeat',
    name: 'Afrobeat',
    genre: 'World',
    defaultStylePrompt: 'Afrobeat, 115 BPM, complex polyrhythms, horn section, driving bass, energetic group vocals, danceable',
    description: 'Highly rhythmic and repetitive. Often features call-and-response vocal arrangements.',
    pocketMap: {
      0: 6, 1: 6, 2: 6, 3: 6,
      4: 6, 5: 6, 6: 6, 7: 6,
    }
  },
  'disco': {
    id: 'disco',
    name: 'Classic Disco',
    genre: 'Pop',
    defaultStylePrompt: 'Classic disco, 120 BPM, four-on-the-floor, sweeping strings, funky bassline, soaring diva vocals, dancefloor anthem',
    description: 'Uplifting and repetitive. Focuses on memorable, sing-along choruses with consistent meter.',
    pocketMap: {
      0: 8, 1: 8, 2: 8, 3: 8,
      4: 8, 5: 8, 6: 8, 7: 8,
    }
  },
  'bossa-nova': {
    id: 'bossa-nova',
    name: 'Bossa Nova',
    genre: 'Latin',
    defaultStylePrompt: 'Bossa nova, 70 BPM, nylon string guitar, syncopated rhythm, whispered romantic vocals, gentle percussion',
    description: 'Soft, poetic, and highly syncopated. Phrasing often floats over the complex rhythm.',
    pocketMap: {
      0: 7, 1: 9, 2: 7, 3: 9,
      4: 7, 5: 9, 6: 7, 7: 9,
    }
  },
  'trap': {
    id: 'trap',
    name: 'Trap / Drill',
    genre: 'Hip-Hop',
    defaultStylePrompt: 'Drill, 140 BPM, sliding 808s, rapid hi-hat rolls, aggressive rap delivery, dark cinematic melodies',
    description: 'Fast, triplet-heavy flows. Dense syllable packing with frequent internal rhymes.',
    pocketMap: {
      0: 14, 1: 14, 2: 14, 3: 14,
      4: 14, 5: 14, 6: 14, 7: 14,
    }
  },
  'shoegaze': {
    id: 'shoegaze',
    name: 'Shoegaze',
    genre: 'Alternative',
    defaultStylePrompt: 'Shoegaze, 90 BPM, wall of sound guitars, heavy reverb, ethereal buried vocals, dreamy atmosphere',
    description: 'Ethereal and sparse. Vocals act more as an instrument, with drawn-out syllables and minimal lyrics.',
    pocketMap: {
      0: 4, 1: 4, 2: 4, 3: 4,
      4: 4, 5: 4, 6: 4, 7: 4,
    }
  },
  'sea-shanty': {
    id: 'sea-shanty',
    name: 'Sea Shanty',
    genre: 'Folk',
    defaultStylePrompt: 'Sea shanty, 100 BPM, a cappella group vocals, stomping rhythm, storytelling, nautical theme',
    description: 'Strong, rhythmic call-and-response structure. Very rigid meter and simple rhyme schemes.',
    pocketMap: {
      0: 8, 1: 6, 2: 8, 3: 6,
      4: 8, 5: 6, 6: 8, 7: 6,
    }
  },
  'bluegrass': {
    id: 'bluegrass',
    name: 'Bluegrass',
    genre: 'Country',
    defaultStylePrompt: 'Bluegrass, 130 BPM, fast acoustic picking, banjo, fiddle, high lonesome vocal harmonies',
    description: 'Fast-paced storytelling. Often uses AABB or ABCB rhyme schemes with consistent syllable counts.',
    pocketMap: {
      0: 9, 1: 9, 2: 9, 3: 9,
      4: 9, 5: 9, 6: 9, 7: 9,
    }
  },
  'celtic-punk': {
    id: 'celtic-punk',
    name: 'Celtic Punk',
    genre: 'Punk',
    defaultStylePrompt: 'Celtic punk, 150 BPM, distorted guitars, bagpipes, tin whistle, aggressive gang vocals, pub anthem',
    description: 'High energy, drinking song structure. Repetitive, anthemic choruses with storytelling verses.',
    pocketMap: {
      0: 8, 1: 8, 2: 8, 3: 8,
      4: 8, 5: 8, 6: 8, 7: 8,
    }
  },
  'trip-hop': {
    id: 'trip-hop',
    name: 'Trip Hop',
    genre: 'Electronic',
    defaultStylePrompt: 'Trip hop, 80 BPM, downtempo breakbeats, dark atmospheric samples, sultry female vocals, vinyl scratch',
    description: 'Slow, moody, and atmospheric. Vocals are often whispered or spoken with loose, jazzy phrasing.',
    pocketMap: {
      0: 6, 1: 8, 2: 6, 3: 8,
      4: 6, 5: 8, 6: 6, 7: 8,
    }
  },
  'ska': {
    id: 'ska',
    name: 'Ska',
    genre: 'Reggae',
    defaultStylePrompt: 'Ska, 135 BPM, upbeat horn section, walking bassline, offbeat guitar skanks, energetic vocals',
    description: 'Upbeat and bouncy. Fast-paced lyrics with tight, predictable rhyme schemes.',
    pocketMap: {
      0: 8, 1: 8, 2: 8, 3: 8,
      4: 8, 5: 8, 6: 8, 7: 8,
    }
  },
  'grunge': {
    id: 'grunge',
    name: 'Grunge',
    genre: 'Rock',
    defaultStylePrompt: 'Grunge, 110 BPM, fuzzy distorted guitars, heavy bass, angst-ridden raspy vocals, loud-quiet dynamics',
    description: 'Quiet, brooding verses leading into explosive, repetitive choruses.',
    pocketMap: {
      0: 6, 1: 6, 2: 6, 3: 6, // Verse
      4: 4, 5: 4, 6: 4, 7: 4, // Chorus
    }
  },
  'ambient': {
    id: 'ambient',
    name: 'Ambient',
    genre: 'Electronic',
    defaultStylePrompt: 'Ambient, 60 BPM, lush synthesizer pads, no drums, ethereal vocal textures, cinematic, relaxing',
    description: 'Extremely sparse. Vocals are used as textural elements rather than storytelling.',
    pocketMap: {
      0: 3, 1: 3, 2: 3, 3: 3,
      4: 3, 5: 3, 6: 3, 7: 3,
    }
  },
  'classical-crossover': {
    id: 'classical-crossover',
    name: 'Classical Crossover',
    genre: 'Classical',
    defaultStylePrompt: 'Classical crossover, 80 BPM, full orchestra, grand piano, operatic pop vocals, dramatic crescendo',
    description: 'Grand and theatrical. Long, sustained phrases with dramatic pauses.',
    pocketMap: {
      0: 10, 1: 10, 2: 10, 3: 10,
      4: 10, 5: 10, 6: 10, 7: 10,
    }
  },
  'gospel': {
    id: 'gospel',
    name: 'Gospel',
    genre: 'R&B',
    defaultStylePrompt: 'Gospel, 100 BPM, Hammond B3 organ, grand piano, powerful choir harmonies, soulful lead vocal, uplifting',
    description: 'Call and response structure. Lead vocal improvises over a steady, repetitive choir hook.',
    pocketMap: {
      0: 8, 1: 8, 2: 8, 3: 8,
      4: 8, 5: 8, 6: 8, 7: 8,
    }
  },
  'latin-pop': {
    id: 'latin-pop',
    name: 'Latin Pop',
    genre: 'Latin',
    defaultStylePrompt: 'Latin pop, 105 BPM, reggaeton beat, acoustic guitar flourishes, passionate vocals, danceable, summer hit',
    description: 'Highly rhythmic and syncopated. Often mixes rapid-fire verses with soaring, melodic choruses.',
    pocketMap: {
      0: 10, 1: 10, 2: 10, 3: 10,
      4: 8, 5: 8, 6: 8, 7: 8,
    }
  },
  'electropop': {
    id: 'electropop',
    name: 'Electropop',
    genre: 'Pop',
    defaultStylePrompt: 'Electropop, 115 BPM, heavy synth bass, crisp electronic drums, processed vocals, catchy hooks',
    description: 'Symmetrical and highly structured. Focuses on tight, memorable, and repetitive phrasing.',
    pocketMap: {
      0: 7, 1: 7, 2: 7, 3: 7,
      4: 7, 5: 7, 6: 7, 7: 7,
    }
  },
  'nu-metal': {
    id: 'nu-metal',
    name: 'Nu-Metal',
    genre: 'Metal',
    defaultStylePrompt: 'Nu-metal, 100 BPM, drop-tuned guitars, hip-hop drum beat, turntable scratches, aggressive rap-screaming',
    description: 'Mixes dense, rhythmic rap verses with explosive, screamed or sung choruses.',
    pocketMap: {
      0: 12, 1: 12, 2: 12, 3: 12, // Rap verse
      4: 6, 5: 6, 6: 6, 7: 6,     // Heavy chorus
    }
  },
  'folk-rock': {
    id: 'folk-rock',
    name: 'Folk Rock',
    genre: 'Rock',
    defaultStylePrompt: 'Folk rock, 105 BPM, strummed acoustic guitars, driving bass, vocal harmonies, storytelling',
    description: 'Narrative-driven. Uses traditional song structures with a focus on lyrical storytelling.',
    pocketMap: {
      0: 8, 1: 9, 2: 8, 3: 9,
      4: 8, 5: 9, 6: 8, 7: 9,
    }
  },
  'psychedelic-rock': {
    id: 'psychedelic-rock',
    name: 'Psychedelic Rock',
    genre: 'Rock',
    defaultStylePrompt: 'Psychedelic rock, 90 BPM, swirling phaser guitars, vintage organ, trippy echo vocals, mind-bending',
    description: 'Abstract and poetic. Phrasing can be irregular, following the flow of the instrumentation.',
    pocketMap: {
      0: 7, 1: 8, 2: 7, 3: 8,
      4: 7, 5: 8, 6: 7, 7: 8,
    }
  },
  'dubstep': {
    id: 'dubstep',
    name: 'Dubstep',
    genre: 'EDM',
    defaultStylePrompt: 'Dubstep, 140 BPM, massive bass drops, aggressive synth growls, half-time drum beat, energetic build-up',
    description: 'Vocals are usually limited to short pre-drop phrases or sparse rhythmic chants.',
    pocketMap: {
      0: 4, 1: 4, 2: 4, 3: 4,
      4: 4, 5: 4, 6: 4, 7: 4,
    }
  },
  'hyperpop': {
    id: 'hyperpop',
    name: 'Hyperpop',
    genre: 'Pop',
    defaultStylePrompt: 'Hyperpop, 160 BPM, distorted 808s, glitchy synthesizers, heavily pitch-shifted vocals, chaotic energy',
    description: 'Fast, chaotic, and highly processed. Syllables are often rapid-fire and heavily manipulated.',
    pocketMap: {
      0: 10, 1: 10, 2: 10, 3: 10,
      4: 10, 5: 10, 6: 10, 7: 10,
    }
  },
  'city-pop': {
    id: 'city-pop',
    name: 'City Pop',
    genre: 'Pop',
    defaultStylePrompt: 'City pop, 110 BPM, 80s funk bass, bright brass section, smooth female vocals, nostalgic urban night',
    description: 'Breezy and sophisticated. Smooth, melodic phrasing with a mix of short and long lines.',
    pocketMap: {
      0: 8, 1: 10, 2: 8, 3: 10,
      4: 8, 5: 10, 6: 8, 7: 10,
    }
  },
  'tropical-house': {
    id: 'tropical-house',
    name: 'Tropical House',
    genre: 'Electronic',
    defaultStylePrompt: 'Tropical house, 100 BPM, marimba plucks, steel drums, pan flute, breezy, upbeat, Kygo style, deep house bassline, summery',
    description: 'Breezy, sun-soaked electronic pop with a laid-back groove. Keep lyrics light, summery, and melodic with consistent 4-on-the-floor phrasing.',
    pocketMap: {
      0: 8, 1: 8, 2: 8, 3: 8, // Verse
      4: 6, 5: 6, 6: 6, 7: 6, // Pre-chorus/Chorus
    }
  },
  'tropical-pop-wordy': {
    id: 'tropical-pop-wordy',
    name: 'Tropical Pop (Wordy/Syncopated)',
    genre: 'Pop',
    defaultStylePrompt: 'Tropical pop, dancehall influence, 105 BPM, syncopated marimba, heavy sub bass, wordy offbeat female vocals, Rihanna style',
    description: 'Dense, syncopated verses with an offbeat rhythm. Often uses vocal delays to extend phrases across bars.',
    pocketMap: {
      0: 11, 1: 11, 2: 11, 3: 11, // Verse (wordy)
      4: 6, 5: 6, 6: 6, 7: 6,     // Chorus (punchy)
    }
  }
};

interface AppState {
  user: User | null;
  setUser: (user: User | null) => void;
  
  projects: Project[];
  setProjects: (projects: Project[]) => void;
  currentProjectId: string | null;
  setCurrentProjectId: (id: string | null) => void;

  lyrics: string;
  setLyrics: (lyrics: string) => void;
  
  stylePrompt: string;
  setStylePrompt: (prompt: string) => void;
  
  currentTemplateId: string | null;
  setTemplateId: (id: string | null) => void;
  
  chatHistory: Message[];
  addMessage: (msg: Message) => void;
  clearChat: () => void;
  
  isAIPanelOpen: boolean;
  toggleAIPanel: () => void;
  
  lyricIssues: LyricIssue[];
  setLyricIssues: (issues: LyricIssue[]) => void;
  isAnalyzing: boolean;
  setIsAnalyzing: (is: boolean) => void;
}

export const useStore = create<AppState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  
  projects: [],
  setProjects: (projects) => set({ projects }),
  currentProjectId: null,
  setCurrentProjectId: (id) => set({ currentProjectId: id }),

  lyrics: '',
  setLyrics: (lyrics) => set({ lyrics }),
  
  stylePrompt: '',
  setStylePrompt: (prompt) => set({ stylePrompt: prompt }),
  
  currentTemplateId: null,
  setTemplateId: (id) => set((state) => {
    // Auto-fill style prompt when template changes
    const template = id ? TEMPLATES[id] : null;
    return { 
      currentTemplateId: id,
      stylePrompt: template ? template.defaultStylePrompt : state.stylePrompt
    };
  }),
  
  chatHistory: [],
  addMessage: (msg) => set((state) => ({ chatHistory: [...state.chatHistory, msg] })),
  clearChat: () => set({ chatHistory: [] }),
  
  isAIPanelOpen: true,
  toggleAIPanel: () => set((state) => ({ isAIPanelOpen: !state.isAIPanelOpen })),
  
  lyricIssues: [],
  setLyricIssues: (issues) => set({ lyricIssues: issues }),
  isAnalyzing: false,
  setIsAnalyzing: (is) => set({ isAnalyzing: is }),
}));

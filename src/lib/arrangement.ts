/**
 * arrangement.ts — Bar-aware arrangement engine for Suno lyric writing.
 *
 * Key concepts:
 *  - A "Section" is a labeled block (Verse, Chorus, Pre-Chorus, Bridge, etc.)
 *  - Each section has a bar count (how many musical bars it spans)
 *  - Each section has a lines-per-bar hint and syllable target per line
 *  - The arrangement is an ordered list of sections
 *  - Suno v5 supports bar annotations like [VERSE 1 8] [PRE 4] [CHORUS 8]
 *
 * This module provides:
 *  - Type definitions for the new template format
 *  - Default genre templates with bar-aware sections
 *  - Utilities for parsing lyrics against an arrangement
 *  - Overflow detection (does the pre-chorus bleed into the chorus?)
 *  - Migration helper from the old flat pocketMap format
 *  - Export formatter that produces Suno v5 bar-annotated output
 */

// ─── Section Types ──────────────────────────────────────────────────

export type SectionType =
  | 'intro'
  | 'verse'
  | 'pre-chorus'
  | 'chorus'
  | 'post-chorus'
  | 'bridge'
  | 'breakdown'
  | 'drop'
  | 'instrumental'
  | 'outro'
  | 'hook'
  | 'ad-lib'
  | 'custom';

export interface SectionDefinition {
  id: string;
  type: SectionType;
  label: string;              // e.g. "Verse 1", "Chorus", "Pre-Chorus"
  bars: number;               // target bar count for this section
  linesPerBar: number;        // typical lines of lyrics per bar (e.g. 0.5 = 1 line every 2 bars)
  syllableTarget: number;     // target syllables per lyric line
  syllableTolerance: number;  // acceptable deviation (+/-)
  performanceCues?: string[]; // e.g. ["(whispered)", "(belted)"]
  description?: string;       // helper text for the writer
  color: string;              // CSS color token for editor highlighting
  // Future: audioRef for looping reference tracks
  audioRef?: {
    startBar?: number;
    endBar?: number;
    url?: string;
  };
}

export interface ArrangementTemplate {
  id: string;
  name: string;
  genre: string;
  bpm: number;
  description: string;
  defaultStylePrompt: string;
  sections: SectionDefinition[];
  isCustom?: boolean;         // user-created templates
  createdAt?: number;
  updatedAt?: number;
}

// ─── Section Colors ─────────────────────────────────────────────────
// Each section type gets a distinct color for editor gutter highlighting

export const SECTION_COLORS: Record<SectionType, string> = {
  'intro':        '#6366f1', // indigo
  'verse':        '#3b82f6', // blue
  'pre-chorus':   '#f59e0b', // amber
  'chorus':       '#ef4444', // red
  'post-chorus':  '#f97316', // orange
  'bridge':       '#8b5cf6', // violet
  'breakdown':    '#06b6d4', // cyan
  'drop':         '#ec4899', // pink
  'instrumental': '#64748b', // slate
  'outro':        '#6366f1', // indigo (same as intro for bookend feel)
  'hook':         '#ef4444', // red (similar energy to chorus)
  'ad-lib':       '#a1a1aa', // zinc
  'custom':       '#10b981', // emerald
};

export const SECTION_BG_COLORS: Record<SectionType, string> = {
  'intro':        'rgba(99, 102, 241, 0.08)',
  'verse':        'rgba(59, 130, 246, 0.08)',
  'pre-chorus':   'rgba(245, 158, 11, 0.08)',
  'chorus':       'rgba(239, 68, 68, 0.08)',
  'post-chorus':  'rgba(249, 115, 22, 0.08)',
  'bridge':       'rgba(139, 92, 246, 0.08)',
  'breakdown':    'rgba(6, 182, 212, 0.08)',
  'drop':         'rgba(236, 72, 153, 0.08)',
  'instrumental': 'rgba(100, 116, 139, 0.08)',
  'outro':        'rgba(99, 102, 241, 0.08)',
  'hook':         'rgba(239, 68, 68, 0.08)',
  'ad-lib':       'rgba(161, 161, 170, 0.08)',
  'custom':       'rgba(16, 185, 129, 0.08)',
};

// ─── Utility: Generate Section ID ───────────────────────────────────

let _sectionIdCounter = 0;
export function generateSectionId(): string {
  _sectionIdCounter++;
  return `sec_${Date.now()}_${_sectionIdCounter}`;
}

// ─── Utility: Create a section with defaults ────────────────────────

export function createSection(
  type: SectionType,
  label: string,
  overrides: Partial<SectionDefinition> = {}
): SectionDefinition {
  const defaults = SECTION_DEFAULTS[type] || SECTION_DEFAULTS['custom'];
  return {
    id: generateSectionId(),
    type,
    label,
    bars: defaults.bars,
    linesPerBar: defaults.linesPerBar,
    syllableTarget: defaults.syllableTarget,
    syllableTolerance: defaults.syllableTolerance,
    color: SECTION_COLORS[type],
    description: defaults.description,
    ...overrides,
  };
}

// Sensible defaults per section type (genre-agnostic starting points)
export const SECTION_DEFAULTS: Record<SectionType, {
  bars: number;
  linesPerBar: number;
  syllableTarget: number;
  syllableTolerance: number;
  description: string;
}> = {
  'intro':        { bars: 4,  linesPerBar: 0.5, syllableTarget: 6,  syllableTolerance: 2, description: 'Set the mood. Sparse lyrics or instrumental.' },
  'verse':        { bars: 8,  linesPerBar: 1,   syllableTarget: 8,  syllableTolerance: 2, description: 'Tell the story. Denser lyrics, building energy.' },
  'pre-chorus':   { bars: 4,  linesPerBar: 1,   syllableTarget: 7,  syllableTolerance: 2, description: 'Build tension. Transition to the chorus lift.' },
  'chorus':       { bars: 8,  linesPerBar: 1,   syllableTarget: 7,  syllableTolerance: 1, description: 'The hook. Keep it simple, repetitive, singable.' },
  'post-chorus':  { bars: 4,  linesPerBar: 0.5, syllableTarget: 5,  syllableTolerance: 2, description: 'Let the chorus breathe. Short, punchy.' },
  'bridge':       { bars: 8,  linesPerBar: 1,   syllableTarget: 8,  syllableTolerance: 2, description: 'Contrast. New perspective, different melody.' },
  'breakdown':    { bars: 4,  linesPerBar: 0.5, syllableTarget: 5,  syllableTolerance: 2, description: 'Strip it back. Minimal instrumentation.' },
  'drop':         { bars: 8,  linesPerBar: 0.5, syllableTarget: 4,  syllableTolerance: 2, description: 'Energy release. Minimal vocals, big production.' },
  'instrumental': { bars: 8,  linesPerBar: 0,   syllableTarget: 0,  syllableTolerance: 0, description: 'No vocals. Solo, interlude, or transition.' },
  'outro':        { bars: 4,  linesPerBar: 0.5, syllableTarget: 6,  syllableTolerance: 2, description: 'Wind down. Resolve or fade.' },
  'hook':         { bars: 4,  linesPerBar: 1,   syllableTarget: 5,  syllableTolerance: 1, description: 'The earworm. Ultra-repetitive, memorable.' },
  'ad-lib':       { bars: 2,  linesPerBar: 1,   syllableTarget: 4,  syllableTolerance: 3, description: 'Vocal embellishments and call-outs.' },
  'custom':       { bars: 4,  linesPerBar: 1,   syllableTarget: 7,  syllableTolerance: 2, description: 'Custom section.' },
};

// ─── Lyrics-to-Section Mapping ──────────────────────────────────────
// Parse lyrics text and map each line to its arrangement section

export interface MappedLine {
  lineIndex: number;        // 0-based index in the lyrics text
  text: string;
  sectionId: string | null; // which section this line belongs to
  sectionType: SectionType | null;
  sectionLabel: string | null;
  isStructuralTag: boolean; // true if this line IS a [Section] tag
  isBlankLine: boolean;
  syllableCount: number;
  syllableTarget: number | null;
  syllableTolerance: number | null;
  isOverflow: boolean;      // true if this line exceeds the section's line capacity
  color: string | null;     // section color for gutter
  bgColor: string | null;   // section bg color for editor
}

/**
 * Parse a structural tag from a line of lyrics.
 * Matches patterns like [Verse 1], [Chorus], [Pre-Chorus], [INTRO 4], etc.
 * Returns the normalized section type and label, or null if not a tag.
 */
export function parseStructuralTag(line: string): {
  type: SectionType;
  label: string;
  barAnnotation?: number;
} | null {
  const trimmed = line.trim();
  const match = trimmed.match(/^\[(.+?)\]$/);
  if (!match) return null;

  const content = match[1].trim();

  // Check for bar annotation like [VERSE 1 8] or [PRE 4]
  const barMatch = content.match(/^(.+?)\s+(\d+)$/);
  const barAnnotation = barMatch ? parseInt(barMatch[2], 10) : undefined;
  const tagText = barMatch ? barMatch[1].trim() : content;

  const lower = tagText.toLowerCase();

  // Map common tag variations to our section types
  const typeMap: [RegExp, SectionType][] = [
    [/^intro/,                'intro'],
    [/^verse/,                'verse'],
    [/^pre[\s-]?chorus/,      'pre-chorus'],
    [/^chorus/,               'chorus'],
    [/^post[\s-]?chorus/,     'post-chorus'],
    [/^bridge/,               'bridge'],
    [/^breakdown/,            'breakdown'],
    [/^drop/,                 'drop'],
    [/^instrumental/,         'instrumental'],
    [/^solo/,                 'instrumental'],
    [/^interlude/,            'instrumental'],
    [/^outro/,                'outro'],
    [/^hook/,                 'hook'],
    [/^ad[\s-]?lib/,          'ad-lib'],
    [/^end/,                  'outro'],
    [/^fade\s?out/,           'outro'],
  ];

  for (const [pattern, type] of typeMap) {
    if (pattern.test(lower)) {
      return { type, label: tagText, barAnnotation };
    }
  }

  // Unknown tag — treat as custom
  return { type: 'custom', label: tagText, barAnnotation };
}

/**
 * Map lyrics to an arrangement template.
 * Each lyric line gets assigned to its current section (based on [Tags] in the text).
 * We compare against the template to detect overflow.
 */
export function mapLyricsToArrangement(
  lyrics: string,
  template: ArrangementTemplate | null,
  countSyllablesFn: (line: string) => number
): MappedLine[] {
  const lines = lyrics.split('\n');
  const result: MappedLine[] = [];

  let currentSectionIndex = -1;       // index into template.sections
  let currentSection: SectionDefinition | null = null;
  let linesInCurrentSection = 0;      // lyric lines written so far in this section
  let maxLinesForSection = 0;         // computed max based on bars × linesPerBar

  // Track which template sections we've seen (in order)
  let templateSectionPointer = 0;

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    const trimmed = text.trim();
    const isBlank = trimmed.length === 0;
    const tag = parseStructuralTag(trimmed);

    if (tag) {
      // This is a structural tag — advance to the matching template section
      if (template) {
        // Find the next matching section in the template from current pointer
        let found = false;
        for (let s = templateSectionPointer; s < template.sections.length; s++) {
          if (template.sections[s].type === tag.type) {
            currentSectionIndex = s;
            currentSection = template.sections[s];
            templateSectionPointer = s + 1;
            linesInCurrentSection = 0;
            maxLinesForSection = Math.ceil(currentSection.bars * currentSection.linesPerBar);
            found = true;
            break;
          }
        }
        // If no match found in remaining template, still track the tag
        if (!found) {
          currentSection = null;
          currentSectionIndex = -1;
          linesInCurrentSection = 0;
          maxLinesForSection = 0;
        }
      }

      result.push({
        lineIndex: i,
        text,
        sectionId: currentSection?.id || null,
        sectionType: tag.type,
        sectionLabel: tag.label,
        isStructuralTag: true,
        isBlankLine: false,
        syllableCount: 0,
        syllableTarget: null,
        syllableTolerance: null,
        isOverflow: false,
        color: SECTION_COLORS[tag.type] || null,
        bgColor: SECTION_BG_COLORS[tag.type] || null,
      });
      continue;
    }

    if (isBlank) {
      result.push({
        lineIndex: i,
        text,
        sectionId: currentSection?.id || null,
        sectionType: currentSection?.type || null,
        sectionLabel: currentSection?.label || null,
        isStructuralTag: false,
        isBlankLine: true,
        syllableCount: 0,
        syllableTarget: null,
        syllableTolerance: null,
        isOverflow: false,
        color: currentSection ? SECTION_COLORS[currentSection.type] : null,
        bgColor: currentSection ? SECTION_BG_COLORS[currentSection.type] : null,
      });
      continue;
    }

    // This is a lyric line
    const syllableCount = countSyllablesFn(trimmed);
    linesInCurrentSection++;

    const isOverflow = currentSection
      ? linesInCurrentSection > maxLinesForSection && maxLinesForSection > 0
      : false;

    result.push({
      lineIndex: i,
      text,
      sectionId: currentSection?.id || null,
      sectionType: currentSection?.type || null,
      sectionLabel: currentSection?.label || null,
      isStructuralTag: false,
      isBlankLine: false,
      syllableCount,
      syllableTarget: currentSection?.syllableTarget || null,
      syllableTolerance: currentSection?.syllableTolerance || null,
      isOverflow,
      color: currentSection ? SECTION_COLORS[currentSection.type] : null,
      bgColor: currentSection ? SECTION_BG_COLORS[currentSection.type] : null,
    });
  }

  return result;
}

// ─── Arrangement Stats ──────────────────────────────────────────────

export interface ArrangementStats {
  totalBars: number;
  estimatedDurationSec: number; // at template BPM
  sectionBreakdown: {
    sectionId: string;
    label: string;
    type: SectionType;
    bars: number;
    targetLines: number;
    actualLines: number;
    overflowLines: number;
    status: 'empty' | 'under' | 'good' | 'over';
  }[];
}

export function computeArrangementStats(
  mappedLines: MappedLine[],
  template: ArrangementTemplate
): ArrangementStats {
  const totalBars = template.sections.reduce((sum, s) => sum + s.bars, 0);
  // 4/4 time: 1 bar = 4 beats. Duration = (totalBars * 4) / BPM * 60
  const beatsPerMinute = template.bpm || 120;
  const estimatedDurationSec = (totalBars * 4 * 60) / beatsPerMinute;

  const sectionBreakdown = template.sections.map(section => {
    const sectionLines = mappedLines.filter(
      l => l.sectionId === section.id && !l.isStructuralTag && !l.isBlankLine
    );
    const targetLines = Math.ceil(section.bars * section.linesPerBar);
    const actualLines = sectionLines.length;
    const overflowLines = sectionLines.filter(l => l.isOverflow).length;

    let status: 'empty' | 'under' | 'good' | 'over' = 'good';
    if (actualLines === 0) status = 'empty';
    else if (actualLines < targetLines) status = 'under';
    else if (overflowLines > 0) status = 'over';

    return {
      sectionId: section.id,
      label: section.label,
      type: section.type,
      bars: section.bars,
      targetLines,
      actualLines,
      overflowLines,
      status,
    };
  });

  return { totalBars, estimatedDurationSec, sectionBreakdown };
}

// ─── Suno Export with Bar Annotations ───────────────────────────────

export function exportForSuno(
  lyrics: string,
  template: ArrangementTemplate | null,
  stylePrompt: string,
  includeBarAnnotations: boolean = true
): string {
  if (!template) {
    return `STYLE OF MUSIC:\n${stylePrompt}\n\nCUSTOM LYRICS:\n${lyrics}`;
  }

  // Rebuild lyrics with bar-annotated tags
  const lines = lyrics.split('\n');
  const output: string[] = [];

  for (const line of lines) {
    const tag = parseStructuralTag(line.trim());
    if (tag && includeBarAnnotations) {
      // Find matching template section for bar count
      const matchingSection = template.sections.find(s => s.type === tag.type);
      if (matchingSection) {
        output.push(`[${tag.label} ${matchingSection.bars}]`);
      } else {
        output.push(line);
      }
    } else {
      output.push(line);
    }
  }

  return `STYLE OF MUSIC:\n${stylePrompt}\n\nCUSTOM LYRICS:\n${output.join('\n')}`;
}

// ─── Version History ────────────────────────────────────────────────

export interface LyricSnapshot {
  id: string;
  timestamp: number;
  label: string;           // user-provided or auto-generated
  lyrics: string;
  stylePrompt: string;
  templateId: string | null;
}

export function createSnapshot(
  lyrics: string,
  stylePrompt: string,
  templateId: string | null,
  label?: string
): LyricSnapshot {
  return {
    id: `snap_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    timestamp: Date.now(),
    label: label || `Snapshot ${new Date().toLocaleString()}`,
    lyrics,
    stylePrompt,
    templateId,
  };
}

// ─── Default Bar-Aware Templates ────────────────────────────────────

export const BAR_TEMPLATES: Record<string, ArrangementTemplate> = {
  'prog-house-v2': {
    id: 'prog-house-v2',
    name: 'Progressive House',
    genre: 'EDM',
    bpm: 128,
    description: 'Builds energy through filter automation rather than lyric density. Sparse pockets with 4-8 syllable phrases.',
    defaultStylePrompt: 'Progressive house, 128 BPM, euphoric synth leads, driving bassline, emotional female vocals, festival anthem, build and drop',
    sections: [
      createSection('intro', 'Intro', { bars: 4, linesPerBar: 0, syllableTarget: 0, description: 'Instrumental build. No lyrics.' }),
      createSection('verse', 'Verse 1', { bars: 8, linesPerBar: 1, syllableTarget: 8, description: 'Sparse, atmospheric. Let the groove breathe.' }),
      createSection('pre-chorus', 'Pre-Chorus', { bars: 4, linesPerBar: 1, syllableTarget: 7, description: 'Energy ramp. Building filter sweep.' }),
      createSection('chorus', 'Chorus', { bars: 8, linesPerBar: 1, syllableTarget: 6, syllableTolerance: 1, description: 'Hook. Short, euphoric, repetitive.' }),
      createSection('breakdown', 'Breakdown', { bars: 8, linesPerBar: 0.5, syllableTarget: 6, description: 'Strip back. Emotional core.' }),
      createSection('drop', 'Drop', { bars: 8, linesPerBar: 0.25, syllableTarget: 4, description: 'Minimal vocals. Let production hit.' }),
      createSection('verse', 'Verse 2', { bars: 8, linesPerBar: 1, syllableTarget: 8, description: 'Same pocket as V1, new story.' }),
      createSection('chorus', 'Final Chorus', { bars: 8, linesPerBar: 1, syllableTarget: 6, syllableTolerance: 1, description: 'Same hook, bigger production.' }),
      createSection('outro', 'Outro', { bars: 4, linesPerBar: 0.5, syllableTarget: 6, description: 'Fade or resolve.' }),
    ],
  },

  'modern-pop-v2': {
    id: 'modern-pop-v2',
    name: 'Modern Pop',
    genre: 'Pop',
    bpm: 110,
    description: 'Max Martin style melodic math. Highly structured, repetitive hooks, tight syllable mirroring.',
    defaultStylePrompt: 'Modern pop, 110 BPM, punchy drums, clean synth bass, breathy close-mic vocals, polished production, radio hit',
    sections: [
      createSection('verse', 'Verse 1', { bars: 8, linesPerBar: 1, syllableTarget: 8, description: 'Set the scene. Conversational tone.' }),
      createSection('pre-chorus', 'Pre-Chorus', { bars: 4, linesPerBar: 1, syllableTarget: 7, description: 'Lift toward the hook. Rising energy.' }),
      createSection('chorus', 'Chorus', { bars: 8, linesPerBar: 1, syllableTarget: 7, syllableTolerance: 1, description: 'THE hook. Mirror syllables line-to-line.' }),
      createSection('verse', 'Verse 2', { bars: 8, linesPerBar: 1, syllableTarget: 8, description: 'Deepen the story. Same groove, new words.' }),
      createSection('pre-chorus', 'Pre-Chorus', { bars: 4, linesPerBar: 1, syllableTarget: 7, description: 'Same lift, slight variation ok.' }),
      createSection('chorus', 'Chorus', { bars: 8, linesPerBar: 1, syllableTarget: 7, syllableTolerance: 1, description: 'Repeat the hook. Identical or near-identical.' }),
      createSection('bridge', 'Bridge', { bars: 8, linesPerBar: 1, syllableTarget: 8, description: 'Contrast. New melody, new perspective.' }),
      createSection('chorus', 'Final Chorus', { bars: 8, linesPerBar: 1, syllableTarget: 7, syllableTolerance: 1, description: 'Big finish. Double chorus or ad-libs.' }),
      createSection('outro', 'Outro', { bars: 4, linesPerBar: 0.5, syllableTarget: 5, description: 'Resolve or tag the hook.' }),
    ],
  },

  'country-v2': {
    id: 'country-v2',
    name: 'Modern Country',
    genre: 'Country',
    bpm: 90,
    description: 'Storytelling-forward. Denser syllable pockets in verses, opening up for anthemic, resolved choruses.',
    defaultStylePrompt: 'Modern country, 90 BPM, acoustic guitar, subtle pedal steel, storytelling male vocals, organic drums, radio friendly',
    sections: [
      createSection('intro', 'Intro', { bars: 4, linesPerBar: 0, syllableTarget: 0, description: 'Guitar or fiddle intro.' }),
      createSection('verse', 'Verse 1', { bars: 8, linesPerBar: 1, syllableTarget: 9, description: 'Paint the picture. Story-first, specific details.' }),
      createSection('chorus', 'Chorus', { bars: 8, linesPerBar: 1, syllableTarget: 8, description: 'Anthemic resolve. Title drop here.' }),
      createSection('verse', 'Verse 2', { bars: 8, linesPerBar: 1, syllableTarget: 9, description: 'Advance the story. Higher stakes.' }),
      createSection('chorus', 'Chorus', { bars: 8, linesPerBar: 1, syllableTarget: 8, description: 'Same hook, deeper meaning.' }),
      createSection('bridge', 'Bridge', { bars: 8, linesPerBar: 1, syllableTarget: 8, description: 'Twist or reveal. Emotional peak.' }),
      createSection('chorus', 'Final Chorus', { bars: 8, linesPerBar: 1, syllableTarget: 8, description: 'Resolve. Callback to title.' }),
      createSection('outro', 'Outro', { bars: 4, linesPerBar: 0.5, syllableTarget: 6, description: 'Tag line or instrumental fade.' }),
    ],
  },

  'synth-pop-v2': {
    id: 'synth-pop-v2',
    name: 'Synth Pop',
    genre: 'Pop',
    bpm: 120,
    description: '80s revival. Driving rhythm, symmetrical phrasing, often uses AABB or ABAB rhyme schemes.',
    defaultStylePrompt: 'Retro-futuristic synth pop, 120 BPM, four-on-the-floor, 80s arpeggiated bassline, vocoder harmonies, crisp modern production',
    sections: [
      createSection('intro', 'Intro', { bars: 4, linesPerBar: 0, syllableTarget: 0, description: 'Arpeggio + kick intro.' }),
      createSection('verse', 'Verse 1', { bars: 8, linesPerBar: 1, syllableTarget: 8, description: 'Driving rhythm, tight phrasing.' }),
      createSection('chorus', 'Chorus', { bars: 8, linesPerBar: 1, syllableTarget: 8, syllableTolerance: 1, description: 'Anthemic, symmetrical, singable.' }),
      createSection('verse', 'Verse 2', { bars: 8, linesPerBar: 1, syllableTarget: 8, description: 'Mirror V1 pocket. New words.' }),
      createSection('chorus', 'Chorus', { bars: 8, linesPerBar: 1, syllableTarget: 8, syllableTolerance: 1, description: 'Same hook.' }),
      createSection('bridge', 'Bridge', { bars: 8, linesPerBar: 1, syllableTarget: 7, description: 'Break the pattern. Half-time feel.' }),
      createSection('chorus', 'Final Chorus', { bars: 8, linesPerBar: 1, syllableTarget: 8, syllableTolerance: 1, description: 'Double chorus or key change.' }),
      createSection('outro', 'Outro', { bars: 4, linesPerBar: 0.5, syllableTarget: 4, description: 'Arp fade.' }),
    ],
  },

  'deep-house-v2': {
    id: 'deep-house-v2',
    name: 'Deep House',
    genre: 'EDM',
    bpm: 122,
    description: 'Groove-forward, minimal vocal. Very sparse pockets, lots of space between phrases.',
    defaultStylePrompt: 'Deep house, 122 BPM, minimal groove, sub bass, sparse soulful vocal chops, atmospheric pads, club mix',
    sections: [
      createSection('intro', 'Intro', { bars: 8, linesPerBar: 0, syllableTarget: 0, description: 'Build the groove. No vocals.' }),
      createSection('verse', 'Verse 1', { bars: 8, linesPerBar: 0.5, syllableTarget: 6, description: 'Sparse. Let the groove lead.' }),
      createSection('chorus', 'Chorus', { bars: 8, linesPerBar: 0.5, syllableTarget: 5, syllableTolerance: 1, description: 'Soulful hook. Short, repeated.' }),
      createSection('breakdown', 'Breakdown', { bars: 8, linesPerBar: 0.25, syllableTarget: 6, description: 'Strip to pads + vocal.' }),
      createSection('drop', 'Drop', { bars: 8, linesPerBar: 0.25, syllableTarget: 4, description: 'Groove returns. Minimal vocal.' }),
      createSection('verse', 'Verse 2', { bars: 8, linesPerBar: 0.5, syllableTarget: 6, description: 'Same pocket, different words.' }),
      createSection('chorus', 'Final Chorus', { bars: 8, linesPerBar: 0.5, syllableTarget: 5, syllableTolerance: 1, description: 'Hook reprise.' }),
      createSection('outro', 'Outro', { bars: 8, linesPerBar: 0, syllableTarget: 0, description: 'Strip out. DJ-friendly.' }),
    ],
  },

  'tropical-pop-v2': {
    id: 'tropical-pop-v2',
    name: 'Tropical Pop (Wordy)',
    genre: 'Pop',
    bpm: 105,
    description: 'Dense, syncopated verses with an offbeat rhythm. Often uses vocal delays to extend phrases across bars.',
    defaultStylePrompt: 'Tropical pop, dancehall influence, 105 BPM, syncopated marimba, heavy sub bass, wordy offbeat female vocals, Rihanna style',
    sections: [
      createSection('verse', 'Verse 1', { bars: 8, linesPerBar: 1.5, syllableTarget: 11, description: 'Dense and syncopated. Offbeat flow.' }),
      createSection('pre-chorus', 'Pre-Chorus', { bars: 4, linesPerBar: 1, syllableTarget: 8, description: 'Settle the rhythm into the hook.' }),
      createSection('chorus', 'Chorus', { bars: 8, linesPerBar: 1, syllableTarget: 6, syllableTolerance: 1, description: 'Punchy. Contrast the wordy verses.' }),
      createSection('verse', 'Verse 2', { bars: 8, linesPerBar: 1.5, syllableTarget: 11, description: 'Same dense pocket, new story.' }),
      createSection('pre-chorus', 'Pre-Chorus', { bars: 4, linesPerBar: 1, syllableTarget: 8, description: 'Same settle.' }),
      createSection('chorus', 'Chorus', { bars: 8, linesPerBar: 1, syllableTarget: 6, syllableTolerance: 1, description: 'Same hook.' }),
      createSection('bridge', 'Bridge', { bars: 8, linesPerBar: 1, syllableTarget: 9, description: 'Half-time feel. Emotional turn.' }),
      createSection('chorus', 'Final Chorus', { bars: 8, linesPerBar: 1, syllableTarget: 6, syllableTolerance: 1, description: 'Hook out.' }),
    ],
  },

  'hip-hop-v2': {
    id: 'hip-hop-v2',
    name: 'Hip Hop / Rap',
    genre: 'Hip Hop',
    bpm: 85,
    description: 'Bar-for-bar writing. 1 line = 1 bar. Dense syllables, internal rhyme, rhythmic precision.',
    defaultStylePrompt: 'Hip hop, 85 BPM, boom bap drums, heavy 808, confident male rap vocals, cinematic strings, dark and melodic',
    sections: [
      createSection('intro', 'Intro', { bars: 4, linesPerBar: 1, syllableTarget: 10, description: 'Set the tone. Spoken or half-sung.' }),
      createSection('verse', 'Verse 1', { bars: 16, linesPerBar: 1, syllableTarget: 12, syllableTolerance: 3, description: '16 bars. Dense. Internal rhyme. Every bar counts.' }),
      createSection('chorus', 'Hook', { bars: 8, linesPerBar: 1, syllableTarget: 8, description: 'Melodic hook. Simpler than verses.' }),
      createSection('verse', 'Verse 2', { bars: 16, linesPerBar: 1, syllableTarget: 12, syllableTolerance: 3, description: '16 bars. Raise the stakes.' }),
      createSection('chorus', 'Hook', { bars: 8, linesPerBar: 1, syllableTarget: 8, description: 'Same hook.' }),
      createSection('bridge', 'Bridge', { bars: 8, linesPerBar: 1, syllableTarget: 10, description: 'Switch flow. Double-time or melodic.' }),
      createSection('chorus', 'Hook (Out)', { bars: 8, linesPerBar: 1, syllableTarget: 8, description: 'Ride out. Ad-libs over hook.' }),
    ],
  },
};

// ─── Migration from old flat templates ──────────────────────────────

/**
 * Convert an old-format template (flat pocketMap) into a minimal
 * ArrangementTemplate. This is lossy — we can't infer sections from
 * a flat list — but it keeps the syllable targets usable.
 */
export function migrateOldTemplate(old: {
  id: string;
  name: string;
  genre: string;
  defaultStylePrompt: string;
  description: string;
  pocketMap: Record<number, number>;
}): ArrangementTemplate {
  // Best-effort: treat every 4 lines as a section
  const entries = Object.entries(old.pocketMap).map(([k, v]) => [parseInt(k), v] as [number, number]);
  entries.sort((a, b) => a[0] - b[0]);

  const sections: SectionDefinition[] = [];
  const chunkSize = 4;

  for (let i = 0; i < entries.length; i += chunkSize) {
    const chunk = entries.slice(i, i + chunkSize);
    const avgSyllables = Math.round(chunk.reduce((s, [, v]) => s + v, 0) / chunk.length);
    const sectionIndex = Math.floor(i / chunkSize);
    const type: SectionType = sectionIndex === 0 ? 'verse' : sectionIndex === 1 ? 'chorus' : 'verse';
    const label = sectionIndex === 0 ? 'Verse' : sectionIndex === 1 ? 'Chorus' : `Section ${sectionIndex + 1}`;

    sections.push(
      createSection(type, label, {
        bars: chunk.length * 2, // rough estimate: 2 bars per line
        linesPerBar: 0.5,
        syllableTarget: avgSyllables,
      })
    );
  }

  return {
    id: old.id + '-v2',
    name: old.name,
    genre: old.genre,
    bpm: 120, // unknown from old format
    description: old.description,
    defaultStylePrompt: old.defaultStylePrompt,
    sections,
  };
}

// ─── Rhyme Scheme Detection ─────────────────────────────────────────
// Analyze end-words within a section to detect rhyme patterns

export type RhymePattern = 'AABB' | 'ABAB' | 'ABCB' | 'ABBA' | 'AAAA' | 'FREE' | 'UNKNOWN';

export interface RhymeAnalysis {
  sectionId: string;
  sectionLabel: string;
  pattern: RhymePattern;
  lineRhymeGroups: { lineIndex: number; group: string; endWord: string; rhymeType?: RhymeType }[];
}

/**
 * Get the last word of a line, cleaned of punctuation.
 */
function getEndWord(line: string): string {
  const words = line.trim().split(/\s+/);
  const last = words[words.length - 1] || '';
  return last.replace(/[^a-zA-Z]/g, '').toLowerCase();
}

/**
 * Rhyme type classification.
 */
export type RhymeType = 'perfect' | 'family' | 'slant' | 'assonance' | 'none';

export interface RhymeResult {
  isRhyme: boolean;
  type: RhymeType;
}

// ─── Phonetic family maps (Pat Pattison framework) ──────────────────
// Consonants in the same family count as rhyming

const PHONETIC_FAMILIES: string[][] = [
  // Plosives: voiced / unvoiced pairs
  ['b', 'p'], ['d', 't'], ['g', 'k'],
  // Fricatives: voiced / unvoiced pairs
  ['v', 'f'], ['z', 's'],
  // Nasals
  ['m', 'n'],
];

function getPhoneticFamily(char: string): number {
  for (let i = 0; i < PHONETIC_FAMILIES.length; i++) {
    if (PHONETIC_FAMILIES[i].includes(char)) return i;
  }
  return -1;
}

function consonantsInSameFamily(c1: string, c2: string): boolean {
  if (c1 === c2) return true;
  const f1 = getPhoneticFamily(c1);
  const f2 = getPhoneticFamily(c2);
  return f1 >= 0 && f1 === f2;
}

/**
 * Extract vowels from a word.
 */
function extractVowels(word: string): string {
  return word.replace(/[^aeiou]/g, '');
}

/**
 * Extract trailing consonant cluster from a word.
 */
function trailingConsonants(word: string): string {
  const match = word.match(/[^aeiou]+$/);
  return match ? match[0] : '';
}

/**
 * Advanced rhyme check with type classification.
 * Returns both whether words rhyme and what type of rhyme it is.
 *
 * Checks in order of strength:
 * 1. Perfect rhyme: shared suffix of 2+ chars including vowel+consonant
 * 2. Multi-syllable rhyme: last 2-3 syllables match
 * 3. Family rhyme: same vowel sound + consonants in same phonetic family
 * 4. Slant/assonance: shared vowel patterns
 */
export function simpleRhymeCheck(word1: string, word2: string): boolean {
  return checkRhyme(word1, word2).isRhyme;
}

export function checkRhyme(word1: string, word2: string): RhymeResult {
  if (!word1 || !word2) return { isRhyme: false, type: 'none' };

  const w1 = word1.toLowerCase().replace(/[^a-z]/g, '');
  const w2 = word2.toLowerCase().replace(/[^a-z]/g, '');

  if (!w1 || !w2) return { isRhyme: false, type: 'none' };
  if (w1 === w2) return { isRhyme: true, type: 'perfect' };

  // 1. Perfect rhyme: check shared suffixes from longest to shortest
  const maxSuffix = Math.min(w1.length, w2.length);
  let sharedSuffixLen = 0;
  for (let i = 1; i <= maxSuffix; i++) {
    if (w1.slice(-i) === w2.slice(-i)) {
      sharedSuffixLen = i;
    } else {
      break;
    }
  }

  // Perfect rhyme: shared suffix of 2+ chars that contains at least one vowel
  if (sharedSuffixLen >= 2) {
    const suffix = w1.slice(-sharedSuffixLen);
    const hasVowel = /[aeiou]/.test(suffix);
    if (hasVowel) {
      return { isRhyme: true, type: 'perfect' };
    }
  }

  // 2. Multi-syllable rhyme: check if last 2+ syllable chunks match
  // Split into rough syllable chunks by vowel groups
  const syllableChunks = (w: string): string[] => {
    const chunks: string[] = [];
    let current = '';
    let lastWasVowel = false;
    for (const ch of w) {
      const isVowel = 'aeiou'.includes(ch);
      if (isVowel && !lastWasVowel && current.length > 0) {
        // Start of new syllable
        chunks.push(current);
        current = ch;
      } else {
        current += ch;
      }
      lastWasVowel = isVowel;
    }
    if (current) chunks.push(current);
    return chunks;
  };

  const chunks1 = syllableChunks(w1);
  const chunks2 = syllableChunks(w2);

  // Compare last N syllable chunks
  if (chunks1.length >= 2 && chunks2.length >= 2) {
    const last2_1 = chunks1.slice(-2).join('');
    const last2_2 = chunks2.slice(-2).join('');
    if (last2_1 === last2_2) {
      return { isRhyme: true, type: 'perfect' };
    }
  }

  // 3. Family rhyme: same stressed vowel + consonants in same phonetic family
  const vowels1 = extractVowels(w1);
  const vowels2 = extractVowels(w2);
  const trail1 = trailingConsonants(w1);
  const trail2 = trailingConsonants(w2);

  // Check if trailing consonants are in the same phonetic family
  if (vowels1.length >= 1 && vowels2.length >= 1) {
    const lastVowel1 = vowels1.slice(-1);
    const lastVowel2 = vowels2.slice(-1);
    const sameLastVowel = lastVowel1 === lastVowel2;

    // Family rhyme: same last vowel + trailing consonants in same family
    if (sameLastVowel && trail1.length > 0 && trail2.length > 0) {
      // Check if the last consonant of each is in the same family
      const lastC1 = trail1.slice(-1);
      const lastC2 = trail2.slice(-1);
      if (consonantsInSameFamily(lastC1, lastC2)) {
        return { isRhyme: true, type: 'family' };
      }
    }

    // Also check: if trailing consonants match but vowels are in same family
    if (trail1 === trail2 && trail1.length > 0) {
      // Same ending consonants = strong slant rhyme
      return { isRhyme: true, type: 'slant' };
    }
  }

  // 4. Assonance: shared last 2 vowel sounds
  if (vowels1.length >= 2 && vowels2.length >= 2) {
    if (vowels1.slice(-2) === vowels2.slice(-2)) {
      return { isRhyme: true, type: 'assonance' };
    }
  }

  // 5. Slant rhyme: last vowel matches + at least some consonant similarity
  if (vowels1.length >= 1 && vowels2.length >= 1) {
    const lastVowel1 = vowels1.slice(-1);
    const lastVowel2 = vowels2.slice(-1);
    if (lastVowel1 === lastVowel2 && trail1.length > 0 && trail2.length > 0) {
      return { isRhyme: true, type: 'slant' };
    }
  }

  return { isRhyme: false, type: 'none' };
}

/**
 * Analyze rhyme scheme for lyric lines within a section.
 * Assigns letter groups (A, B, C...) to rhyming end-words.
 */
export function analyzeRhymeScheme(lines: string[]): {
  pattern: RhymePattern;
  groups: { lineIndex: number; group: string; endWord: string; rhymeType?: RhymeType }[];
} {
  const endWords = lines.map(getEndWord);
  const groups: { lineIndex: number; group: string; endWord: string; rhymeType?: RhymeType }[] = [];

  let nextGroup = 'A';
  const wordToGroup: Record<string, string> = {};

  for (let i = 0; i < endWords.length; i++) {
    const word = endWords[i];
    if (!word) {
      groups.push({ lineIndex: i, group: '-', endWord: '' });
      continue;
    }

    // Check if this word rhymes with any previously seen word
    let foundGroup: string | null = null;
    let bestRhymeType: RhymeType = 'none';
    for (const [prevWord, group] of Object.entries(wordToGroup)) {
      const result = checkRhyme(word, prevWord);
      if (result.isRhyme) {
        foundGroup = group;
        bestRhymeType = result.type;
        // Prefer perfect rhymes over weaker types
        if (result.type === 'perfect') break;
      }
    }

    if (foundGroup) {
      groups.push({ lineIndex: i, group: foundGroup, endWord: word, rhymeType: bestRhymeType });
      wordToGroup[word] = foundGroup;
    } else {
      groups.push({ lineIndex: i, group: nextGroup, endWord: word, rhymeType: 'none' });
      wordToGroup[word] = nextGroup;
      nextGroup = String.fromCharCode(nextGroup.charCodeAt(0) + 1);
    }
  }

  // Detect known patterns from the first 4 lines
  const pattern4 = groups.slice(0, 4).map(g => g.group).join('');
  let pattern: RhymePattern = 'FREE';
  
  if (pattern4 === 'AABB' || pattern4 === 'CCDD' || pattern4 === 'EEFF') pattern = 'AABB';
  else if (pattern4 === 'ABAB' || pattern4 === 'CDCD' || pattern4 === 'EFEF') pattern = 'ABAB';
  else if (pattern4 === 'ABCB' || pattern4 === 'CDED' || pattern4 === 'EFEG') pattern = 'ABCB'; // EFEG is not quite right, but ABCB is typical
  else if (pattern4 === 'ABBA' || pattern4 === 'CDDC' || pattern4 === 'EFFE') pattern = 'ABBA';
  else if (pattern4 === 'AAAA' || pattern4 === 'BBBB' || pattern4 === 'CCCC') pattern = 'AAAA';
  else if (groups.length < 4) pattern = 'UNKNOWN';

  // If the first 4 lines are FREE, but the whole thing has some structure, we could detect it,
  // but for now we'll just return the pattern of the first 4 lines.
  
  // Let's normalize the pattern string for the whole section if we want to be fancy,
  // but returning the 4-line base pattern is standard.
  
  return { pattern, groups };
}

/**
 * songAnalysis.ts — Deep lyric analysis engine.
 *
 * Research-backed rules from Pat Pattison, Max Martin, Ryan Tedder, Nashville.
 * Analyzes lyrics for structural issues, consistency problems,
 * redundancy, rhyme patterns, section identity violations, telling-vs-showing,
 * AI slop detection, syllable mirroring, and completeness.
 */

import { parseStructuralTag, analyzeRhymeScheme, simpleRhymeCheck, SectionType } from './arrangement';
import { countLineSyllables } from './syllables';
import {
  AI_SLOP_MARKERS,
  COSMIC_WORDS,
  PREDICTABLE_RHYME_PAIRS,
  PREDICTABLE_RESOLUTIONS,
  DIRECT_EMOTIONS,
  STATE_OF_BEING_VERBS,
  SENSORY_WORDS,
  CONCRETE_NOUNS,
  FILLER_WORDS,
} from './cliches';

// ─── Types ──────────────────────────────────────────────────────────

export type IssueSeverity = 'error' | 'warning' | 'suggestion' | 'info';

export interface AnalysisIssue {
  id: string;
  category: AnalysisCategory;
  severity: IssueSeverity;
  title: string;
  description: string;
  sectionLabel?: string;
  lines?: number[];
  context?: AnalysisContext;
}

export type AnalysisCategory =
  | 'chorus-consistency'
  | 'rhyme-pattern'
  | 'echo-tail'
  | 'redundancy'
  | 'section-identity'
  | 'version-conflict'
  | 'completeness'
  | 'telling-vs-showing'
  | 'ai-slop'
  | 'syllable-mirroring'
  | 'craft';

export interface AnalysisContext {
  sectionLyrics?: string;
  sectionType?: string;
  sectionLabel?: string;
  rhymeScheme?: string;
  syllableCounts?: number[];
  versionsA?: string;
  versionsB?: string;
  diffLines?: { lineNum: number; a: string; b: string }[];
}

// ─── Parsed Section ─────────────────────────────────────────────────

interface ParsedSection {
  type: SectionType;
  label: string;
  tagLine: number;
  lines: { text: string; lineNum: number }[];
}

function parseSections(lyrics: string): ParsedSection[] {
  const allLines = lyrics.split('\n');
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;

  for (let i = 0; i < allLines.length; i++) {
    const raw = allLines[i];
    const trimmed = raw.trim();
    const tag = parseStructuralTag(trimmed);

    if (tag) {
      current = { type: tag.type, label: tag.label, tagLine: i + 1, lines: [] };
      sections.push(current);
      continue;
    }

    if (current && trimmed.length > 0) {
      current.lines.push({ text: trimmed, lineNum: i + 1 });
    }
  }

  return sections;
}

// ─── Helpers ────────────────────────────────────────────────────────

function isEchoTail(line: string): { isEcho: boolean; cleanLine: string; echoText: string } {
  const match = line.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (!match) return { isEcho: false, cleanLine: line, echoText: '' };

  const mainText = match[1].trim();
  const parenText = match[2].trim().toLowerCase();
  const mainLower = mainText.toLowerCase();
  const mainWords = mainLower.split(/\s+/);
  const lastWord = mainWords[mainWords.length - 1] || '';

  if (mainLower.endsWith(parenText)) return { isEcho: true, cleanLine: mainText, echoText: parenText };
  if (lastWord.length > 3 && lastWord.endsWith(parenText)) return { isEcho: true, cleanLine: mainText, echoText: parenText };
  if (parenText.length > 2 && lastWord.endsWith(parenText)) return { isEcho: true, cleanLine: mainText, echoText: parenText };

  const parenWords = parenText.split(/\s+/);
  const mainWordSet = new Set(mainWords);
  const overlapCount = parenWords.filter(w => mainWordSet.has(w)).length;
  if (parenWords.length > 0 && overlapCount / parenWords.length >= 0.5) {
    return { isEcho: true, cleanLine: mainText, echoText: parenText };
  }

  return { isEcho: false, cleanLine: line, echoText: '' };
}

function cleanLyricLine(text: string): string {
  const { isEcho, cleanLine } = isEchoTail(text);
  return isEcho ? cleanLine : text;
}

function getSignificantWords(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'is', 'it', 'my', 'me', 'we', 'us', 'our', 'you',
    'your', 'i', 'so', 'up', 'out', 'all', 'just', 'like', 'get', 'got',
    'be', 'been', 'am', 'are', 'was', 'were', 'do', 'did', 'this', 'that',
    'no', 'not', "don't", "won't", "can't", 'yeah', 'oh', 'na',
  ]);
  return text.toLowerCase().replace(/[^a-z\s']/g, '').split(/\s+/)
    .filter(w => w.length > 1 && !stopWords.has(w));
}

function wordOverlap(a: string, b: string): number {
  const wordsA = getSignificantWords(a);
  const wordsB = getSignificantWords(b);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  const setB = new Set(wordsB);
  const overlap = wordsA.filter(w => setB.has(w)).length;
  return overlap / Math.max(wordsA.length, wordsB.length);
}

function getAllWords(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z\s']/g, '').split(/\s+/).filter(w => w.length > 0);
}

let _issueId = 0;
function nextId(): string { return `issue_${++_issueId}`; }

interface SectionStats {
  section: ParsedSection;
  avgSyllables: number;
  lineCount: number;
  words: string[];
  syllables: number[];
}

function computeSectionStats(sections: ParsedSection[]): SectionStats[] {
  return sections.map(sec => {
    const cleanLines = sec.lines.map(l => cleanLyricLine(l.text));
    const syllables = cleanLines.map(countLineSyllables);
    const avgSyllables = syllables.length > 0
      ? syllables.reduce((s, v) => s + v, 0) / syllables.length : 0;
    const words = getSignificantWords(cleanLines.join(' '));
    return { section: sec, avgSyllables, lineCount: cleanLines.length, words, syllables };
  });
}

// ─── 1. Chorus Consistency ──────────────────────────────────────────

function checkChorusConsistency(sections: ParsedSection[]): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];
  const byType = new Map<SectionType, ParsedSection[]>();
  for (const sec of sections) {
    const group = byType.get(sec.type) || [];
    group.push(sec);
    byType.set(sec.type, group);
  }

  for (const [type, group] of byType) {
    if (group.length < 2 || (type !== 'chorus' && type !== 'hook')) continue;
    const reference = group[0];
    for (let g = 1; g < group.length; g++) {
      const compare = group[g];
      const refLines = reference.lines.map(l => cleanLyricLine(l.text));
      const cmpLines = compare.lines.map(l => cleanLyricLine(l.text));
      const diffLines: { lineNum: number; a: string; b: string }[] = [];
      const maxLen = Math.max(refLines.length, cmpLines.length);
      for (let i = 0; i < maxLen; i++) {
        const a = refLines[i] || '(missing)';
        const b = cmpLines[i] || '(missing)';
        if (a.toLowerCase() !== b.toLowerCase()) diffLines.push({ lineNum: i + 1, a, b });
      }
      if (diffLines.length > 0) {
        const diffDesc = diffLines.map(d =>
          `  Line ${d.lineNum}:\n    "${reference.label}": ${d.a}\n    "${compare.label}": ${d.b}`
        ).join('\n');
        issues.push({
          id: nextId(), category: 'chorus-consistency', severity: 'warning',
          title: `${reference.label} and ${compare.label} differ`,
          description: `${diffLines.length} line${diffLines.length > 1 ? 's' : ''} differ:\n${diffDesc}`,
          sectionLabel: compare.label,
          lines: [
            ...diffLines.map(d => reference.lines[d.lineNum - 1]?.lineNum).filter(Boolean),
            ...diffLines.map(d => compare.lines[d.lineNum - 1]?.lineNum).filter(Boolean),
          ] as number[],
          context: {
            versionsA: reference.lines.map(l => l.text).join('\n'),
            versionsB: compare.lines.map(l => l.text).join('\n'),
            sectionLabel: `${reference.label} vs ${compare.label}`,
            sectionType: type, diffLines,
          },
        });
      }
    }
  }
  return issues;
}

// ─── 2. Rhyme Patterns ──────────────────────────────────────────────

function checkRhymePatterns(sections: ParsedSection[]): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];

  for (const section of sections) {
    const lyricLines = section.lines.map(l => cleanLyricLine(l.text));
    if (lyricLines.length < 3) continue;
    const { pattern, groups } = analyzeRhymeScheme(lyricLines);

    // Rhyme chain break detection
    let chainStart = 0;
    let chainGroup = groups[0]?.group || '-';
    for (let i = 1; i <= groups.length; i++) {
      const currentGroup = i < groups.length ? groups[i].group : '__END__';
      if (currentGroup !== chainGroup || i === groups.length) {
        const chainLen = i - chainStart;
        if (chainLen >= 3 && i < groups.length) {
          const remainingLines = groups.length - i;
          const isAtSectionEnd = remainingLines <= 2;
          issues.push({
            id: nextId(), category: 'rhyme-pattern',
            severity: isAtSectionEnd ? 'info' : 'suggestion',
            title: isAtSectionEnd
              ? `Possible cadence shift in ${section.label}`
              : `Broken rhyme chain in ${section.label}`,
            description: isAtSectionEnd
              ? `Lines ${chainStart + 1}-${i} rhyme on "${groups[chainStart].endWord}" pattern, then break away. This looks like an intentional cadence shift.`
              : `Lines ${chainStart + 1}-${i} establish a "${groups[chainStart].endWord}" rhyme pattern, but line ${i + 1} ("${groups[i]?.endWord}") breaks it mid-section.`,
            sectionLabel: section.label,
            lines: [section.lines[i]?.lineNum].filter(Boolean) as number[],
            context: {
              sectionLyrics: lyricLines.join('\n'), sectionType: section.type,
              sectionLabel: section.label, rhymeScheme: groups.map(g => g.group).join(''),
            },
          });
        }
        chainStart = i;
        chainGroup = currentGroup;
      }
    }

    // Predictable rhyme pair detection
    const endWords = groups.map(g => g.endWord.toLowerCase()).filter(Boolean);
    for (const [a, b] of PREDICTABLE_RHYME_PAIRS) {
      if (endWords.includes(a) && endWords.includes(b)) {
        issues.push({
          id: nextId(), category: 'rhyme-pattern', severity: 'suggestion',
          title: `Predictable rhyme pair in ${section.label}`,
          description: `"${a}" / "${b}" is one of the most overused rhyme pairs. Try a slant rhyme or rewrite one of the lines.`,
          sectionLabel: section.label,
        });
      }
    }

    // Rule RS-2: Rhyme scheme consistency across same-type sections
    // (checked later in checkRhymeSchemeConsistency)

    // Rule AI-2: Rigid AABB detection
    if (pattern === 'AABB' && lyricLines.length === 4) {
      // We'll collect and check globally below
    }
  }

  return issues;
}

// ─── 2b. Rhyme Scheme Consistency (Rule RS-2) ───────────────────────

function checkRhymeSchemeConsistency(sections: ParsedSection[]): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];
  const byType = new Map<SectionType, { section: ParsedSection; pattern: string }[]>();

  for (const sec of sections) {
    const lyricLines = sec.lines.map(l => cleanLyricLine(l.text));
    if (lyricLines.length < 4) continue;
    const { pattern } = analyzeRhymeScheme(lyricLines);
    const group = byType.get(sec.type) || [];
    group.push({ section: sec, pattern });
    byType.set(sec.type, group);
  }

  for (const [type, group] of byType) {
    if (group.length < 2 || type === 'chorus' || type === 'hook') continue;
    const first = group[0];
    for (let i = 1; i < group.length; i++) {
      const other = group[i];
      if (first.pattern !== 'FREE' && other.pattern !== 'FREE' &&
          first.pattern !== 'UNKNOWN' && other.pattern !== 'UNKNOWN' &&
          first.pattern !== other.pattern) {
        issues.push({
          id: nextId(), category: 'rhyme-pattern', severity: 'suggestion',
          title: `Rhyme scheme changes between ${first.section.label} and ${other.section.label}`,
          description: `${first.section.label} uses ${first.pattern} but ${other.section.label} uses ${other.pattern}. Consistent rhyme schemes across verses help maintain the melody.`,
          sectionLabel: other.section.label,
        });
      }
    }
  }

  // Rule AI-2: Check if ALL sections use rigid AABB in 4-line blocks
  const allPatterns = [...byType.values()].flat();
  if (allPatterns.length >= 3 && allPatterns.every(p => p.pattern === 'AABB')) {
    issues.push({
      id: nextId(), category: 'ai-slop', severity: 'warning',
      title: 'Uniform AABB structure detected',
      description: 'Every section uses strict AABB rhyme in 4-line blocks. This is a common AI pattern. Vary your rhyme scheme — try ABAB, ABCB, or free verse in at least one section.',
    });
  }

  return issues;
}

// ─── 3. Echo Tail Recognition ───────────────────────────────────────

function recognizeEchoTails(sections: ParsedSection[]): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];
  for (const section of sections) {
    for (const line of section.lines) {
      const { isEcho, echoText } = isEchoTail(line.text);
      if (isEcho) {
        issues.push({
          id: nextId(), category: 'echo-tail', severity: 'info',
          title: `Echo tail detected in ${section.label}`,
          description: `"(${echoText})" is a Suno echo/performance cue.`,
          sectionLabel: section.label, lines: [line.lineNum],
        });
      }
    }
  }
  return issues;
}

// ─── 4. Redundancy ──────────────────────────────────────────────────

function checkRedundancy(sections: ParsedSection[]): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];
  for (const section of sections) {
    const cleanLines = section.lines.map(l => ({ ...l, clean: cleanLyricLine(l.text) }));
    for (let i = 0; i < cleanLines.length; i++) {
      for (let j = i + 1; j < cleanLines.length; j++) {
        const a = cleanLines[i], b = cleanLines[j];
        const endWordA = getSignificantWords(a.clean).slice(-1)[0] || '';
        const endWordB = getSignificantWords(b.clean).slice(-1)[0] || '';
        const sameEndWord = endWordA && endWordB && (endWordA === endWordB || simpleRhymeCheck(endWordA, endWordB));
        const overlap = wordOverlap(a.clean, b.clean);
        if (overlap >= 0.5 || (overlap >= 0.3 && sameEndWord)) {
          issues.push({
            id: nextId(), category: 'redundancy', severity: 'suggestion',
            title: `Similar lines in ${section.label}`,
            description: `These lines express a similar idea:\n  Line ${a.lineNum}: "${a.text}"\n  Line ${b.lineNum}: "${b.text}"\nConsider differentiating them or cutting one.`,
            sectionLabel: section.label, lines: [a.lineNum, b.lineNum],
            context: { sectionLyrics: section.lines.map(l => l.text).join('\n'), sectionType: section.type, sectionLabel: section.label },
          });
        }
      }
    }
  }
  return issues;
}

// ─── 5. Section Identity (Research-backed thresholds) ────────────────

function checkSectionIdentity(sections: ParsedSection[]): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];
  const stats = computeSectionStats(sections);
  const verses = stats.filter(s => s.section.type === 'verse');
  const choruses = stats.filter(s => s.section.type === 'chorus');
  const preChorus = stats.filter(s => s.section.type === 'pre-chorus');
  const bridges = stats.filter(s => s.section.type === 'bridge');

  const avgVerseSlbl = verses.length > 0
    ? verses.reduce((s, v) => s + v.avgSyllables, 0) / verses.length : 0;
  const avgChorusSlbl = choruses.length > 0
    ? choruses.reduce((s, v) => s + v.avgSyllables, 0) / choruses.length : 0;

  // V-2: Verse should be denser than chorus
  if (verses.length > 0 && choruses.length > 0 && avgChorusSlbl >= avgVerseSlbl) {
    issues.push({
      id: nextId(), category: 'section-identity', severity: 'warning',
      title: 'Chorus is as dense or denser than verse',
      description: `Chorus averages ${avgChorusSlbl.toFixed(1)} syllables/line vs verse ${avgVerseSlbl.toFixed(1)}. Verses should carry more syllabic density (8-12 syl) while choruses stay simpler (4-8 syl).`,
      lines: choruses.flatMap(c => c.section.lines.map(l => l.lineNum)),
      context: { sectionLyrics: choruses[0]?.section.lines.map(l => l.text).join('\n'), sectionType: 'chorus', syllableCounts: choruses[0]?.syllables },
    });
  }

  // CH-2: Chorus lines should average 4-8 syllables
  for (const chorus of choruses) {
    if (chorus.avgSyllables > 8 && chorus.lineCount > 0) {
      issues.push({
        id: nextId(), category: 'section-identity', severity: 'suggestion',
        title: `${chorus.section.label} lines may be too wordy`,
        description: `Chorus averages ${chorus.avgSyllables.toFixed(1)} syllables/line. Best practice is 4-8 syllables for maximum singability and memorability.`,
        sectionLabel: chorus.section.label,
        lines: chorus.section.lines.map(l => l.lineNum),
        context: { sectionLyrics: chorus.section.lines.map(l => l.text).join('\n'), sectionType: 'chorus', syllableCounts: chorus.syllables },
      });
    }
  }

  // V-3: Verse 2 restating Verse 1
  if (verses.length >= 2) {
    const v1Words = verses[0].words;
    const v2Words = verses[1].words;
    if (v1Words.length > 0 && v2Words.length > 0) {
      const v1Set = new Set(v1Words);
      const shared = v2Words.filter(w => v1Set.has(w)).length;
      const overlapRatio = shared / Math.max(v1Words.length, v2Words.length);
      if (overlapRatio > 0.4) {
        issues.push({
          id: nextId(), category: 'section-identity', severity: 'suggestion',
          title: 'Verse 2 may be restating Verse 1',
          description: `${Math.round(overlapRatio * 100)}% vocabulary overlap. Verse 2 should advance the story, not restate it with different words.`,
          sectionLabel: verses[1].section.label,
          lines: verses[1].section.lines.map(l => l.lineNum),
        });
      }
    }
  }

  // PC-1: Pre-chorus too long
  if (preChorus.length > 0 && verses.length > 0) {
    const avgVerseLines = verses.reduce((s, v) => s + v.lineCount, 0) / verses.length;
    for (const pre of preChorus) {
      if (pre.lineCount >= avgVerseLines) {
        issues.push({
          id: nextId(), category: 'section-identity', severity: 'warning',
          title: `${pre.section.label} may be too long`,
          description: `Pre-chorus has ${pre.lineCount} lines vs verse average of ${avgVerseLines.toFixed(0)}. Pre-chorus should be roughly half the verse length — a quick build to the chorus.`,
          sectionLabel: pre.section.label,
          lines: pre.section.lines.map(l => l.lineNum),
        });
      }
    }
  }

  // PC-4: Pre-chorus steals chorus payoff
  if (preChorus.length > 0 && choruses.length > 0) {
    for (const pre of preChorus) {
      for (const chorus of choruses) {
        const preWords = new Set(pre.words);
        const chorusKeyWords = chorus.words.filter(w => {
          const verseFreq = verses.reduce((c, v) => c + (v.words.includes(w) ? 1 : 0), 0);
          return verseFreq === 0;
        });
        const stolenCount = chorusKeyWords.filter(w => preWords.has(w)).length;
        if (chorusKeyWords.length > 0 && stolenCount / chorusKeyWords.length > 0.5) {
          issues.push({
            id: nextId(), category: 'section-identity', severity: 'warning',
            title: `${pre.section.label} may steal the chorus payoff`,
            description: `Pre-chorus uses key phrases reserved for the chorus hook. It should build tension, not deliver the punchline early.`,
            sectionLabel: pre.section.label,
            lines: pre.section.lines.map(l => l.lineNum),
            context: { sectionLyrics: pre.section.lines.map(l => l.text).join('\n'), sectionType: 'pre-chorus', sectionLabel: pre.section.label },
          });
        }
      }
    }
  }

  // BR-1: Bridge lacks contrast (>60% vocabulary overlap with verses)
  if (bridges.length > 0 && verses.length > 0) {
    for (const bridge of bridges) {
      const verseWordPool = new Set(verses.flatMap(v => v.words));
      if (bridge.words.length < 3) continue;
      const overlapCount = bridge.words.filter(w => verseWordPool.has(w)).length;
      const overlapRatio = overlapCount / bridge.words.length;
      if (overlapRatio > 0.6) {
        issues.push({
          id: nextId(), category: 'section-identity', severity: 'suggestion',
          title: `${bridge.section.label} lacks contrast with verses`,
          description: `${Math.round(overlapRatio * 100)}% vocabulary overlap. Bridges should change at least 2 elements: vocabulary, perspective, rhyme scheme, or rhythmic density.`,
          sectionLabel: bridge.section.label,
          lines: bridge.section.lines.map(l => l.lineNum),
          context: { sectionLyrics: bridge.section.lines.map(l => l.text).join('\n'), sectionType: 'bridge', sectionLabel: bridge.section.label },
        });
      }
    }
  }

  return issues;
}

// ─── 6. Version Conflicts ───────────────────────────────────────────

function checkVersionConflicts(sections: ParsedSection[]): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];
  const seenLabels = new Map<string, ParsedSection[]>();
  for (const sec of sections) {
    const normalized = sec.label.toLowerCase().trim();
    const group = seenLabels.get(normalized) || [];
    group.push(sec);
    seenLabels.set(normalized, group);
  }

  for (const [, group] of seenLabels) {
    if (group.length < 2) continue;
    if (group[0].type === 'chorus' || group[0].type === 'hook') continue;
    for (let i = 1; i < group.length; i++) {
      const a = group[0], b = group[i];
      const textA = a.lines.map(l => cleanLyricLine(l.text)).join('\n');
      const textB = b.lines.map(l => cleanLyricLine(l.text)).join('\n');
      const overlap = wordOverlap(textA, textB);
      if (overlap > 0.5) {
        const linesA = textA.split('\n'), linesB = textB.split('\n');
        const diffs: { lineNum: number; a: string; b: string }[] = [];
        for (let j = 0; j < Math.max(linesA.length, linesB.length); j++) {
          const la = linesA[j] || '(missing)', lb = linesB[j] || '(missing)';
          if (la.toLowerCase() !== lb.toLowerCase()) diffs.push({ lineNum: j + 1, a: la, b: lb });
        }
        issues.push({
          id: nextId(), category: 'version-conflict', severity: 'warning',
          title: `Possible alternate versions: "${a.label}"`,
          description: `Two [${a.label}] sections have ${Math.round(overlap * 100)}% word overlap. Choose one or merge the best lines.`,
          sectionLabel: a.label,
          lines: [...a.lines.map(l => l.lineNum), ...b.lines.map(l => l.lineNum)],
          context: { versionsA: textA, versionsB: textB, sectionLabel: a.label, sectionType: a.type, diffLines: diffs },
        });
      }
    }
  }

  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      const a = sections[i], b = sections[j];
      if (a.label.toLowerCase() === b.label.toLowerCase()) continue;
      if (a.type !== b.type) continue;
      const textA = a.lines.map(l => cleanLyricLine(l.text)).join(' ');
      const textB = b.lines.map(l => cleanLyricLine(l.text)).join(' ');
      const overlap = wordOverlap(textA, textB);
      if (overlap > 0.5 && a.type !== 'chorus' && a.type !== 'hook') {
        issues.push({
          id: nextId(), category: 'version-conflict', severity: 'suggestion',
          title: `"${a.label}" and "${b.label}" are very similar`,
          description: `${Math.round(overlap * 100)}% vocabulary overlap. Differentiate them or pick the stronger one.`,
          sectionLabel: `${a.label} / ${b.label}`,
          lines: [...a.lines.map(l => l.lineNum), ...b.lines.map(l => l.lineNum)],
          context: { versionsA: a.lines.map(l => l.text).join('\n'), versionsB: b.lines.map(l => l.text).join('\n'), sectionLabel: `${a.label} vs ${b.label}`, sectionType: a.type },
        });
      }
    }
  }

  return issues;
}

// ─── 7. Completeness ────────────────────────────────────────────────

export interface CompletenessScore {
  score: number;
  present: string[];
  missing: string[];
  extras: string[];
}

function checkCompleteness(sections: ParsedSection[]): { score: CompletenessScore; issues: AnalysisIssue[] } {
  const issues: AnalysisIssue[] = [];
  const expectedTypes: { type: SectionType; label: string; minCount: number }[] = [
    { type: 'verse', label: 'Verse', minCount: 2 },
    { type: 'chorus', label: 'Chorus', minCount: 2 },
    { type: 'bridge', label: 'Bridge', minCount: 1 },
  ];
  const optionalTypes: { type: SectionType; label: string }[] = [
    { type: 'pre-chorus', label: 'Pre-Chorus' },
    { type: 'intro', label: 'Intro' },
    { type: 'outro', label: 'Outro' },
  ];
  const typeCounts = new Map<SectionType, number>();
  for (const sec of sections) typeCounts.set(sec.type, (typeCounts.get(sec.type) || 0) + 1);

  const present: string[] = [], missing: string[] = [], extras: string[] = [];
  let totalExpected = 0, totalPresent = 0;

  for (const exp of expectedTypes) {
    const count = typeCounts.get(exp.type) || 0;
    totalExpected += exp.minCount;
    if (count >= exp.minCount) { present.push(`${exp.label} (${count})`); totalPresent += exp.minCount; }
    else if (count > 0) { present.push(`${exp.label} (${count}/${exp.minCount})`); totalPresent += count; }
    else missing.push(exp.label);
  }
  for (const opt of optionalTypes) {
    const count = typeCounts.get(opt.type) || 0;
    if (count > 0) { extras.push(`${opt.label} (${count})`); totalPresent += 0.5; totalExpected += 0.5; }
  }

  for (const sec of sections) {
    if (sec.lines.length === 0 && sec.type !== 'instrumental' && sec.type !== 'intro' && sec.type !== 'outro') {
      issues.push({
        id: nextId(), category: 'completeness', severity: 'warning',
        title: `${sec.label} is empty`,
        description: `The [${sec.label}] tag exists but has no lyrics.`,
        sectionLabel: sec.label, lines: [sec.tagLine],
      });
    }
  }

  const score = totalExpected > 0 ? Math.round((totalPresent / totalExpected) * 100) : 0;
  if (missing.length > 0) {
    issues.push({
      id: nextId(), category: 'completeness',
      severity: missing.includes('Chorus') ? 'error' : 'suggestion',
      title: `Missing sections: ${missing.join(', ')}`,
      description: `A standard song structure includes ${missing.join(', ')}. Your song is ${score}% complete structurally.`,
    });
  }
  return { score: { score, present, missing, extras }, issues };
}

// ─── 8. Telling vs Showing (Rules TS-1 through TS-4) ────────────────

function checkTellingVsShowing(sections: ParsedSection[]): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];

  const directEmotionPatterns = [
    /\bi\s+(?:am|feel|'m)\s+(?:so\s+)?(\w+)/i,
    /\bmy\s+heart\s+is\s+(\w+)/i,
    /\byou\s+make\s+me\s+(?:feel\s+)?(\w+)/i,
    /\bit\s+makes\s+me\s+(\w+)/i,
    /\bi'?m\s+so\s+(\w+)/i,
  ];

  const allSensoryWords = new Set(Object.values(SENSORY_WORDS).flat());
  const concreteNounSet = new Set(CONCRETE_NOUNS);

  for (const section of sections) {
    if (section.type === 'intro' || section.type === 'outro' || section.type === 'instrumental') continue;
    if (section.lines.length === 0) continue;

    // TS-1: Direct emotion statements
    for (const line of section.lines) {
      const clean = cleanLyricLine(line.text);
      for (const pattern of directEmotionPatterns) {
        const match = clean.match(pattern);
        if (match) {
          const emotion = match[1]?.toLowerCase();
          if (emotion && DIRECT_EMOTIONS.includes(emotion)) {
            issues.push({
              id: nextId(), category: 'telling-vs-showing', severity: 'suggestion',
              title: `"Telling" detected in ${section.label}`,
              description: `Line ${line.lineNum}: "${line.text}"\nThis states an emotion directly. Consider showing what that feeling looks, sounds, or feels like through action, imagery, or sensory detail.`,
              sectionLabel: section.label, lines: [line.lineNum],
              context: { sectionLyrics: section.lines.map(l => l.text).join('\n'), sectionType: section.type, sectionLabel: section.label },
            });
            break; // one flag per line
          }
        }
      }
    }

    // Only check TS-2, TS-3, TS-4 for verse-type sections
    if (section.type !== 'verse' && section.type !== 'bridge') continue;

    const allText = section.lines.map(l => cleanLyricLine(l.text).toLowerCase()).join(' ');
    const allWordsInSection = getAllWords(allText);

    // TS-2: Concrete noun absence
    const hasConcreteNoun = allWordsInSection.some(w => concreteNounSet.has(w));
    if (!hasConcreteNoun && section.lines.length >= 3) {
      issues.push({
        id: nextId(), category: 'telling-vs-showing', severity: 'suggestion',
        title: `${section.label} lacks concrete imagery`,
        description: `No tangible objects, places, or body parts found. Adding concrete nouns ("coffee", "doorstep", "fingerprints") helps listeners enter your song.`,
        sectionLabel: section.label,
        lines: section.lines.map(l => l.lineNum),
      });
    }

    // TS-3: Action verb absence (too many state-of-being verbs)
    const stateVerbSet = new Set(STATE_OF_BEING_VERBS);
    const stateVerbCount = allWordsInSection.filter(w => stateVerbSet.has(w)).length;
    const totalVerbs = Math.max(allWordsInSection.length, 1);
    if (stateVerbCount / totalVerbs > 0.15 && section.lines.length >= 3) {
      issues.push({
        id: nextId(), category: 'telling-vs-showing', severity: 'suggestion',
        title: `${section.label} relies on state-of-being verbs`,
        description: `High frequency of "is/am/was/feel/seem." Consider adding action verbs — what does the character DO that reveals their feeling?`,
        sectionLabel: section.label,
        lines: section.lines.map(l => l.lineNum),
      });
    }

    // TS-4: Sensory language absence
    const hasSensory = allWordsInSection.some(w => allSensoryWords.has(w));
    if (!hasSensory && section.lines.length >= 3) {
      issues.push({
        id: nextId(), category: 'telling-vs-showing', severity: 'suggestion',
        title: `No sensory language in ${section.label}`,
        description: `No sight, sound, touch, taste, or smell words detected. Engaging the senses pulls listeners into your song's world.`,
        sectionLabel: section.label,
        lines: section.lines.map(l => l.lineNum),
      });
    }
  }

  return issues;
}

// ─── 9. AI Slop Detection (Rules AI-1, AI-5, AI-8) ─────────────────

function checkAISlop(sections: ParsedSection[], lyrics: string): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];
  const lyricsLower = lyrics.toLowerCase();

  // AI-1: AI slop marker count
  let slopCount = 0;
  const foundSlop: string[] = [];
  for (const marker of AI_SLOP_MARKERS) {
    if (lyricsLower.includes(marker)) {
      slopCount++;
      foundSlop.push(marker);
    }
  }
  if (slopCount >= 3) {
    issues.push({
      id: nextId(), category: 'ai-slop', severity: 'warning',
      title: `AI-generated language pattern detected`,
      description: `Found ${slopCount} AI slop markers: ${foundSlop.slice(0, 6).map(s => `"${s}"`).join(', ')}${foundSlop.length > 6 ? '...' : ''}. These phrases are heavily associated with AI-generated lyrics. Replace with more specific, personal imagery.`,
    });
  }

  // AI-5: Cosmic/elemental imagery overload
  let cosmicCount = 0;
  const foundCosmic: string[] = [];
  for (const word of COSMIC_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    const matches = lyricsLower.match(regex);
    if (matches) {
      cosmicCount += matches.length;
      foundCosmic.push(word);
    }
  }
  if (cosmicCount >= 4) {
    issues.push({
      id: nextId(), category: 'ai-slop', severity: 'suggestion',
      title: 'Cosmic imagery overload',
      description: `${cosmicCount} instances of cosmic/elemental words (${foundCosmic.slice(0, 5).join(', ')}). Overreliance on stars/moon/fire/rain/sky is a hallmark of AI-generated lyrics. Ground your imagery in specific, personal details.`,
    });
  }

  // AI-8: Predictable chorus resolutions
  for (const section of sections) {
    if (section.type !== 'chorus' && section.type !== 'hook') continue;
    const lastLine = section.lines[section.lines.length - 1];
    if (!lastLine) continue;
    const lastLineLower = lastLine.text.toLowerCase();
    for (const resolution of PREDICTABLE_RESOLUTIONS) {
      if (lastLineLower.includes(resolution)) {
        issues.push({
          id: nextId(), category: 'ai-slop', severity: 'suggestion',
          title: `Predictable chorus resolution in ${section.label}`,
          description: `"${resolution}" is a generic ending. Try a more specific payoff that ties back to your song's unique story or imagery.`,
          sectionLabel: section.label,
          lines: [lastLine.lineNum],
        });
        break;
      }
    }
  }

  // AI slop: emotional flatness — check if all sections have similar emotional weight
  const stats = computeSectionStats(sections);
  const verseStats = stats.filter(s => s.section.type === 'verse');
  const chorusStats = stats.filter(s => s.section.type === 'chorus');
  if (verseStats.length > 0 && chorusStats.length > 0) {
    const verseDensity = verseStats.reduce((s, v) => s + v.avgSyllables, 0) / verseStats.length;
    const chorusDensity = chorusStats.reduce((s, v) => s + v.avgSyllables, 0) / chorusStats.length;
    if (Math.abs(verseDensity - chorusDensity) < 1) {
      issues.push({
        id: nextId(), category: 'ai-slop', severity: 'suggestion',
        title: 'Emotional flatness — verse and chorus feel the same',
        description: `Verse (${verseDensity.toFixed(1)} syl/line) and chorus (${chorusDensity.toFixed(1)} syl/line) have nearly identical density. This creates monotony. Max Martin's contrast principle: verse should be dense and specific, chorus simple and universal.`,
      });
    }
  }

  return issues;
}

// ─── 10. Syllable Mirroring (Rules MM-001, MM-002, V-4) ────────────

function checkSyllableMirroring(sections: ParsedSection[]): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];

  for (const section of sections) {
    if (section.lines.length < 2) continue;
    const syllables = section.lines.map(l => countLineSyllables(cleanLyricLine(l.text)));

    // MM-001: Adjacent lines within a section should match ±1
    for (let i = 0; i < syllables.length - 1; i++) {
      const a = syllables[i], b = syllables[i + 1];
      if (a > 0 && b > 0 && Math.abs(a - b) > 2) {
        issues.push({
          id: nextId(), category: 'syllable-mirroring', severity: 'suggestion',
          title: `Syllable mismatch in ${section.label}`,
          description: `Line ${section.lines[i].lineNum} has ${a} syllables but line ${section.lines[i + 1].lineNum} has ${b}. For a smoother melody, try matching line lengths more closely (±1).`,
          sectionLabel: section.label,
          lines: [section.lines[i].lineNum, section.lines[i + 1].lineNum],
          context: { sectionLyrics: section.lines.map(l => l.text).join('\n'), sectionType: section.type, sectionLabel: section.label, syllableCounts: syllables },
        });
      }
    }
  }

  // MM-002 / V-4: Cross-verse mirroring (V1 line N vs V2 line N)
  const verses = sections.filter(s => s.type === 'verse');
  if (verses.length >= 2) {
    const v1 = verses[0], v2 = verses[1];
    const v1Syls = v1.lines.map(l => countLineSyllables(cleanLyricLine(l.text)));
    const v2Syls = v2.lines.map(l => countLineSyllables(cleanLyricLine(l.text)));
    const minLen = Math.min(v1Syls.length, v2Syls.length);

    for (let i = 0; i < minLen; i++) {
      if (v1Syls[i] > 0 && v2Syls[i] > 0 && Math.abs(v1Syls[i] - v2Syls[i]) > 2) {
        issues.push({
          id: nextId(), category: 'syllable-mirroring', severity: 'suggestion',
          title: `Cross-verse syllable mismatch at position ${i + 1}`,
          description: `${v1.label} line ${i + 1} has ${v1Syls[i]} syllables but ${v2.label} line ${i + 1} has ${v2Syls[i]}. Matching syllable counts across verses helps maintain the melody.`,
          sectionLabel: `${v1.label} / ${v2.label}`,
          lines: [v1.lines[i]?.lineNum, v2.lines[i]?.lineNum].filter(Boolean) as number[],
        });
      }
    }
  }

  return issues;
}

// ─── 11. Craft Rules (Filler words, wordiness) ─────────────────────

function checkCraftRules(sections: ParsedSection[]): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];

  let totalLines = 0;
  let fillerStartCount = 0;
  const fillerSet = new Set(FILLER_WORDS);

  for (const section of sections) {
    for (const line of section.lines) {
      const clean = cleanLyricLine(line.text);
      const firstWord = clean.toLowerCase().split(/\s+/)[0]?.replace(/[^a-z']/g, '');
      if (firstWord && fillerSet.has(firstWord)) fillerStartCount++;
      totalLines++;

      // Wordiness check: >16 syllables per line
      const syls = countLineSyllables(clean);
      if (syls > 16) {
        issues.push({
          id: nextId(), category: 'craft', severity: 'suggestion',
          title: `Wordy line in ${section.label}`,
          description: `Line ${line.lineNum} has ${syls} syllables. Lines over 16 syllables are hard to sing. Brevity makes lyrics more impactful.`,
          sectionLabel: section.label,
          lines: [line.lineNum],
        });
      }
    }
  }

  // Filler word overuse: >30% of lines start with fillers
  if (totalLines > 4 && fillerStartCount / totalLines > 0.3) {
    issues.push({
      id: nextId(), category: 'craft', severity: 'suggestion',
      title: 'Filler word overuse',
      description: `${Math.round((fillerStartCount / totalLines) * 100)}% of lines start with filler words (and, just, so, well, yeah, oh, like, but). These may not be adding meaning.`,
    });
  }

  return issues;
}

// ─── Main Analysis Entry Point ──────────────────────────────────────

export interface FullAnalysisResult {
  issues: AnalysisIssue[];
  completeness: CompletenessScore;
  sectionCount: number;
  lineCount: number;
}

export function analyzeSong(lyrics: string): FullAnalysisResult {
  _issueId = 0;
  const sections = parseSections(lyrics);
  const lineCount = lyrics.split('\n').filter(l => l.trim().length > 0).length;

  const allIssues: AnalysisIssue[] = [];

  allIssues.push(...checkChorusConsistency(sections));
  allIssues.push(...checkRhymePatterns(sections));
  allIssues.push(...checkRhymeSchemeConsistency(sections));
  allIssues.push(...recognizeEchoTails(sections));
  allIssues.push(...checkRedundancy(sections));
  allIssues.push(...checkSectionIdentity(sections));
  allIssues.push(...checkVersionConflicts(sections));
  allIssues.push(...checkTellingVsShowing(sections));
  allIssues.push(...checkAISlop(sections, lyrics));
  allIssues.push(...checkSyllableMirroring(sections));
  allIssues.push(...checkCraftRules(sections));

  const { score, issues: completenessIssues } = checkCompleteness(sections);
  allIssues.push(...completenessIssues);

  return {
    issues: allIssues,
    completeness: score,
    sectionCount: sections.length,
    lineCount,
  };
}

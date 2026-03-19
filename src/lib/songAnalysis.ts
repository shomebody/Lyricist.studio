/**
 * songAnalysis.ts — Deep lyric analysis engine.
 *
 * Analyzes lyrics for structural issues, consistency problems,
 * redundancy, rhyme patterns, section identity violations, and
 * completeness. Designed to catch real songwriting problems,
 * not just formatting issues.
 */

import { parseStructuralTag, analyzeRhymeScheme, simpleRhymeCheck, SectionType } from './arrangement';
import { countLineSyllables } from './syllables';

// ─── Types ──────────────────────────────────────────────────────────

export type IssueSeverity = 'error' | 'warning' | 'suggestion' | 'info';

export interface AnalysisIssue {
  id: string;
  category: AnalysisCategory;
  severity: IssueSeverity;
  title: string;
  description: string;
  sectionLabel?: string;
  lines?: number[];           // 1-based line numbers
  context?: AnalysisContext;   // rich context for AI fix prompts
}

export type AnalysisCategory =
  | 'chorus-consistency'
  | 'rhyme-pattern'
  | 'echo-tail'
  | 'redundancy'
  | 'section-identity'
  | 'version-conflict'
  | 'completeness';

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
  tagLine: number;            // 1-based line number of the [Tag]
  lines: { text: string; lineNum: number }[]; // lyric lines only (no blanks, no tags)
}

/**
 * Parse lyrics into sections, extracting tag lines and lyric content.
 */
function parseSections(lyrics: string): ParsedSection[] {
  const allLines = lyrics.split('\n');
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;

  for (let i = 0; i < allLines.length; i++) {
    const raw = allLines[i];
    const trimmed = raw.trim();
    const tag = parseStructuralTag(trimmed);

    if (tag) {
      current = {
        type: tag.type,
        label: tag.label,
        tagLine: i + 1,
        lines: [],
      };
      sections.push(current);
      continue;
    }

    if (current && trimmed.length > 0) {
      // Strip echo tails for analysis purposes but keep the raw text
      current.lines.push({ text: trimmed, lineNum: i + 1 });
    }
  }

  return sections;
}

/**
 * Detect echo tail patterns in a line.
 * Echo tails are parenthetical text that echoes part of the lyric line.
 * e.g. "meditation (tation)", "weights in (get my weights in)"
 */
function isEchoTail(line: string): { isEcho: boolean; cleanLine: string; echoText: string } {
  const match = line.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (!match) return { isEcho: false, cleanLine: line, echoText: '' };

  const mainText = match[1].trim();
  const parenText = match[2].trim().toLowerCase();
  const mainLower = mainText.toLowerCase();

  // Check if parenthetical content is a suffix of the main text
  const mainWords = mainLower.split(/\s+/);
  const lastWord = mainWords[mainWords.length - 1] || '';

  // Exact word echo: "station (station)"
  if (mainLower.endsWith(parenText)) {
    return { isEcho: true, cleanLine: mainText, echoText: parenText };
  }

  // Suffix echo: "meditation (tation)"
  if (lastWord.length > 3 && lastWord.endsWith(parenText)) {
    return { isEcho: true, cleanLine: mainText, echoText: parenText };
  }
  if (parenText.length > 2 && lastWord.endsWith(parenText)) {
    return { isEcho: true, cleanLine: mainText, echoText: parenText };
  }

  // Phrase echo: "weights in (get my weights in)" — paren contains words from the line
  const parenWords = parenText.split(/\s+/);
  const mainWordSet = new Set(mainWords);
  const overlapCount = parenWords.filter(w => mainWordSet.has(w)).length;
  if (parenWords.length > 0 && overlapCount / parenWords.length >= 0.5) {
    return { isEcho: true, cleanLine: mainText, echoText: parenText };
  }

  return { isEcho: false, cleanLine: line, echoText: '' };
}

/**
 * Get the clean lyric text of a line, stripping echo tails.
 */
function cleanLyricLine(text: string): string {
  const { isEcho, cleanLine } = isEchoTail(text);
  return isEcho ? cleanLine : text;
}

/**
 * Extract significant words from a line (lowercase, no stop words, no punctuation).
 */
function getSignificantWords(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'is', 'it', 'my', 'me', 'we', 'us', 'our', 'you',
    'your', 'i', 'so', 'up', 'out', 'all', 'just', 'like', 'get', 'got',
    'be', 'been', 'am', 'are', 'was', 'were', 'do', 'did', 'this', 'that',
    'no', 'not', "don't", "won't", "can't", 'yeah', 'oh', 'na',
  ]);
  return text
    .toLowerCase()
    .replace(/[^a-z\s']/g, '')
    .split(/\s+/)
    .filter(w => w.length > 1 && !stopWords.has(w));
}

/**
 * Calculate word overlap ratio between two lines.
 */
function wordOverlap(a: string, b: string): number {
  const wordsA = getSignificantWords(a);
  const wordsB = getSignificantWords(b);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;

  const setB = new Set(wordsB);
  const overlap = wordsA.filter(w => setB.has(w)).length;
  return overlap / Math.max(wordsA.length, wordsB.length);
}

// ─── Analysis Functions ─────────────────────────────────────────────

let _issueId = 0;
function nextId(): string {
  return `issue_${++_issueId}`;
}

/**
 * 1. Chorus Consistency Check
 * Find all sections of the same type (especially Chorus) and compare them
 * line by line. Show specific diffs.
 */
function checkChorusConsistency(sections: ParsedSection[]): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];

  // Group sections by type
  const byType = new Map<SectionType, ParsedSection[]>();
  for (const sec of sections) {
    const group = byType.get(sec.type) || [];
    group.push(sec);
    byType.set(sec.type, group);
  }

  for (const [type, group] of byType) {
    if (group.length < 2) continue;
    // Only check types that should be consistent (chorus, hook)
    if (type !== 'chorus' && type !== 'hook') continue;

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
        if (a.toLowerCase() !== b.toLowerCase()) {
          diffLines.push({
            lineNum: i + 1,
            a,
            b,
          });
        }
      }

      if (diffLines.length > 0) {
        const diffDesc = diffLines
          .map(d => `  Line ${d.lineNum}:\n    "${reference.label}": ${d.a}\n    "${compare.label}": ${d.b}`)
          .join('\n');

        issues.push({
          id: nextId(),
          category: 'chorus-consistency',
          severity: 'warning',
          title: `${reference.label} and ${compare.label} differ`,
          description: `${diffLines.length} line${diffLines.length > 1 ? 's' : ''} differ between these sections:\n${diffDesc}`,
          sectionLabel: compare.label,
          lines: [
            ...diffLines.map(d => reference.lines[d.lineNum - 1]?.lineNum).filter(Boolean),
            ...diffLines.map(d => compare.lines[d.lineNum - 1]?.lineNum).filter(Boolean),
          ] as number[],
          context: {
            versionsA: reference.lines.map(l => l.text).join('\n'),
            versionsB: compare.lines.map(l => l.text).join('\n'),
            sectionLabel: `${reference.label} vs ${compare.label}`,
            sectionType: type,
            diffLines,
          },
        });
      }
    }
  }

  return issues;
}

/**
 * 2. Rhyme Chain Detection with Intentional Break Awareness
 */
function checkRhymePatterns(sections: ParsedSection[]): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];

  for (const section of sections) {
    const lyricLines = section.lines.map(l => cleanLyricLine(l.text));
    if (lyricLines.length < 3) continue;

    const { groups } = analyzeRhymeScheme(lyricLines);

    // Look for rhyme chains that break
    // A chain is 3+ consecutive lines with the same rhyme group
    let chainStart = 0;
    let chainGroup = groups[0]?.group || '-';

    for (let i = 1; i <= groups.length; i++) {
      const currentGroup = i < groups.length ? groups[i].group : '__END__';

      if (currentGroup !== chainGroup || i === groups.length) {
        const chainLen = i - chainStart;

        if (chainLen >= 3 && i < groups.length) {
          // Chain of 3+ broke — check if the break is at the end of the section
          const remainingLines = groups.length - i;
          const isAtSectionEnd = remainingLines <= 2;

          if (isAtSectionEnd) {
            issues.push({
              id: nextId(),
              category: 'rhyme-pattern',
              severity: 'info',
              title: `Possible cadence shift in ${section.label}`,
              description: `Lines ${chainStart + 1}-${i} rhyme on "${groups[chainStart].endWord}" pattern, then lines ${i + 1}-${groups.length} break away. This looks like an intentional cadence shift before the next section — a common songwriting technique for transitions.`,
              sectionLabel: section.label,
              lines: section.lines.slice(i).map(l => l.lineNum),
              context: {
                sectionLyrics: lyricLines.join('\n'),
                sectionType: section.type,
                sectionLabel: section.label,
                rhymeScheme: groups.map(g => g.group).join(''),
              },
            });
          } else {
            issues.push({
              id: nextId(),
              category: 'rhyme-pattern',
              severity: 'suggestion',
              title: `Broken rhyme chain in ${section.label}`,
              description: `Lines ${chainStart + 1}-${i} establish a strong "${groups[chainStart].endWord}" rhyme pattern, but line ${i + 1} ("${groups[i]?.endWord}") breaks it mid-section. Consider maintaining the chain or making the break more intentional.`,
              sectionLabel: section.label,
              lines: [section.lines[i]?.lineNum].filter(Boolean) as number[],
              context: {
                sectionLyrics: lyricLines.join('\n'),
                sectionType: section.type,
                sectionLabel: section.label,
                rhymeScheme: groups.map(g => g.group).join(''),
              },
            });
          }
        }

        chainStart = i;
        chainGroup = currentGroup;
      }
    }
  }

  return issues;
}

/**
 * 3. Echo Tail Recognition — flag echo tails as info, not errors.
 * This runs to explicitly annotate echo tails so other analyzers skip them.
 * Returns info-level issues to confirm recognition.
 */
function recognizeEchoTails(sections: ParsedSection[]): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];

  for (const section of sections) {
    for (const line of section.lines) {
      const { isEcho, echoText } = isEchoTail(line.text);
      if (isEcho) {
        issues.push({
          id: nextId(),
          category: 'echo-tail',
          severity: 'info',
          title: `Echo tail detected in ${section.label}`,
          description: `"(${echoText})" is a Suno echo/performance cue, not a separate lyric line. This will render as a vocal echo effect.`,
          sectionLabel: section.label,
          lines: [line.lineNum],
        });
      }
    }
  }

  return issues;
}

/**
 * 4. Redundant Line Detection
 * Compare lines within a section for semantic overlap.
 */
function checkRedundancy(sections: ParsedSection[]): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];

  for (const section of sections) {
    const cleanLines = section.lines.map(l => ({
      ...l,
      clean: cleanLyricLine(l.text),
    }));

    for (let i = 0; i < cleanLines.length; i++) {
      for (let j = i + 1; j < cleanLines.length; j++) {
        const a = cleanLines[i];
        const b = cleanLines[j];

        // Check end-word similarity
        const endWordA = getSignificantWords(a.clean).slice(-1)[0] || '';
        const endWordB = getSignificantWords(b.clean).slice(-1)[0] || '';
        const sameEndWord = endWordA && endWordB && (endWordA === endWordB || simpleRhymeCheck(endWordA, endWordB));

        // Check overall word overlap
        const overlap = wordOverlap(a.clean, b.clean);

        // High overlap + similar end words = likely redundant
        if (overlap >= 0.5 || (overlap >= 0.3 && sameEndWord)) {
          issues.push({
            id: nextId(),
            category: 'redundancy',
            severity: 'suggestion',
            title: `Similar lines in ${section.label}`,
            description: `These lines express a similar idea:\n  Line ${a.lineNum}: "${a.text}"\n  Line ${b.lineNum}: "${b.text}"\nConsider differentiating them or cutting one to keep the section tight.`,
            sectionLabel: section.label,
            lines: [a.lineNum, b.lineNum],
            context: {
              sectionLyrics: section.lines.map(l => l.text).join('\n'),
              sectionType: section.type,
              sectionLabel: section.label,
            },
          });
        }
      }
    }
  }

  return issues;
}

/**
 * 5. Section Identity Analysis
 * Each section type has a structural job. Flag violations.
 */
function checkSectionIdentity(sections: ParsedSection[]): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];

  // Gather syllable stats per section
  const sectionStats = sections.map(sec => {
    const cleanLines = sec.lines.map(l => cleanLyricLine(l.text));
    const syllables = cleanLines.map(countLineSyllables);
    const avgSyllables = syllables.length > 0
      ? syllables.reduce((s, v) => s + v, 0) / syllables.length
      : 0;
    const words = getSignificantWords(cleanLines.join(' '));
    return { section: sec, avgSyllables, lineCount: cleanLines.length, words, syllables };
  });

  // Find verses and choruses for comparison
  const verses = sectionStats.filter(s => s.section.type === 'verse');
  const choruses = sectionStats.filter(s => s.section.type === 'chorus');
  const preChorus = sectionStats.filter(s => s.section.type === 'pre-chorus');
  const bridges = sectionStats.filter(s => s.section.type === 'bridge');

  // Chorus denser than verse?
  if (verses.length > 0 && choruses.length > 0) {
    const avgVerseSlbl = verses.reduce((s, v) => s + v.avgSyllables, 0) / verses.length;
    const avgChorusSlbl = choruses.reduce((s, v) => s + v.avgSyllables, 0) / choruses.length;

    if (avgChorusSlbl > avgVerseSlbl + 1.5) {
      issues.push({
        id: nextId(),
        category: 'section-identity',
        severity: 'warning',
        title: 'Chorus is denser than verse',
        description: `Your chorus averages ${avgChorusSlbl.toFixed(1)} syllables/line vs ${avgVerseSlbl.toFixed(1)} in verses. Choruses should be simpler and more singable than verses. Consider shortening chorus lines or adding density to verses.`,
        lines: choruses.flatMap(c => c.section.lines.map(l => l.lineNum)),
        context: {
          sectionLyrics: choruses[0]?.section.lines.map(l => l.text).join('\n'),
          sectionType: 'chorus',
          syllableCounts: choruses[0]?.syllables,
        },
      });
    }
  }

  // Bridge uses same vocabulary as verses? (no contrast)
  if (bridges.length > 0 && verses.length > 0) {
    for (const bridge of bridges) {
      const verseWordPool = new Set(verses.flatMap(v => v.words));
      const bridgeWords = bridge.words;
      if (bridgeWords.length < 3) continue;

      const overlapCount = bridgeWords.filter(w => verseWordPool.has(w)).length;
      const overlapRatio = overlapCount / bridgeWords.length;

      if (overlapRatio > 0.6) {
        issues.push({
          id: nextId(),
          category: 'section-identity',
          severity: 'suggestion',
          title: `${bridge.section.label} lacks contrast with verses`,
          description: `${Math.round(overlapRatio * 100)}% of the bridge's vocabulary also appears in your verses. Bridges should offer a new perspective, different imagery, or a twist. Try introducing new metaphors or shifting the narrative angle.`,
          sectionLabel: bridge.section.label,
          lines: bridge.section.lines.map(l => l.lineNum),
          context: {
            sectionLyrics: bridge.section.lines.map(l => l.text).join('\n'),
            sectionType: 'bridge',
            sectionLabel: bridge.section.label,
          },
        });
      }
    }
  }

  // Pre-chorus steals the chorus payoff?
  if (preChorus.length > 0 && choruses.length > 0) {
    for (const pre of preChorus) {
      for (const chorus of choruses) {
        const preWords = new Set(pre.words);
        const chorusWords = chorus.words;
        if (chorusWords.length < 2) continue;

        // Check if the pre-chorus's most distinctive words appear in the chorus
        const chorusKeyWords = chorusWords.filter(w => {
          // Words that appear in chorus but not commonly in verses
          const verseFreq = verses.reduce((c, v) => c + (v.words.includes(w) ? 1 : 0), 0);
          return verseFreq === 0; // unique to chorus
        });

        const stolenCount = chorusKeyWords.filter(w => preWords.has(w)).length;
        if (chorusKeyWords.length > 0 && stolenCount / chorusKeyWords.length > 0.5) {
          issues.push({
            id: nextId(),
            category: 'section-identity',
            severity: 'warning',
            title: `${pre.section.label} may steal the chorus payoff`,
            description: `The pre-chorus uses key words that should be reserved for the chorus hook. The pre-chorus should build tension, not deliver the punchline early. Consider replacing shared phrases in the pre-chorus with transitional language.`,
            sectionLabel: pre.section.label,
            lines: pre.section.lines.map(l => l.lineNum),
            context: {
              sectionLyrics: pre.section.lines.map(l => l.text).join('\n'),
              sectionType: 'pre-chorus',
              sectionLabel: pre.section.label,
            },
          });
        }
      }
    }
  }

  return issues;
}

/**
 * 6. Version Conflict Detection
 * Find duplicate tag names or sections with >50% word overlap.
 */
function checkVersionConflicts(sections: ParsedSection[]): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];
  const seenLabels = new Map<string, ParsedSection[]>();

  for (const sec of sections) {
    const normalized = sec.label.toLowerCase().trim();
    const group = seenLabels.get(normalized) || [];
    group.push(sec);
    seenLabels.set(normalized, group);
  }

  // Exact duplicate labels
  for (const [label, group] of seenLabels) {
    if (group.length < 2) continue;
    // Choruses repeating is expected — only flag if content differs significantly
    if (group[0].type === 'chorus' || group[0].type === 'hook') continue;

    for (let i = 1; i < group.length; i++) {
      const a = group[0];
      const b = group[i];
      const textA = a.lines.map(l => cleanLyricLine(l.text)).join('\n');
      const textB = b.lines.map(l => cleanLyricLine(l.text)).join('\n');
      const overlap = wordOverlap(textA, textB);

      if (overlap > 0.5) {
        issues.push({
          id: nextId(),
          category: 'version-conflict',
          severity: 'warning',
          title: `Possible alternate versions: "${a.label}"`,
          description: `Two [${a.label}] sections have ${Math.round(overlap * 100)}% word overlap. This may be an unresolved alternate version. Choose one or merge the best lines.`,
          sectionLabel: a.label,
          lines: [...a.lines.map(l => l.lineNum), ...b.lines.map(l => l.lineNum)],
          context: {
            versionsA: textA,
            versionsB: textB,
            sectionLabel: a.label,
            sectionType: a.type,
            diffLines: (() => {
              const linesA = textA.split('\n');
              const linesB = textB.split('\n');
              const diffs: { lineNum: number; a: string; b: string }[] = [];
              const maxLen = Math.max(linesA.length, linesB.length);
              for (let j = 0; j < maxLen; j++) {
                const la = linesA[j] || '(missing)';
                const lb = linesB[j] || '(missing)';
                if (la.toLowerCase() !== lb.toLowerCase()) {
                  diffs.push({ lineNum: j + 1, a: la, b: lb });
                }
              }
              return diffs;
            })(),
          },
        });
      }
    }
  }

  // Also check non-identical labels with high overlap
  const allSections = [...sections];
  for (let i = 0; i < allSections.length; i++) {
    for (let j = i + 1; j < allSections.length; j++) {
      const a = allSections[i];
      const b = allSections[j];
      if (a.label.toLowerCase() === b.label.toLowerCase()) continue; // already handled
      if (a.type !== b.type) continue; // different types are expected to differ

      const textA = a.lines.map(l => cleanLyricLine(l.text)).join(' ');
      const textB = b.lines.map(l => cleanLyricLine(l.text)).join(' ');
      const overlap = wordOverlap(textA, textB);

      if (overlap > 0.5 && a.type !== 'chorus' && a.type !== 'hook') {
        issues.push({
          id: nextId(),
          category: 'version-conflict',
          severity: 'suggestion',
          title: `"${a.label}" and "${b.label}" are very similar`,
          description: `These sections share ${Math.round(overlap * 100)}% of their vocabulary. If they're alternate versions, pick the stronger one. If both stay, differentiate them more.`,
          sectionLabel: `${a.label} / ${b.label}`,
          lines: [...a.lines.map(l => l.lineNum), ...b.lines.map(l => l.lineNum)],
          context: {
            versionsA: a.lines.map(l => l.text).join('\n'),
            versionsB: b.lines.map(l => l.text).join('\n'),
            sectionLabel: `${a.label} vs ${b.label}`,
            sectionType: a.type,
          },
        });
      }
    }
  }

  return issues;
}

/**
 * 7. Completeness Scoring
 * Score based on standard song structure presence.
 */
export interface CompletenessScore {
  score: number;        // 0-100
  present: string[];
  missing: string[];
  extras: string[];
}

function checkCompleteness(sections: ParsedSection[]): { score: CompletenessScore; issues: AnalysisIssue[] } {
  const issues: AnalysisIssue[] = [];

  // Standard pop/rock structure expectations
  const expectedTypes: { type: SectionType; label: string; minCount: number }[] = [
    { type: 'verse', label: 'Verse', minCount: 2 },
    { type: 'chorus', label: 'Chorus', minCount: 2 },
    { type: 'bridge', label: 'Bridge', minCount: 1 },
  ];

  // Optional but valuable
  const optionalTypes: { type: SectionType; label: string }[] = [
    { type: 'pre-chorus', label: 'Pre-Chorus' },
    { type: 'intro', label: 'Intro' },
    { type: 'outro', label: 'Outro' },
  ];

  const typeCounts = new Map<SectionType, number>();
  for (const sec of sections) {
    typeCounts.set(sec.type, (typeCounts.get(sec.type) || 0) + 1);
  }

  const present: string[] = [];
  const missing: string[] = [];
  const extras: string[] = [];
  let totalExpected = 0;
  let totalPresent = 0;

  for (const exp of expectedTypes) {
    const count = typeCounts.get(exp.type) || 0;
    totalExpected += exp.minCount;
    if (count >= exp.minCount) {
      present.push(`${exp.label} (${count})`);
      totalPresent += exp.minCount;
    } else if (count > 0) {
      present.push(`${exp.label} (${count}/${exp.minCount})`);
      totalPresent += count;
    } else {
      missing.push(exp.label);
    }
  }

  for (const opt of optionalTypes) {
    const count = typeCounts.get(opt.type) || 0;
    if (count > 0) {
      extras.push(`${opt.label} (${count})`);
      totalPresent += 0.5; // partial credit for optional sections
      totalExpected += 0.5;
    }
  }

  // Check for empty sections (tag exists but no lyrics)
  for (const sec of sections) {
    if (sec.lines.length === 0 && sec.type !== 'instrumental' && sec.type !== 'intro' && sec.type !== 'outro') {
      issues.push({
        id: nextId(),
        category: 'completeness',
        severity: 'warning',
        title: `${sec.label} is empty`,
        description: `The [${sec.label}] tag exists but has no lyrics. Write content or remove the tag.`,
        sectionLabel: sec.label,
        lines: [sec.tagLine],
      });
    }
  }

  const score = totalExpected > 0 ? Math.round((totalPresent / totalExpected) * 100) : 0;

  if (missing.length > 0) {
    issues.push({
      id: nextId(),
      category: 'completeness',
      severity: missing.includes('Chorus') ? 'error' : 'suggestion',
      title: `Missing sections: ${missing.join(', ')}`,
      description: `A standard song structure includes ${missing.join(', ')}. Your song is ${score}% complete structurally.`,
    });
  }

  return { score: { score, present, missing, extras }, issues };
}

// ─── Main Analysis Entry Point ──────────────────────────────────────

export interface FullAnalysisResult {
  issues: AnalysisIssue[];
  completeness: CompletenessScore;
  sectionCount: number;
  lineCount: number;
}

/**
 * Run all analyses on the given lyrics text.
 */
export function analyzeSong(lyrics: string): FullAnalysisResult {
  _issueId = 0; // reset for deterministic IDs within a run
  const sections = parseSections(lyrics);
  const lineCount = lyrics.split('\n').filter(l => l.trim().length > 0).length;

  const allIssues: AnalysisIssue[] = [];

  allIssues.push(...checkChorusConsistency(sections));
  allIssues.push(...checkRhymePatterns(sections));
  allIssues.push(...recognizeEchoTails(sections));
  allIssues.push(...checkRedundancy(sections));
  allIssues.push(...checkSectionIdentity(sections));
  allIssues.push(...checkVersionConflicts(sections));

  const { score, issues: completenessIssues } = checkCompleteness(sections);
  allIssues.push(...completenessIssues);

  return {
    issues: allIssues,
    completeness: score,
    sectionCount: sections.length,
    lineCount,
  };
}

import { analyzeRhymeScheme, RhymePattern } from './arrangement';
import { countLineSyllables } from './syllables';

export interface SectionBlock {
  id: string;
  tag: string;
  type: string; // 'verse', 'chorus', 'pre-chorus', 'bridge', 'outro', 'intro', 'untagged'
  lines: { text: string; index: number }[];
}

export function parseBlocks(lyrics: string): SectionBlock[] {
  const blocks: SectionBlock[] = [];
  let currentBlock: SectionBlock | null = null;
  
  const lines = lyrics.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const isTag = trimmed.startsWith('[') && trimmed.endsWith(']');
    
    if (isTag) {
      if (currentBlock) blocks.push(currentBlock);
      const lowerTag = trimmed.toLowerCase();
      let type = 'untagged';
      if (lowerTag.includes('verse')) type = 'verse';
      else if (lowerTag.includes('pre-chorus') || lowerTag.includes('prechorus') || lowerTag.includes('pre chorus')) type = 'pre-chorus';
      else if (lowerTag.includes('chorus')) type = 'chorus';
      else if (lowerTag.includes('bridge')) type = 'bridge';
      else if (lowerTag.includes('outro')) type = 'outro';
      else if (lowerTag.includes('intro')) type = 'intro';
      
      currentBlock = { id: `block-${i}`, tag: trimmed, type, lines: [] };
    } else {
      if (!currentBlock) {
        currentBlock = { id: `block-untagged`, tag: '[Untagged]', type: 'untagged', lines: [] };
      }
      if (trimmed) {
        // Remove performance cues like (echo) for analysis
        const cleanText = trimmed.replace(/\([^)]+\)/g, '').trim();
        if (cleanText) {
          currentBlock.lines.push({ text: cleanText, index: i });
        }
      }
    }
  }
  if (currentBlock) blocks.push(currentBlock);
  return blocks;
}

export interface SongStructureAnalysis {
  blocks: SectionBlock[];
  missingSections: string[];
  duplicateSections: { tag: string; blocks: SectionBlock[] }[];
  chorusConsistency: {
    isIdentical: boolean;
    differingLines: number;
    totalLines: number;
    score: number;
  } | null;
  emptySections: SectionBlock[];
  completeness: number;
}

export function analyzeSongStructure(lyrics: string): SongStructureAnalysis {
  const blocks = parseBlocks(lyrics);
  
  const types = new Set(blocks.map(b => b.type));
  const missingSections: string[] = [];
  if (!types.has('verse')) missingSections.push('Verse');
  if (!types.has('chorus')) missingSections.push('Chorus');
  if (types.has('verse') && types.has('chorus') && !types.has('bridge')) missingSections.push('Bridge');

  const tagMap = new Map<string, SectionBlock[]>();
  for (const block of blocks) {
    if (block.type !== 'untagged') {
      const existing = tagMap.get(block.tag) || [];
      existing.push(block);
      tagMap.set(block.tag, existing);
    }
  }

  const duplicateSections = Array.from(tagMap.entries())
    .filter(([_, b]) => b.length > 1)
    .map(([tag, b]) => ({ tag, blocks: b }));

  let chorusConsistency = null;
  const choruses = blocks.filter(b => b.type === 'chorus');
  if (choruses.length > 1) {
    const firstChorus = choruses[0];
    let totalDiffering = 0;
    let totalLines = firstChorus.lines.length;
    
    for (let i = 1; i < choruses.length; i++) {
      const otherChorus = choruses[i];
      const maxLines = Math.max(firstChorus.lines.length, otherChorus.lines.length);
      for (let j = 0; j < maxLines; j++) {
        const line1 = firstChorus.lines[j]?.text.toLowerCase() || '';
        const line2 = otherChorus.lines[j]?.text.toLowerCase() || '';
        if (line1 !== line2) {
          totalDiffering++;
        }
      }
      totalLines = Math.max(totalLines, otherChorus.lines.length);
    }
    
    const maxPossibleDiffs = choruses.length > 1 ? (choruses.length - 1) * totalLines : 1;
    const score = Math.max(0, 100 - (totalDiffering / maxPossibleDiffs) * 100);
    
    chorusConsistency = {
      isIdentical: totalDiffering === 0,
      differingLines: totalDiffering,
      totalLines,
      score
    };
  }

  const emptySections = blocks.filter(b => b.lines.length < 2);

  let completeness = 0;
  if (types.has('verse')) completeness += 30;
  if (types.has('chorus')) completeness += 40;
  if (types.has('bridge')) completeness += 20;
  if (blocks.length > 3) completeness += 10;

  return {
    blocks,
    missingSections,
    duplicateSections,
    chorusConsistency,
    emptySections,
    completeness
  };
}

export interface RhymeChainAnalysis {
  sectionId: string;
  tag: string;
  pattern: RhymePattern;
  groups: { lineIndex: number; group: string; endWord: string }[];
  orphans: { lineIndex: number; text: string; endWord: string }[];
  redundantPairs: { line1: number; line2: number; text1: string; text2: string }[];
}

function getWordOverlap(line1: string, line2: string): number {
  const words1 = new Set(line1.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  const words2 = new Set(line2.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  if (words1.size === 0 || words2.size === 0) return 0;
  
  let overlap = 0;
  for (const w of words1) {
    if (words2.has(w)) overlap++;
  }
  return overlap / Math.max(words1.size, words2.size);
}

export function analyzeRhymeChains(lyrics: string): RhymeChainAnalysis[] {
  const blocks = parseBlocks(lyrics);
  const results: RhymeChainAnalysis[] = [];

  for (const block of blocks) {
    if (block.lines.length < 2) continue;
    
    const linesText = block.lines.map(l => l.text);
    const { pattern, groups } = analyzeRhymeScheme(linesText);
    
    const groupCounts = new Map<string, number>();
    for (const g of groups) {
      if (g.group !== '-') {
        groupCounts.set(g.group, (groupCounts.get(g.group) || 0) + 1);
      }
    }

    const orphans: { lineIndex: number; text: string; endWord: string }[] = [];
    for (const g of groups) {
      // If a group only has 1 member and it's near the end, it might be an intentional cadence shift.
      // We'll flag it as an orphan, and the UI can decide how to present it.
      if (g.group !== '-' && groupCounts.get(g.group) === 1) {
        orphans.push({
          lineIndex: block.lines[g.lineIndex].index,
          text: block.lines[g.lineIndex].text,
          endWord: g.endWord
        });
      }
    }

    const redundantPairs: { line1: number; line2: number; text1: string; text2: string }[] = [];
    for (let i = 0; i < block.lines.length; i++) {
      for (let j = i + 1; j < block.lines.length; j++) {
        const overlap = getWordOverlap(block.lines[i].text, block.lines[j].text);
        if (overlap > 0.7 && block.lines[i].text.toLowerCase() !== block.lines[j].text.toLowerCase()) {
          redundantPairs.push({
            line1: block.lines[i].index,
            line2: block.lines[j].index,
            text1: block.lines[i].text,
            text2: block.lines[j].text
          });
        }
      }
    }

    results.push({
      sectionId: block.id,
      tag: block.tag,
      pattern,
      groups: groups.map(g => ({ ...g, lineIndex: block.lines[g.lineIndex].index })),
      orphans,
      redundantPairs
    });
  }

  return results;
}

export interface SectionIdentityAnalysis {
  sectionId: string;
  tag: string;
  type: string;
  expectedJob: string;
  avgSyllables: number;
  issues: string[];
}

export function analyzeSectionIdentity(lyrics: string): SectionIdentityAnalysis[] {
  const blocks = parseBlocks(lyrics);
  const results: SectionIdentityAnalysis[] = [];

  let chorusAvgSyllables = 0;
  const choruses = blocks.filter(b => b.type === 'chorus');
  if (choruses.length > 0) {
    let totalSyl = 0;
    let totalLines = 0;
    for (const c of choruses) {
      for (const l of c.lines) {
        totalSyl += countLineSyllables(l.text);
        totalLines++;
      }
    }
    chorusAvgSyllables = totalLines > 0 ? totalSyl / totalLines : 0;
  }

  for (const block of blocks) {
    if (block.lines.length === 0) continue;

    let expectedJob = '';
    const issues: string[] = [];
    let totalSyl = 0;
    for (const l of block.lines) {
      totalSyl += countLineSyllables(l.text);
    }
    const avgSyllables = totalSyl / block.lines.length;

    if (block.type === 'verse') {
      expectedJob = 'Story/Setup: Establish the narrative, characters, and setting.';
      if (chorusAvgSyllables > 0 && avgSyllables < chorusAvgSyllables - 2) {
        issues.push('Verse is less dense than the chorus. Verses usually have more syllables to tell the story.');
      }
    } else if (block.type === 'pre-chorus') {
      expectedJob = 'Tension/Build: Transition from the verse to the chorus, building anticipation.';
      if (block.lines.length > 4) {
        issues.push('Pre-chorus is quite long. It should be a quick build to the chorus.');
      }
    } else if (block.type === 'chorus') {
      expectedJob = 'Hook/Payoff: The emotional core and most memorable part of the song.';
      // It's okay if chorus is simpler
    } else if (block.type === 'bridge') {
      expectedJob = 'Contrast/Reveal: Introduce new musical/lyrical ideas, a twist, or a new perspective.';
      // Check vocabulary overlap with verse 1 if it exists
      const verse1 = blocks.find(b => b.type === 'verse');
      if (verse1) {
        let overlapCount = 0;
        for (const bl of block.lines) {
          for (const vl of verse1.lines) {
            if (getWordOverlap(bl.text, vl.text) > 0.4) {
              overlapCount++;
            }
          }
        }
        if (overlapCount > block.lines.length / 2) {
          issues.push('Bridge uses very similar vocabulary to Verse 1. It should provide contrast.');
        }
      }
    } else {
      expectedJob = 'Support the main structure of the song.';
    }

    results.push({
      sectionId: block.id,
      tag: block.tag,
      type: block.type,
      expectedJob,
      avgSyllables,
      issues
    });
  }

  return results;
}

export interface VersionConflict {
  tag: string;
  blockA: SectionBlock;
  blockB: SectionBlock;
  similarity: number;
}

export function detectVersionConflicts(lyrics: string): VersionConflict[] {
  const blocks = parseBlocks(lyrics);
  const conflicts: VersionConflict[] = [];

  // 1. Same exact tag
  const tagMap = new Map<string, SectionBlock[]>();
  for (const block of blocks) {
    if (block.type !== 'untagged') {
      const existing = tagMap.get(block.tag) || [];
      existing.push(block);
      tagMap.set(block.tag, existing);
    }
  }

  for (const [tag, b] of tagMap.entries()) {
    if (b.length > 1 && tag.toLowerCase().includes('verse')) {
      // Multiple [Verse 1] tags? That's a conflict.
      // But multiple [Chorus] tags are normal.
      const match = tag.match(/\d+/);
      if (match || tag.toLowerCase() === '[verse]') {
         conflicts.push({
           tag,
           blockA: b[0],
           blockB: b[1],
           similarity: 1 // Same tag
         });
      }
    }
  }

  // 2. Similar content, different tags (e.g. Verse 1 and Verse 2 are 90% identical)
  const verses = blocks.filter(b => b.type === 'verse');
  for (let i = 0; i < verses.length; i++) {
    for (let j = i + 1; j < verses.length; j++) {
      const v1 = verses[i];
      const v2 = verses[j];
      
      let totalOverlap = 0;
      const maxLines = Math.max(v1.lines.length, v2.lines.length);
      if (maxLines === 0) continue;

      for (let k = 0; k < Math.min(v1.lines.length, v2.lines.length); k++) {
        totalOverlap += getWordOverlap(v1.lines[k].text, v2.lines[k].text);
      }
      
      const avgOverlap = totalOverlap / maxLines;
      if (avgOverlap > 0.6 && v1.tag !== v2.tag) {
        conflicts.push({
          tag: `${v1.tag} vs ${v2.tag}`,
          blockA: v1,
          blockB: v2,
          similarity: avgOverlap
        });
      }
    }
  }

  return conflicts;
}

export interface Suggestion {
  id: string;
  type: 'structure' | 'rhyme' | 'identity' | 'consistency' | 'conflict';
  severity: 'error' | 'warning' | 'suggestion';
  title: string;
  description: string;
  action?: {
    label: string;
    type: 'sync_chorus' | 'generate_section' | 'fix_rhyme' | 'resolve_conflict';
    data?: any;
  };
}

export function generateCompletionSuggestions(lyrics: string): Suggestion[] {
  const suggestions: Suggestion[] = [];
  
  const structure = analyzeSongStructure(lyrics);
  const rhymes = analyzeRhymeChains(lyrics);
  const identity = analyzeSectionIdentity(lyrics);
  const conflicts = detectVersionConflicts(lyrics);

  // Structure Suggestions
  if (structure.missingSections.length > 0) {
    const missing = structure.missingSections.join(' and ');
    suggestions.push({
      id: `missing-${missing}`,
      type: 'structure',
      severity: 'warning',
      title: `Missing ${missing}`,
      description: `Your song has ${structure.blocks.filter(b => b.type !== 'untagged').map(b => b.tag).join(', ')}. Consider adding ${missing}.`,
      action: {
        label: `Generate ${structure.missingSections[0]}`,
        type: 'generate_section',
        data: { sectionType: structure.missingSections[0] }
      }
    });
  }

  if (structure.chorusConsistency && !structure.chorusConsistency.isIdentical) {
    suggestions.push({
      id: 'chorus-sync',
      type: 'consistency',
      severity: 'warning',
      title: 'Inconsistent Choruses',
      description: `Your choruses differ on ${structure.chorusConsistency.differingLines} lines. Usually, choruses should be identical for maximum hook impact.`,
      action: {
        label: 'Sync Choruses',
        type: 'sync_chorus',
        data: { blocks: structure.blocks.filter(b => b.type === 'chorus') }
      }
    });
  }

  for (const empty of structure.emptySections) {
    if (empty.type !== 'untagged') {
      suggestions.push({
        id: `empty-${empty.id}`,
        type: 'structure',
        severity: 'error',
        title: `Empty Section: ${empty.tag}`,
        description: `This section has fewer than 2 lines.`,
      });
    }
  }

  // Rhyme Suggestions
  for (const r of rhymes) {
    for (const orphan of r.orphans) {
      const isLastLine = orphan.lineIndex === r.groups[r.groups.length - 1].lineIndex;
      const severity = isLastLine ? 'suggestion' : 'warning';
      const title = isLastLine ? 'Possible Cadence Shift' : 'Rhyme Chain Break';
      
      suggestions.push({
        id: `orphan-${orphan.lineIndex}`,
        type: 'rhyme',
        severity,
        title,
        description: `Line ${orphan.lineIndex + 1} in ${r.tag} doesn't rhyme with anything else in the section.`,
        action: {
          label: 'Find Rhymes',
          type: 'fix_rhyme',
          data: { lineIndex: orphan.lineIndex, word: orphan.endWord }
        }
      });
    }

    for (const pair of r.redundantPairs) {
      suggestions.push({
        id: `redundant-${pair.line1}-${pair.line2}`,
        type: 'identity',
        severity: 'warning',
        title: 'Redundant Lines',
        description: `Lines ${pair.line1 + 1} and ${pair.line2 + 1} in ${r.tag} say very similar things.`,
      });
    }
  }

  // Identity Suggestions
  for (const id of identity) {
    for (const issue of id.issues) {
      suggestions.push({
        id: `identity-${id.sectionId}-${issue.substring(0, 10)}`,
        type: 'identity',
        severity: 'suggestion',
        title: `Section Identity: ${id.tag}`,
        description: issue,
      });
    }
  }

  // Conflict Suggestions
  for (const conflict of conflicts) {
    suggestions.push({
      id: `conflict-${conflict.blockA.id}-${conflict.blockB.id}`,
      type: 'conflict',
      severity: 'error',
      title: `Version Conflict: ${conflict.tag}`,
      description: `You have multiple versions of this section.`,
      action: {
        label: 'Resolve Conflict',
        type: 'resolve_conflict',
        data: conflict
      }
    });
  }

  return suggestions;
}

import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import { useStore, TEMPLATES } from '../store/useStore';
import { countLineSyllables } from '../lib/syllables';
import { validateSunoTags } from '../lib/suno';
import { findCliches, ClicheMatch } from '../lib/cliches';
import { useArrangementStore, selectCurrentArrangement } from '../store/arrangementStore';
import { exportForSuno, SECTION_BG_COLORS, SectionType } from '../lib/arrangement';
import { ArrangementStatusBar } from './ArrangementStatusBar';
import { PocketPlayerFloating } from './PocketPlayer';
import {
  generateBlueprint,
  scoreProsody,
  scoreLineWords,
  buildSyllableMap,
  type ProsodyBlueprint,
  type VibeSelection,
  type WordAlignment,
} from '../lib/prosody';
import {
  createKit,
  stopPlayback,
  playSyllableWalk,
  cleanup,
  type SyllableHighlight,
} from '../lib/pocketPlayer';
import { AlertCircle, CheckCircle2, Info, Copy, Sparkles, Save, Wand2, Activity } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, setDoc, addDoc, collection } from 'firebase/firestore';

// ─── Dynamic CSS for gutter decorations ─────────────────────────────
// We inject CSS rules dynamically for each line's syllable count and rhyme letter.
// Monaco decorations use linesDecorationsClassName with ::before/::after pseudo-elements.

let _gutterStyleSheet: CSSStyleSheet | null = null;
function getGutterStyleSheet(): CSSStyleSheet {
  if (_gutterStyleSheet) return _gutterStyleSheet;
  const style = document.createElement('style');
  style.id = 'lyric-gutter-styles';
  document.head.appendChild(style);
  _gutterStyleSheet = style.sheet!;
  return _gutterStyleSheet;
}

function clearGutterStyles() {
  const sheet = getGutterStyleSheet();
  while (sheet.cssRules.length > 0) {
    sheet.deleteRule(0);
  }
}

// ─── Pocket mode word color CSS classes ─────────────────────────────

const POCKET_WORD_COLORS: Record<WordAlignment, string> = {
  match: '#4ade80',  // green
  close: '#fbbf24',  // amber
  fight: '#f87171',  // red
  rest: '#52525b',   // dim gray
};

export function LyricEditor() {
  const { lyrics, setLyrics, currentTemplateId, stylePrompt, setStylePrompt, user, currentProjectId, setCurrentProjectId, lyricIssues } = useStore();
  const { currentArrangementId, showBarAnnotations, rhymeAnalyses, mappedLines, pocketModeActive, setPocketModeActive } = useArrangementStore();
  const monaco = useMonaco();
  const editorRef = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);
  const playheadDecorRef = useRef<string[]>([]);
  const [validation, setValidation] = useState({ isValid: true, errors: [] as string[], warnings: [] as string[] });
  const [lineStats, setLineStats] = useState<{ line: number; syllables: number; target?: number }[]>([]);
  const [cliches, setCliches] = useState<ClicheMatch[]>([]);
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isFormatting, setIsFormatting] = useState(false);
  const [projectTitle, setProjectTitle] = useState('Untitled Song');
  const [currentEditorLine, setCurrentEditorLine] = useState('');
  const [currentLineNumber, setCurrentLineNumber] = useState(1);

  // Pocket mode state
  const [blueprint, setBlueprint] = useState<ProsodyBlueprint | null>(null);
  const [pocketPlaying, setPocketPlaying] = useState(false);
  const [currentSectionId, setCurrentSectionId] = useState<string | undefined>();
  const [currentVibe, setCurrentVibe] = useState<Partial<VibeSelection>>({});

  // Per-line prosody scores (computed when pocket mode is active)
  const lineProsodyScores = useMemo(() => {
    if (!pocketModeActive || !blueprint) return new Map<number, number>();
    const scores = new Map<number, number>();
    const lines = lyrics.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('[') || /^\(.*\)$/.test(line)) continue;
      const result = scoreProsody(blueprint, lines[i]);
      scores.set(i + 1, result.score); // 1-indexed line number
    }
    return scores;
  }, [pocketModeActive, blueprint, lyrics]);

  // Current line prosody score for floating display
  const currentLineProsodyScore = useMemo(() => {
    return lineProsodyScores.get(currentLineNumber) ?? null;
  }, [lineProsodyScores, currentLineNumber]);

  const rhymeMap = useMemo(() => {
    const map = new Map<number, { group: string, pattern: string, isFirstOfSection: boolean, sectionPattern: string, rhymeType: string }>();
    rhymeAnalyses.forEach(analysis => {
      analysis.lineRhymeGroups.forEach((g, idx) => {
        map.set(g.lineIndex, {
          group: g.group,
          pattern: analysis.pattern,
          isFirstOfSection: idx === 0,
          sectionPattern: analysis.pattern,
          rhymeType: g.rhymeType || 'none',
        });
      });
    });
    return map;
  }, [rhymeAnalyses]);

  useEffect(() => {
    if (monaco) {
      monaco.languages.register({ id: 'suno-lyrics' });
      monaco.languages.setMonarchTokensProvider('suno-lyrics', {
        tokenizer: {
          root: [
            [/\[.*?\]/, 'custom-structural-tag'],
            [/\(.*?\)/, 'custom-performance-cue'],
            [/\|/, 'custom-pipe'],
            [/^\*\*\*.*$/, 'custom-mas-marker'],
          ],
        },
      });

      monaco.editor.defineTheme('suno-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'custom-structural-tag', foreground: '818cf8', fontStyle: 'bold' },
          { token: 'custom-performance-cue', foreground: 'a1a1aa', fontStyle: 'italic' },
          { token: 'custom-pipe', foreground: 'f472b6' },
          { token: 'custom-mas-marker', foreground: 'fbbf24', fontStyle: 'bold' },
        ],
        colors: {
          'editor.background': '#18181b',
          'editor.lineHighlightBackground': '#27272a50',
          'editorLineNumber.foreground': '#52525b',
          'editorGutter.background': '#18181b',
        },
      });
    }
  }, [monaco]);

  // ─── Syllable color logic ───────────────────────────────────────────
  const getSyllableColorHex = (actual: number, target?: number): string => {
    if (target === undefined || actual === 0) return '#71717a'; // zinc-500
    const diff = Math.abs(actual - target);
    if (diff === 0) return '#34d399'; // emerald-400
    if (diff === 1) return '#fbbf24'; // amber-400
    return '#f87171'; // red-400
  };

  const RHYME_COLORS: Record<string, string> = {
    A: '#60a5fa', B: '#34d399', C: '#c084fc', D: '#fbbf24',
    E: '#f472b6', F: '#22d3ee', G: '#fb7185',
  };

  const getProsodyScoreColor = (score: number): string => {
    if (score >= 80) return '#4ade80'; // green
    if (score >= 50) return '#fbbf24'; // amber
    return '#f87171'; // red
  };

  // ─── Update all decorations (clichés, issues, syllable gutter, rhyme gutter, pocket) ──
  const updateDecorations = () => {
    if (!editorRef.current || !monaco) return;

    const model = editorRef.current.getModel();
    if (!model) return;
    const totalLines = model.getLineCount();

    // Clear and rebuild gutter CSS
    clearGutterStyles();
    const sheet = getGutterStyleSheet();

    const newDecorations: any[] = [];

    // Cliché decorations
    for (const match of cliches) {
      if (match.line > totalLines) continue;
      newDecorations.push({
        range: new monaco.Range(match.line, match.startCol, match.line, match.endCol),
        options: {
          isWholeLine: false,
          className: 'cliche-highlight',
          hoverMessage: { value: '**AI Slop Detected:** This phrase is heavily overused in AI-generated lyrics.' },
        },
      });
    }

    // Issue decorations
    for (const issue of lyricIssues) {
      if (issue.line > totalLines) continue;
      const lineContent = model.getLineContent(issue.line) || '';
      newDecorations.push({
        range: new monaco.Range(issue.line, 1, issue.line, lineContent.length + 1),
        options: {
          isWholeLine: true,
          className: `issue-bg-${issue.severity}`,
          inlineClassName: `issue-squiggly-${issue.severity}`,
          hoverMessage: { value: `**${issue.severity.toUpperCase()}**: ${issue.issue}\n\n*Suggestion:* ${issue.suggestion}` },
        },
      });
    }

    // Section background color decorations
    for (const ml of mappedLines) {
      if (!ml.sectionType || ml.isBlankLine) continue;
      const lineNum = ml.lineIndex + 1;
      if (lineNum > totalLines) continue;
      const bgColor = SECTION_BG_COLORS[ml.sectionType as SectionType];
      if (!bgColor) continue;
      const opacity = ml.isStructuralTag ? 3 : 1;
      const sectionBgClass = `section-bg-${ml.sectionType}-${opacity}`;
      try {
        sheet.insertRule(`.${sectionBgClass} { background-color: ${bgColor.replace('0.08', ml.isStructuralTag ? '0.15' : '0.08')}; }`, sheet.cssRules.length);
      } catch { /* ignore duplicates */ }

      newDecorations.push({
        range: new monaco.Range(lineNum, 1, lineNum, 1),
        options: { isWholeLine: true, className: sectionBgClass },
      });
    }

    // Rhyme end-word inline coloring (skip when pocket mode colors words)
    if (!pocketModeActive) {
      for (const [lineIndex, info] of rhymeMap.entries()) {
        if (info.group === '-') continue;
        const lineNum = lineIndex + 1;
        if (lineNum > totalLines) continue;
        const lineContent = model.getLineContent(lineNum) || '';
        const endWordMatch = lineContent.match(/\b\w+\b[^\w]*$/);
        if (!endWordMatch) continue;
        const startCol = endWordMatch.index! + 1;
        const endCol = startCol + endWordMatch[0].replace(/[^\w]+$/, '').length;
        newDecorations.push({
          range: new monaco.Range(lineNum, startCol, lineNum, endCol),
          options: {
            isWholeLine: false,
            inlineClassName: `rhyme-group-${info.group}`,
            hoverMessage: { value: `**Rhyme Group ${info.group}** (${info.rhymeType})\nSection Pattern: ${info.sectionPattern}` },
          },
        });
      }
    }

    // ─── Pocket mode: word-level stress coloring ─────────────────────
    if (pocketModeActive && blueprint) {
      for (let lineNum = 1; lineNum <= totalLines; lineNum++) {
        const lineContent = model.getLineContent(lineNum) || '';
        const wordAlignments = scoreLineWords(blueprint, lineContent);

        for (const wa of wordAlignments) {
          const color = POCKET_WORD_COLORS[wa.alignment];
          const className = `pocket-word-${lineNum}-${wa.startCol}`;
          try {
            sheet.insertRule(`.${className} { color: ${color} !important; }`, sheet.cssRules.length);
          } catch { /* ignore */ }

          const hoverText = wa.alignment === 'match'
            ? `Stress match: "${wa.word}" lands on correct beat`
            : wa.alignment === 'close'
            ? `Close: "${wa.word}" slightly off beat`
            : wa.alignment === 'fight'
            ? `Fights pocket: "${wa.word}" (${wa.actualStress === 'S' ? 'stressed' : 'unstressed'} word on ${wa.stressType === 'S' ? 'strong' : 'weak'} beat)`
            : '';

          newDecorations.push({
            range: new monaco.Range(lineNum, wa.startCol, lineNum, wa.endCol),
            options: {
              isWholeLine: false,
              inlineClassName: className,
              ...(hoverText ? { hoverMessage: { value: hoverText } } : {}),
            },
          });
        }
      }
    }

    // ─── Syllable count + Prosody score gutter decorations ───────────
    for (const stat of lineStats) {
      const lineNum = stat.line;
      if (stat.syllables <= 0 || lineNum > totalLines) continue;

      // Build gutter text: syllable count + optional prosody score
      const prosodyScore = pocketModeActive ? lineProsodyScores.get(lineNum) : undefined;
      let sylText: string;
      let sylColor: string;

      if (prosodyScore !== undefined) {
        // Format: "9 ●85"
        const scoreColor = getProsodyScoreColor(prosodyScore);
        const sylCountColor = getSyllableColorHex(stat.syllables, stat.target);
        const sylClassName = `syl-gutter-${lineNum}`;

        // Two-part gutter: syllable count in its color, bullet+score in score color
        const countPart = stat.target !== undefined
          ? `${stat.syllables}/${stat.target}`
          : `${stat.syllables}`;

        try {
          sheet.insertRule(`.${sylClassName}::before { content: '${countPart} \\25CF${prosodyScore}'; color: ${scoreColor}; font-size: 10px; font-family: 'JetBrains Mono', monospace; font-weight: 700; display: flex; align-items: center; justify-content: flex-end; width: 100%; height: 100%; padding-right: 4px; }`, sheet.cssRules.length);
        } catch { /* ignore */ }

        newDecorations.push({
          range: new monaco.Range(lineNum, 1, lineNum, 1),
          options: { glyphMarginClassName: sylClassName },
        });
      } else {
        // Standard syllable display
        sylText = stat.target !== undefined
          ? `'${stat.syllables}/${stat.target}'`
          : `'${stat.syllables}'`;
        sylColor = getSyllableColorHex(stat.syllables, stat.target);
        const sylClassName = `syl-gutter-${lineNum}`;

        try {
          sheet.insertRule(`.${sylClassName}::before { content: ${sylText}; color: ${sylColor}; font-size: 11px; font-family: 'JetBrains Mono', monospace; font-weight: ${stat.target !== undefined && stat.syllables === stat.target ? '700' : '400'}; display: flex; align-items: center; justify-content: flex-end; width: 100%; height: 100%; padding-right: 6px; }`, sheet.cssRules.length);
        } catch { /* ignore */ }

        newDecorations.push({
          range: new monaco.Range(lineNum, 1, lineNum, 1),
          options: { glyphMarginClassName: sylClassName },
        });
      }

      // Rhyme letter — shown after line content via afterContentClassName
      const rhymeInfo = rhymeMap.get(lineNum - 1);
      if (rhymeInfo && rhymeInfo.group !== '-') {
        const rhymeColor = RHYME_COLORS[rhymeInfo.group] || '#71717a';
        const typeIndicator = rhymeInfo.rhymeType === 'perfect' ? '' :
          rhymeInfo.rhymeType === 'family' ? '~' :
          rhymeInfo.rhymeType === 'slant' ? '≈' :
          rhymeInfo.rhymeType === 'assonance' ? '≈' : '';
        const rhymeLabel = rhymeInfo.isFirstOfSection
          ? `'  ${typeIndicator}${rhymeInfo.group} ${rhymeInfo.sectionPattern}'`
          : `'  ${typeIndicator}${rhymeInfo.group}'`;
        const opacity = rhymeInfo.rhymeType === 'perfect' ? '1' :
          rhymeInfo.rhymeType === 'family' ? '0.85' : '0.65';
        const weight = rhymeInfo.rhymeType === 'perfect' ? '700' : '500';
        const rhymeClassName = `rhyme-after-${lineNum}`;
        try {
          sheet.insertRule(`.${rhymeClassName}::after { content: ${rhymeLabel}; color: ${rhymeColor}; font-size: 11px; font-family: 'JetBrains Mono', monospace; font-weight: ${weight}; opacity: ${opacity}; }`, sheet.cssRules.length);
        } catch { /* ignore */ }

        const lc = model.getLineContent(lineNum) || '';
        newDecorations.push({
          range: new monaco.Range(lineNum, lc.length + 1, lineNum, lc.length + 1),
          options: { afterContentClassName: rhymeClassName },
        });
      }
    }

    decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, newDecorations);
  };

  // ─── Playhead highlight decoration ─────────────────────────────────
  const applyPlayheadHighlight = useCallback((highlight: SyllableHighlight | null) => {
    if (!editorRef.current || !monaco) return;

    if (!highlight) {
      playheadDecorRef.current = editorRef.current.deltaDecorations(playheadDecorRef.current, []);
      return;
    }

    const newDecor = [{
      range: new monaco.Range(highlight.lineNumber, highlight.charStart, highlight.lineNumber, highlight.charEnd),
      options: {
        isWholeLine: false,
        inlineClassName: highlight.stressType === 'S' ? 'pocket-playhead-stressed' : 'pocket-playhead-unstressed',
      },
    }];
    playheadDecorRef.current = editorRef.current.deltaDecorations(playheadDecorRef.current, newDecor);

    // Auto-scroll to keep playhead visible
    editorRef.current.revealLineInCenterIfOutsideViewport(highlight.lineNumber);
  }, [monaco]);

  // ─── Pocket mode play handler ──────────────────────────────────────
  const handlePocketPlay = useCallback((kit: ReturnType<typeof createKit>, bpm: number, loop: boolean) => {
    if (!blueprint) return;

    // Build syllable map for current section or all lyrics
    const syllablePositions = buildSyllableMap(lyrics, blueprint, bpm, mappedLines);

    // Filter to current section if we have one
    let sectionSyllables = syllablePositions;
    if (currentSectionId) {
      const filtered = syllablePositions.filter(s => s.sectionId === currentSectionId);
      if (filtered.length > 0) sectionSyllables = filtered;
    }

    if (sectionSyllables.length === 0) return;

    // Normalize time offsets to start from 0
    const minTime = sectionSyllables[0].timeOffset;
    const normalized = sectionSyllables.map(s => ({
      ...s,
      timeOffset: s.timeOffset - minTime,
    }));

    setPocketPlaying(true);
    playSyllableWalk(normalized, bpm, kit, loop, applyPlayheadHighlight, () => {
      setPocketPlaying(false);
    });
  }, [blueprint, lyrics, mappedLines, currentSectionId, applyPlayheadHighlight]);

  const handlePocketStop = useCallback(() => {
    stopPlayback();
    setPocketPlaying(false);
    applyPlayheadHighlight(null);
  }, [applyPlayheadHighlight]);

  const handleEditorChange = (value: string | undefined) => {
    const val = value || '';
    setLyrics(val);
    setValidation(validateSunoTags(val));

    const clicheMatches = findCliches(val);
    setCliches(clicheMatches);

    const lines = val.split('\n');
    const template = currentTemplateId ? TEMPLATES[currentTemplateId] : null;
    let structuralLineCount = 0;

    const stats = lines.map((line, index) => {
      const isStructural = line.trim().startsWith('[');
      const syllables = countLineSyllables(line);
      let target;
      if (!isStructural && line.trim().length > 0 && template) {
        target = template.pocketMap[structuralLineCount];
        structuralLineCount++;
      }
      return { line: index + 1, syllables, target };
    });
    setLineStats(stats);

    useArrangementStore.getState().recomputeMapping(val);
  };

  useEffect(() => {
    handleEditorChange(lyrics);
  }, [currentTemplateId]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => updateDecorations());
    return () => cancelAnimationFrame(raf);
  }, [lyricIssues, cliches, rhymeMap, lineStats, mappedLines, pocketModeActive, blueprint, lineProsodyScores]);

  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;
    handleEditorChange(lyrics);

    useStore.getState().setEditorScrollToLine((line: number) => {
      editor.revealLineInCenter(line);
      editor.setPosition({ lineNumber: line, column: 1 });
      editor.focus();
    });

    // Track current line for pocket scoring and section-aware vibes
    editor.onDidChangeCursorPosition((e: any) => {
      const model = editor.getModel();
      if (model) {
        const lineContent = model.getLineContent(e.position.lineNumber) || '';
        setCurrentEditorLine(lineContent);
        setCurrentLineNumber(e.position.lineNumber);

        // Determine which section the cursor is in
        const lineIdx = e.position.lineNumber - 1;
        const ml = mappedLines.find(m => m.lineIndex === lineIdx);
        if (ml?.sectionId && ml.sectionId !== currentSectionId) {
          setCurrentSectionId(ml.sectionId);
        }
      }
    });
  };

  useEffect(() => {
    return () => {
      useStore.getState().setEditorScrollToLine(null);
      cleanup();
    };
  }, []);

  const handleExport = () => {
    const arrangementState = useArrangementStore.getState();
    const arrangement = arrangementState.currentArrangementId
      ? selectCurrentArrangement(arrangementState)
      : null;
    const exportText = arrangement
      ? exportForSuno(lyrics, arrangement, stylePrompt, arrangementState.showBarAnnotations)
      : `STYLE OF MUSIC:\n${stylePrompt}\n\nCUSTOM LYRICS:\n${lyrics}`;
    navigator.clipboard.writeText(exportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    const projectData = {
      uid: user.uid,
      title: projectTitle,
      lyrics,
      stylePrompt,
      templateId: currentTemplateId,
      updatedAt: Date.now(),
    };
    try {
      if (currentProjectId) {
        await setDoc(doc(db, 'projects', currentProjectId), projectData, { merge: true });
      } else {
        const newDoc = await addDoc(collection(db, 'projects'), {
          ...projectData,
          createdAt: Date.now(),
        });
        setCurrentProjectId(newDoc.id);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'projects');
    } finally {
      setIsSaving(false);
    }
  };

  const handleFormatForSuno = async () => {
    if (!lyrics.trim()) return;
    setIsFormatting(true);
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: (import.meta as any).env.VITE_GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: `You are a lyric formatting assistant for Suno AI.
Format the following lyrics perfectly for Suno.

RULES:
1. Ensure standard structural tags are present and bracketed (e.g., [Verse 1], [Chorus], [Bridge], [Outro]). Add them if they are missing but logically belong there.
2. Ensure there is a blank line between sections.
3. Remove any weird characters or non-standard punctuation that might confuse a TTS engine.
4. DO NOT rewrite the actual lyrics, just fix the structure, spacing, and tags.
5. Output ONLY the formatted lyrics, nothing else.

Lyrics:
${lyrics}`
      });
      if (response.text) {
        const formatted = response.text.trim();
        handleEditorChange(formatted);
      }
    } catch (error) {
      console.error('Error formatting lyrics:', error);
    } finally {
      setIsFormatting(false);
    }
  };

  const activeTemplate = currentTemplateId ? TEMPLATES[currentTemplateId] : null;

  return (
    <div className="flex-1 flex flex-col h-full relative overflow-hidden">
      <style>{`
        .cliche-highlight {
          background-color: rgba(234, 179, 8, 0.2);
          border-bottom: 2px dotted #eab308;
        }
        .issue-bg-error { background-color: rgba(239, 68, 68, 0.1); }
        .issue-bg-warning { background-color: rgba(245, 158, 11, 0.1); }
        .issue-bg-info { background-color: rgba(59, 130, 246, 0.1); }
        .issue-squiggly-error { text-decoration: underline wavy #ef4444; }
        .issue-squiggly-warning { text-decoration: underline wavy #f59e0b; }
        .issue-squiggly-info { text-decoration: underline wavy #3b82f6; }
        .rhyme-group-A { color: #60a5fa; font-weight: 500; }
        .rhyme-group-B { color: #34d399; font-weight: 500; }
        .rhyme-group-C { color: #c084fc; font-weight: 500; }
        .rhyme-group-D { color: #fbbf24; font-weight: 500; }
        .rhyme-group-E { color: #f472b6; font-weight: 500; }
        .rhyme-group-F { color: #22d3ee; font-weight: 500; }
        .rhyme-group-G { color: #fb7185; font-weight: 500; }
        .pocket-playhead-stressed {
          background-color: rgba(99, 102, 241, 0.35);
          border-bottom: 2px solid #818cf8;
          transition: background-color 0.05s;
        }
        .pocket-playhead-unstressed {
          background-color: rgba(99, 102, 241, 0.15);
          border-bottom: 1px solid #6366f180;
          transition: background-color 0.05s;
        }
      `}</style>
      <div className="flex flex-wrap items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-950/50 gap-2">
        <div className="flex flex-wrap items-center gap-4">
          <input
            type="text"
            value={projectTitle}
            onChange={(e) => setProjectTitle(e.target.value)}
            className="bg-transparent text-sm font-medium text-zinc-200 focus:outline-none focus:border-b focus:border-indigo-500 w-48"
            placeholder="Project Title"
          />
          <div className="flex items-center gap-2 text-xs">
            {validation.isValid ? (
              <span className="flex items-center gap-1 text-emerald-400">
                <CheckCircle2 className="w-3 h-3" /> Valid Suno Format
              </span>
            ) : (
              <span className="flex items-center gap-1 text-red-400">
                <AlertCircle className="w-3 h-3" /> Format Errors ({validation.errors.length})
              </span>
            )}
            {validation.warnings.length > 0 && (
              <span className="flex items-center gap-1 text-amber-400 ml-2">
                <Info className="w-3 h-3" /> Warnings ({validation.warnings.length})
              </span>
            )}
            {cliches.length > 0 && (
              <span className="flex items-center gap-1 text-yellow-500 ml-2">
                <Sparkles className="w-3 h-3" /> AI Slop ({cliches.length})
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Pocket Mode Toggle */}
          <button
            onClick={() => setPocketModeActive(!pocketModeActive)}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              pocketModeActive
                ? 'bg-indigo-500 text-white hover:bg-indigo-600'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
            }`}
            title="Toggle Pocket Mode — color-code words by stress alignment"
          >
            <Activity className="w-3.5 h-3.5" />
            Pocket
          </button>

          <button
            onClick={handleFormatForSuno}
            disabled={isFormatting || !lyrics.trim()}
            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-md transition-colors disabled:opacity-50"
            title="Clean up tags and spacing for Suno"
          >
            {isFormatting ? (
              <div className="w-3.5 h-3.5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Wand2 className="w-3.5 h-3.5" />
            )}
            Format
          </button>
          {user && (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-md transition-colors disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          )}
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-medium rounded-md transition-colors"
          >
            {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied!' : 'Copy for Suno'}
          </button>
        </div>
      </div>

      {/* Style Prompt Area */}
      <div className="p-4 border-b border-zinc-800 bg-zinc-950/30">
        <div className="flex justify-between items-end mb-2">
          <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Suno Style Prompt
          </label>
          {activeTemplate && (
            <span className="text-[10px] text-zinc-500 max-w-md text-right">
              {activeTemplate.description}
            </span>
          )}
        </div>
        <textarea
          value={stylePrompt}
          onChange={(e) => setStylePrompt(e.target.value)}
          placeholder="e.g. Progressive house, 128 BPM, euphoric synth leads..."
          className="w-full bg-zinc-900 border border-zinc-800 rounded-md p-2 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none h-16"
        />
      </div>

      <ArrangementStatusBar />

      {/* Monaco Editor with floating pocket controls */}
      <div className="flex-1 relative overflow-hidden">
        <Editor
          height="100%"
          defaultLanguage="suno-lyrics"
          theme="suno-dark"
          value={lyrics}
          onChange={handleEditorChange}
          onMount={handleEditorDidMount}
          options={{
            minimap: { enabled: false },
            wordWrap: 'on',
            lineNumbers: 'off',
            glyphMargin: true,
            glyphMarginWidth: pocketModeActive ? 80 : 64,
            folding: false,
            lineDecorationsWidth: 0,
            lineNumbersMinChars: 0,
            fontSize: 14,
            fontFamily: 'JetBrains Mono, monospace',
            padding: { top: 16, bottom: 16 },
            scrollBeyondLastLine: false,
            renderLineHighlight: 'all',
            contextmenu: true,
          }}
        />

        {/* Floating Pocket Player Controls */}
        {pocketModeActive && (
          <PocketPlayerFloating
            prosodyScore={currentLineProsodyScore}
            onPlay={handlePocketPlay}
            onStop={handlePocketStop}
            isPlaying={pocketPlaying}
            blueprint={blueprint}
            onBlueprintChange={setBlueprint}
            onVibeChange={setCurrentVibe}
            currentSectionId={currentSectionId}
          />
        )}
      </div>

      {/* Validation Panel (Bottom) */}
      {(validation.errors.length > 0 || validation.warnings.length > 0 || cliches.length > 0) && (
        <div className="h-48 border-t border-zinc-800 bg-zinc-950 p-4 overflow-y-auto">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Validation Issues</h3>
          <ul className="space-y-2 text-sm">
            {validation.errors.map((err, i) => (
              <li key={`err-${i}`} className="flex items-start gap-2 text-red-400">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{err}</span>
              </li>
            ))}
            {validation.warnings.map((warn, i) => (
              <li key={`warn-${i}`} className="flex items-start gap-2 text-amber-400">
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{warn}</span>
              </li>
            ))}
            {cliches.map((cliche, i) => (
              <li key={`cliche-${i}`} className="flex items-start gap-2 text-yellow-500">
                <Sparkles className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>Line {cliche.line}: Overused AI phrase "{cliche.phrase}"</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

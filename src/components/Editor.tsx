import { useRef, useEffect, useState, useMemo } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import { useStore, TEMPLATES } from '../store/useStore';
import { countLineSyllables } from '../lib/syllables';
import { validateSunoTags } from '../lib/suno';
import { findCliches, ClicheMatch } from '../lib/cliches';
import { useArrangementStore, selectCurrentArrangement } from '../store/arrangementStore';
import { exportForSuno } from '../lib/arrangement';
import { ArrangementStatusBar } from './ArrangementStatusBar';
import { AlertCircle, CheckCircle2, Info, Copy, Sparkles, Save, Wand2 } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, setDoc, addDoc, collection } from 'firebase/firestore';

export function LyricEditor() {
  const { lyrics, setLyrics, currentTemplateId, stylePrompt, setStylePrompt, user, currentProjectId, setCurrentProjectId, lyricIssues } = useStore();
  const { currentArrangementId, showBarAnnotations, rhymeAnalyses } = useArrangementStore();
  const monaco = useMonaco();
  const editorRef = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);
  const [validation, setValidation] = useState({ isValid: true, errors: [] as string[], warnings: [] as string[] });
  const [lineStats, setLineStats] = useState<{ line: number; syllables: number; target?: number }[]>([]);
  const [cliches, setCliches] = useState<ClicheMatch[]>([]);
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isFormatting, setIsFormatting] = useState(false);
  const [projectTitle, setProjectTitle] = useState('Untitled Song');

  const rhymeMap = useMemo(() => {
    const map = new Map<number, { group: string, pattern: string, isFirstOfSection: boolean, sectionPattern: string }>();
    rhymeAnalyses.forEach(analysis => {
      analysis.lineRhymeGroups.forEach((g, idx) => {
        map.set(g.lineIndex, {
          group: g.group,
          pattern: analysis.pattern,
          isFirstOfSection: idx === 0,
          sectionPattern: analysis.pattern
        });
      });
    });
    return map;
  }, [rhymeAnalyses]);

  useEffect(() => {
    if (monaco) {
      // Register a custom language for Suno lyrics
      monaco.languages.register({ id: 'suno-lyrics' });

      // Define syntax highlighting rules
      monaco.languages.setMonarchTokensProvider('suno-lyrics', {
        tokenizer: {
          root: [
            // Structural tags: [Verse 1], [Chorus]
            [/\[.*?\]/, 'custom-structural-tag'],
            // Performance cues: (whispered)
            [/\(.*?\)/, 'custom-performance-cue'],
            // Pipe separators
            [/\|/, 'custom-pipe'],
            // Master Arrangement Summary marker
            [/^\*\*\*.*$/, 'custom-mas-marker'],
          ],
        },
      });

      // Define a custom theme
      monaco.editor.defineTheme('suno-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'custom-structural-tag', foreground: '818cf8', fontStyle: 'bold' }, // Indigo 400
          { token: 'custom-performance-cue', foreground: 'a1a1aa', fontStyle: 'italic' }, // Zinc 400
          { token: 'custom-pipe', foreground: 'f472b6' }, // Pink 400
          { token: 'custom-mas-marker', foreground: 'fbbf24', fontStyle: 'bold' }, // Amber 400
        ],
        colors: {
          'editor.background': '#18181b', // Zinc 900
          'editor.lineHighlightBackground': '#27272a50',
          'editorLineNumber.foreground': '#52525b',
          'editorGutter.background': '#18181b',
        },
      });
    }
  }, [monaco]);

  const updateDecorations = () => {
    if (!editorRef.current || !monaco) return;

    const newDecorations = [
      ...cliches.map(match => ({
        range: new monaco.Range(match.line, match.startCol, match.line, match.endCol),
        options: {
          isWholeLine: false,
          className: 'cliche-highlight',
          hoverMessage: { value: '**AI Slop Detected:** This phrase is heavily overused in AI-generated lyrics. Consider replacing it with something more specific.' }
        }
      })),
      ...lyricIssues.map(issue => {
        const lineContent = editorRef.current.getModel()?.getLineContent(issue.line) || '';
        return {
          range: new monaco.Range(issue.line, 1, issue.line, lineContent.length + 1),
          options: {
            isWholeLine: true,
            className: `issue-bg-${issue.severity}`,
            inlineClassName: `issue-squiggly-${issue.severity}`,
            hoverMessage: { value: `**${issue.severity.toUpperCase()}**: ${issue.issue}\n\n*Suggestion:* ${issue.suggestion}` }
          }
        };
      }),
      // Add rhyme end-word decorations
      ...Array.from(rhymeMap.entries()).flatMap(([lineIndex, info]) => {
        if (info.group === '-') return [];
        const lineNum = lineIndex + 1;
        const lineContent = editorRef.current.getModel()?.getLineContent(lineNum) || '';
        const endWordMatch = lineContent.match(/\b\w+\b[^\w]*$/);
        if (!endWordMatch) return [];
        
        const startCol = endWordMatch.index! + 1;
        const endCol = startCol + endWordMatch[0].replace(/[^\w]+$/, '').length;
        
        return [{
          range: new monaco.Range(lineNum, startCol, lineNum, endCol),
          options: {
            isWholeLine: false,
            inlineClassName: `rhyme-group-${info.group}`,
            hoverMessage: { value: `**Rhyme Group ${info.group}**\nSection Pattern: ${info.sectionPattern}` }
          }
        }];
      })
    ];

    decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, newDecorations);
  };

  const handleEditorChange = (value: string | undefined) => {
    const val = value || '';
    setLyrics(val);
    
    // Validate Suno Tags
    setValidation(validateSunoTags(val));

    // Find Cliches
    const clicheMatches = findCliches(val);
    setCliches(clicheMatches);

    // Calculate syllables per line
    const lines = val.split('\n');
    const template = currentTemplateId ? TEMPLATES[currentTemplateId] : null;
    
    let structuralLineCount = 0; // To track which lines are lyrics vs structural tags
    
    const stats = lines.map((line, index) => {
      const isStructural = line.trim().startsWith('[');
      const syllables = countLineSyllables(line);
      
      let target;
      if (!isStructural && line.trim().length > 0 && template) {
        target = template.pocketMap[structuralLineCount];
        structuralLineCount++;
      }
      
      return {
        line: index + 1,
        syllables,
        target
      };
    });
    setLineStats(stats);

    // Recompute bar-aware arrangement mapping
    useArrangementStore.getState().recomputeMapping(val);
  };

  // Re-calculate when template changes
  useEffect(() => {
    handleEditorChange(lyrics);
  }, [currentTemplateId]);

  // Re-calculate decorations when lyricIssues, cliches, or rhymeMap changes
  useEffect(() => {
    updateDecorations();
  }, [lyricIssues, cliches, rhymeMap]);

  const gutterRef = useRef<HTMLDivElement>(null);
  const rhymeGutterRef = useRef<HTMLDivElement>(null);

  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;
    handleEditorChange(lyrics); // Initial calculation

    editor.onDidScrollChange((e: any) => {
      if (gutterRef.current) {
        gutterRef.current.scrollTop = e.scrollTop;
      }
      if (rhymeGutterRef.current) {
        rhymeGutterRef.current.scrollTop = e.scrollTop;
      }
    });

    useStore.getState().setEditorScrollToLine((line: number) => {
      editor.revealLineInCenter(line);
      editor.setPosition({ lineNumber: line, column: 1 });
      editor.focus();
    });
  };

  // Clean up the scroll callback when unmounting
  useEffect(() => {
    return () => {
      useStore.getState().setEditorScrollToLine(null);
    };
  }, []);

  const getSyllableColor = (actual: number, target?: number) => {
    if (target === undefined || actual === 0) return 'text-zinc-500';
    const diff = Math.abs(actual - target);
    if (diff === 0) return 'text-emerald-400 font-bold';
    if (diff === 1) return 'text-amber-400';
    return 'text-red-400';
  };

  const getRhymeColor = (group: string) => {
    if (group === '-') return 'text-zinc-600';
    const colors = [
      'text-blue-400',
      'text-emerald-400',
      'text-purple-400',
      'text-amber-400',
      'text-pink-400',
      'text-cyan-400',
      'text-rose-400',
    ];
    const charCode = group.charCodeAt(0) - 65; // A = 0
    return colors[charCode % colors.length];
  };

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
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
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
        setLyrics(response.text.trim());
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

      <div className="flex-1 relative flex overflow-hidden">
        {/* Custom Gutter for Syllable Counts */}
        <div 
          ref={gutterRef}
          className="w-16 bg-zinc-950 border-r border-zinc-800 flex flex-col items-end py-4 pr-2 text-xs font-mono overflow-hidden select-none"
        >
          {lineStats.map((stat, i) => (
            <div key={i} className={`h-[21px] flex items-center justify-end w-full gap-1 ${getSyllableColor(stat.syllables, stat.target)}`}>
              {stat.syllables > 0 ? (
                <>
                  <span>{stat.syllables}</span>
                  {stat.target !== undefined && (
                    <span className="text-zinc-600 text-[10px]">/{stat.target}</span>
                  )}
                </>
              ) : ''}
            </div>
          ))}
        </div>

        {/* Monaco Editor */}
        <div className="flex-1 h-full">
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
              lineNumbers: 'off', // We use our custom gutter
              glyphMargin: false,
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
        </div>

        {/* Rhyme Scheme Gutter (Right) */}
        <div 
          ref={rhymeGutterRef}
          className="w-24 bg-zinc-950 border-l border-zinc-800 flex flex-col items-start pl-3 py-4 text-xs font-mono overflow-hidden select-none"
        >
          {lineStats.map((stat, i) => {
            const rhymeInfo = rhymeMap.get(i);
            return (
              <div key={i} className="h-[21px] flex items-center w-full gap-2">
                {rhymeInfo && (
                  <>
                    <span className={`font-bold ${getRhymeColor(rhymeInfo.group)}`}>
                      {rhymeInfo.group}
                    </span>
                    {rhymeInfo.isFirstOfSection && (
                      <span className={`text-[10px] ${['FREE', 'UNKNOWN'].includes(rhymeInfo.sectionPattern) ? 'text-red-400/80' : 'text-zinc-600'}`}>
                        {rhymeInfo.sectionPattern}
                      </span>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
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

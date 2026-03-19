import React, { useState, useEffect } from 'react';
import { useStore, TEMPLATES } from '../store/useStore';
import { useArrangementStore, selectCurrentArrangement } from '../store/arrangementStore';
import { countLineSyllables } from '../lib/syllables';
import { parseStructuralTag } from '../lib/arrangement';
import { Ruler, Sparkles, Check, X, ArrowRight, AlertTriangle } from 'lucide-react';

interface Mismatch {
  id: string;
  lineIndex: number;
  text: string;
  actual: number;
  target?: number;
  isExtraLine?: boolean;
  sectionName?: string;
  suggestion?: string;
  isFixing?: boolean;
}

export function PocketFitter() {
  const { lyrics, setLyrics, currentTemplateId } = useStore();
  const arrangement = useArrangementStore(selectCurrentArrangement);
  const currentArrangementId = useArrangementStore(s => s.currentArrangementId);
  const [mismatches, setMismatches] = useState<Mismatch[]>([]);

  const oldTemplate = currentTemplateId ? TEMPLATES[currentTemplateId] : null;
  const hasTemplate = !!(oldTemplate || arrangement);
  const templateName = arrangement?.name || oldTemplate?.name || '';

  useEffect(() => {
    if (!lyrics || !hasTemplate) {
      setMismatches([]);
      return;
    }

    const lines = lyrics.split('\n');
    const newMismatches: Mismatch[] = [];

    if (arrangement) {
      // Bar-aware template: use section definitions for syllable targets
      let currentSection: typeof arrangement.sections[0] | null = null;
      let sectionPointer = 0;
      let linesInSection = 0;
      const maxLinesForSection = () =>
        currentSection ? Math.ceil(currentSection.bars * currentSection.linesPerBar) : 0;

      lines.forEach((line, index) => {
        const trimmed = line.trim();
        const tag = parseStructuralTag(trimmed);
        if (tag) {
          // Find matching section in arrangement
          for (let s = sectionPointer; s < arrangement.sections.length; s++) {
            if (arrangement.sections[s].type === tag.type) {
              currentSection = arrangement.sections[s];
              sectionPointer = s + 1;
              linesInSection = 0;
              break;
            }
          }
          return;
        }
        if (!trimmed || /^\([^)]+\)$/.test(trimmed)) return; // skip blanks and call-and-response

        if (currentSection) {
          const actual = countLineSyllables(line);
          const target = currentSection.syllableTarget;
          const tolerance = currentSection.syllableTolerance;
          const max = maxLinesForSection();

          if (max > 0 && linesInSection >= max) {
            newMismatches.push({
              id: Math.random().toString(36).substring(2, 11),
              lineIndex: index, text: line, actual,
              isExtraLine: true, sectionName: currentSection.label,
            });
          } else if (target > 0 && Math.abs(actual - target) > tolerance) {
            newMismatches.push({
              id: Math.random().toString(36).substring(2, 11),
              lineIndex: index, text: line, actual, target,
              sectionName: currentSection.label,
            });
          }
          linesInSection++;
        }
      });
    } else if (oldTemplate) {
      if (oldTemplate.sections) {
        let currentSectionName: string | null = null;
        let currentSectionTemplate: { name: string; lines: number[] } | null = null;
        let lineCountInSection = 0;

        lines.forEach((line, index) => {
          const trimmed = line.trim();
          if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            currentSectionName = trimmed.slice(1, -1).toLowerCase();
            currentSectionTemplate = oldTemplate.sections!.find(s =>
              currentSectionName!.includes(s.name.toLowerCase())
            ) || null;
            lineCountInSection = 0;
          } else if (trimmed.length > 0) {
            if (currentSectionTemplate) {
              const target = currentSectionTemplate.lines[lineCountInSection];
              const actual = countLineSyllables(line);
              if (target === undefined) {
                newMismatches.push({
                  id: Math.random().toString(36).substring(2, 11),
                  lineIndex: index, text: line, actual,
                  isExtraLine: true, sectionName: currentSectionTemplate.name,
                });
              } else if (actual !== target) {
                newMismatches.push({
                  id: Math.random().toString(36).substring(2, 11),
                  lineIndex: index, text: line, actual, target,
                  sectionName: currentSectionTemplate.name,
                });
              }
            }
            lineCountInSection++;
          }
        });
      } else {
        let structuralLineCount = 0;
        lines.forEach((line, index) => {
          const isStructural = line.trim().startsWith('[');
          if (!isStructural && line.trim().length > 0) {
            const target = oldTemplate.pocketMap[structuralLineCount];
            const actual = countLineSyllables(line);
            if (target !== undefined && actual !== target) {
              newMismatches.push({
                id: Math.random().toString(36).substring(2, 11),
                lineIndex: index, text: line, actual, target,
              });
            }
            structuralLineCount++;
          }
        });
      }
    }

    setMismatches(prev => newMismatches.map(newM => {
      const existing = prev.find(p => p.lineIndex === newM.lineIndex && p.text === newM.text);
      return existing ? existing : newM;
    }));
  }, [lyrics, currentTemplateId, currentArrangementId, arrangement]);

  const fixLine = async (mismatch: Mismatch) => {
    if (mismatch.isExtraLine) return; // Can't fix an extra line with AI rewriting

    setMismatches(prev => prev.map(m => m.id === mismatch.id ? { ...m, isFixing: true } : m));
    
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: (import.meta as any).env.VITE_GEMINI_API_KEY });
      
      const lines = lyrics.split('\n');
      const startIdx = Math.max(0, mismatch.lineIndex - 2);
      const endIdx = Math.min(lines.length - 1, mismatch.lineIndex + 2);
      const context = lines.slice(startIdx, endIdx + 1).join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: `You are an expert lyricist and Suno AI whisperer. Rewrite the following line to fit a target of EXACTLY ${mismatch.target} syllables.
Keep the original meaning, emotion, and rhyme scheme (if any).

Original Line (${mismatch.actual} syllables): "${mismatch.text}"
Target: ${mismatch.target} syllables

Context around this line:
${context}

PRO TIP: If the line is too short, you can either rewrite the words, OR keep the words and append a Suno performance cue like "(delay)" or "(echo)" to stretch the vocal timing across the bar.

Output ONLY the rewritten line, nothing else. Do not include quotes or explanations.`,
      });

      if (response.text) {
        setMismatches(prev => prev.map(m => 
          m.id === mismatch.id ? { ...m, suggestion: response.text?.trim(), isFixing: false } : m
        ));
      }
    } catch (error) {
      console.error('Error fixing line:', error);
      setMismatches(prev => prev.map(m => m.id === mismatch.id ? { ...m, isFixing: false } : m));
    }
  };

  const applySuggestion = (mismatch: Mismatch) => {
    if (!mismatch.suggestion) return;
    
    const lines = lyrics.split('\n');
    if (mismatch.lineIndex >= 0 && mismatch.lineIndex < lines.length) {
      lines[mismatch.lineIndex] = mismatch.suggestion;
      setLyrics(lines.join('\n'));
    }
  };

  const removeLine = (mismatch: Mismatch) => {
    const lines = lyrics.split('\n');
    if (mismatch.lineIndex >= 0 && mismatch.lineIndex < lines.length) {
      lines.splice(mismatch.lineIndex, 1);
      setLyrics(lines.join('\n'));
    }
  };

  if (!hasTemplate) {
    return (
      <div className="flex flex-col h-full bg-zinc-950 p-4">
        <div className="text-center text-zinc-500 py-8 flex flex-col items-center">
          <Ruler className="w-8 h-8 opacity-20 mb-3" />
          <p className="text-sm">No template selected.</p>
          <p className="text-xs mt-1 opacity-60">Select a genre template to see syllable targets.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      <div className="p-4 border-b border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
          <Ruler className="w-4 h-4 text-indigo-400" />
          Pocket Fitter
        </h2>
        <p className="text-xs text-zinc-500 mt-1">
          Adapting to: <span className="text-zinc-300">{templateName}</span>
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {mismatches.length === 0 ? (
          <div className="text-center text-zinc-500 py-8 flex flex-col items-center">
            <Check className="w-8 h-8 text-emerald-500/50 mb-3" />
            <p className="text-sm">Perfect fit!</p>
            <p className="text-xs mt-1 opacity-60">All lines match the template's pocket.</p>
          </div>
        ) : (
          mismatches.map((mismatch) => (
            <div key={mismatch.id} className={`p-3 rounded-lg border ${mismatch.isExtraLine ? 'border-amber-500/30 bg-amber-500/5' : 'border-zinc-800 bg-zinc-900/50'}`}>
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-mono text-zinc-500">
                  Line {mismatch.lineIndex + 1} {mismatch.sectionName && `(${mismatch.sectionName})`}
                </span>
                {mismatch.isExtraLine ? (
                  <div className="flex items-center gap-1 text-xs font-medium text-amber-400">
                    <AlertTriangle className="w-3 h-3" />
                    Extra Line
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs font-mono">
                    <span className="text-red-400">{mismatch.actual}</span>
                    <ArrowRight className="w-3 h-3 text-zinc-600" />
                    <span className="text-emerald-400">{mismatch.target}</span>
                  </div>
                )}
              </div>
              
              <div className="text-sm text-zinc-300 mb-3 font-mono">
                {mismatch.text}
              </div>

              {mismatch.isExtraLine ? (
                <div className="mt-2 pt-2 border-t border-amber-500/10">
                  <p className="text-xs text-amber-400/80 mb-2">This line exceeds the expected length of the {mismatch.sectionName}. This often causes Suno to spill over into the next section.</p>
                  <button
                    onClick={() => removeLine(mismatch)}
                    className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-medium rounded transition-colors"
                  >
                    <X className="w-3 h-3" />
                    Remove Line
                  </button>
                </div>
              ) : mismatch.suggestion ? (
                <div className="mt-3 pt-3 border-t border-zinc-800">
                  <p className="text-xs text-indigo-400 font-medium mb-1">Suggestion ({countLineSyllables(mismatch.suggestion)} syl):</p>
                  <div className="flex items-end justify-between gap-3">
                    <div className="flex-1 bg-indigo-500/10 border border-indigo-500/20 rounded p-2 text-sm font-mono text-indigo-200">
                      {mismatch.suggestion}
                    </div>
                    <button
                      onClick={() => applySuggestion(mismatch)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded transition-colors whitespace-nowrap"
                    >
                      <Check className="w-3 h-3 text-emerald-400" />
                      Apply
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => fixLine(mismatch)}
                  disabled={mismatch.isFixing}
                  className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 text-xs font-medium rounded transition-colors"
                >
                  {mismatch.isFixing ? (
                    <div className="w-3 h-3 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3 text-indigo-400" />
                  )}
                  {mismatch.isFixing ? 'Generating...' : 'Fix with AI'}
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

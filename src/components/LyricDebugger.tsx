import React from 'react';
import { useStore, LyricIssue } from '../store/useStore';
import { GoogleGenAI, Type } from '@google/genai';
import { Bug, AlertTriangle, Info, Check, Play, X } from 'lucide-react';

export function LyricDebugger() {
  const { lyrics, setLyrics, lyricIssues, setLyricIssues, isAnalyzing, setIsAnalyzing } = useStore();

  const runAnalysis = async () => {
    if (!lyrics.trim()) return;
    
    setIsAnalyzing(true);
    setLyricIssues([]);

    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: (import.meta as any).env.VITE_GEMINI_API_KEY });
      
      // Add line numbers to help the AI pinpoint issues
      const numberedLyrics = lyrics
        .split('\n')
        .map((line, i) => `${i + 1}: ${line}`)
        .join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: `You are an expert songwriting coach and lyric editor. Analyze the following lyrics line-by-line.
Look for:
1. Clichés and overused phrases (AI slop).
2. Weak rhymes or forced rhymes.
3. Awkward rhythm or meter (does it fail the "One Breath Test"?).
4. "Telling instead of showing" (lack of sensory details).
5. Inconsistent imagery or mixed metaphors.

Provide a structured list of issues found. Only report actual issues; if a line is good, skip it.

Lyrics:
${numberedLyrics}`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            description: "List of issues found in the lyrics.",
            items: {
              type: Type.OBJECT,
              properties: {
                line: { type: Type.INTEGER, description: "The line number of the issue (1-indexed)." },
                originalText: { type: Type.STRING, description: "The original text of the line." },
                issue: { type: Type.STRING, description: "Explanation of the problem (e.g., cliché, weak rhyme, bad rhythm, telling not showing)." },
                suggestion: { type: Type.STRING, description: "A specific, rewritten line that fixes the issue." },
                severity: { type: Type.STRING, description: "Severity of the issue: 'error' (major flaw), 'warning' (could be better), 'info' (nitpick)." }
              },
              required: ["line", "originalText", "issue", "suggestion", "severity"]
            }
          }
        }
      });

      const resultText = response.text || '[]';
      const parsedIssues = JSON.parse(resultText);
      
      const linesCount = lyrics.split('\n').length;
      
      const issuesWithIds = parsedIssues
        .filter((issue: any) => issue.line > 0 && issue.line <= linesCount)
        .map((issue: any) => ({
          ...issue,
          id: Math.random().toString(36).substr(2, 9)
        }));

      setLyricIssues(issuesWithIds);
    } catch (error) {
      console.error('Error analyzing lyrics:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const applySuggestion = (issue: LyricIssue) => {
    const lines = lyrics.split('\n');
    const lineIndex = issue.line - 1;
    
    if (lineIndex >= 0 && lineIndex < lines.length) {
      // Replace the line entirely with the suggestion
      // We do this because the AI might have slightly altered the original text in its response
      lines[lineIndex] = issue.suggestion;
      setLyrics(lines.join('\n'));
      
      // Remove the issue from the list
      dismissIssue(issue.id);
    }
  };

  const dismissIssue = (id: string) => {
    setLyricIssues(lyricIssues.filter(i => i.id !== id));
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'error': return <AlertTriangle className="w-4 h-4 text-red-400" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-amber-400" />;
      case 'info': return <Info className="w-4 h-4 text-blue-400" />;
      default: return <Bug className="w-4 h-4 text-zinc-400" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'error': return 'border-red-500/30 bg-red-500/5';
      case 'warning': return 'border-amber-500/30 bg-amber-500/5';
      case 'info': return 'border-blue-500/30 bg-blue-500/5';
      default: return 'border-zinc-800 bg-zinc-900';
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <Bug className="w-4 h-4 text-indigo-400" />
            Lyric Debugger
          </h2>
          <p className="text-xs text-zinc-500 mt-1">Line-by-line analysis & suggestions</p>
        </div>
        <button
          onClick={runAnalysis}
          disabled={isAnalyzing || !lyrics.trim()}
          className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium rounded-md transition-colors"
        >
          {isAnalyzing ? (
            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Play className="w-3 h-3" />
          )}
          {isAnalyzing ? 'Analyzing...' : 'Run Analysis'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {lyricIssues.length === 0 && !isAnalyzing ? (
          <div className="text-center text-zinc-500 py-8 flex flex-col items-center">
            <Bug className="w-8 h-8 opacity-20 mb-3" />
            <p className="text-sm">No issues found.</p>
            <p className="text-xs mt-1 opacity-60">Run an analysis to debug your lyrics.</p>
          </div>
        ) : (
          lyricIssues.map((issue) => (
            <div 
              key={issue.id} 
              className={`p-3 rounded-lg border ${getSeverityColor(issue.severity)} transition-all`}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  {getSeverityIcon(issue.severity)}
                  <span className="text-xs font-mono text-zinc-400">Line {issue.line}</span>
                </div>
                <button 
                  onClick={() => dismissIssue(issue.id)}
                  className="text-zinc-500 hover:text-zinc-300 transition-colors"
                  title="Dismiss"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              
              <div className="mb-3">
                <p className="text-sm text-zinc-200 mb-1">{issue.issue}</p>
                <div className="bg-zinc-950/50 rounded p-2 text-xs font-mono text-zinc-400 line-through opacity-70">
                  {issue.originalText}
                </div>
              </div>
              
              <div className="flex items-end justify-between gap-3">
                <div className="flex-1">
                  <p className="text-xs text-indigo-400 font-medium mb-1">Suggestion:</p>
                  <div className="bg-indigo-500/10 border border-indigo-500/20 rounded p-2 text-xs font-mono text-indigo-200">
                    {issue.suggestion}
                  </div>
                </div>
                <button
                  onClick={() => applySuggestion(issue)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded transition-colors whitespace-nowrap"
                >
                  <Check className="w-3 h-3 text-emerald-400" />
                  Apply
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

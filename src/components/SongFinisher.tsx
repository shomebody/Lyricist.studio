import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { 
  analyzeSongStructure, 
  analyzeRhymeChains, 
  analyzeSectionIdentity, 
  detectVersionConflicts,
  generateCompletionSuggestions,
  Suggestion
} from '../lib/songAnalysis';
import { 
  CheckCircle2, 
  AlertCircle, 
  Info, 
  Wrench, 
  Sparkles, 
  GitMerge, 
  RefreshCw,
  Activity,
  Music,
  AlignLeft,
  Layers
} from 'lucide-react';

export function SongFinisher({ onAction }: { onAction?: (prompt: string) => void }) {
  const { lyrics } = useStore();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [health, setHealth] = useState<{
    completeness: number;
    chorusConsistency: string;
    rhymeHealth: string;
    sectionBalance: string;
  } | null>(null);

  const analyzeSong = () => {
    const structure = analyzeSongStructure(lyrics);
    const rhymes = analyzeRhymeChains(lyrics);
    const identity = analyzeSectionIdentity(lyrics);
    const conflicts = detectVersionConflicts(lyrics);
    const sugs = generateCompletionSuggestions(lyrics);

    let intactChains = 0;
    let orphans = 0;
    rhymes.forEach(r => {
      const groups = new Set(r.groups.filter(g => g.group !== '-').map(g => g.group));
      intactChains += groups.size;
      orphans += r.orphans.length;
    });

    let flaggedSections = 0;
    identity.forEach(id => {
      if (id.issues.length > 0) flaggedSections++;
    });

    setHealth({
      completeness: structure.completeness,
      chorusConsistency: structure.chorusConsistency 
        ? (structure.chorusConsistency.isIdentical ? 'Identical' : `${structure.chorusConsistency.differingLines} lines differ`)
        : 'N/A',
      rhymeHealth: `${intactChains} chains intact, ${orphans} orphans`,
      sectionBalance: flaggedSections === 0 ? 'All sections doing their job' : `${flaggedSections} sections flagged`
    });

    setSuggestions(sugs);
  };

  useEffect(() => {
    // Auto-analyze on mount or when lyrics change significantly?
    // The prompt says "When the user clicks 'Analyze Song', run all the analysis functions"
    // So we'll wait for the button click.
  }, []);

  const getIconForType = (type: string) => {
    switch (type) {
      case 'structure': return <Layers className="w-5 h-5" />;
      case 'rhyme': return <Music className="w-5 h-5" />;
      case 'identity': return <AlignLeft className="w-5 h-5" />;
      case 'consistency': return <RefreshCw className="w-5 h-5" />;
      case 'conflict': return <GitMerge className="w-5 h-5" />;
      default: return <Activity className="w-5 h-5" />;
    }
  };

  const getColorForSeverity = (severity: string) => {
    switch (severity) {
      case 'error': return 'text-red-400 bg-red-400/10 border-red-400/20';
      case 'warning': return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
      case 'suggestion': return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
      default: return 'text-zinc-400 bg-zinc-800 border-zinc-700';
    }
  };

  const handleAction = (action: any, suggestion: Suggestion) => {
    if (!onAction) return;
    
    if (action.type === 'generate_section') {
      onAction(`Can you help me write a ${action.data.sectionType} for this song? It should fit the existing theme and rhyme scheme.`);
    } else if (action.type === 'fix_rhyme') {
      onAction(`I need a rhyme for "${action.data.word}" on line ${action.data.lineIndex + 1}. What are some good options that fit the context?`);
    } else if (action.type === 'sync_chorus') {
      onAction(`My choruses are slightly different. Can you show me the differences and help me pick the best version to use for all of them?`);
    } else if (action.type === 'resolve_conflict') {
      onAction(`I have multiple versions of ${action.data.tag}. Can you help me compare them and merge the best parts?`);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100 overflow-hidden">
      <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Wrench className="w-5 h-5 text-indigo-400" />
            Song Finisher
          </h2>
          <p className="text-xs text-zinc-400 mt-1">Analyze your song and get actionable feedback to finish it.</p>
        </div>
        <button
          onClick={analyzeSong}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm font-medium transition-colors flex items-center gap-2"
        >
          <Sparkles className="w-4 h-4" />
          Analyze Song
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {health ? (
          <>
            {/* Health Dashboard */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                <div className="text-xs text-zinc-500 mb-1 uppercase tracking-wider font-semibold">Completeness</div>
                <div className="text-lg font-medium text-zinc-200">
                  {Math.min(100, health.completeness)}%
                </div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                <div className="text-xs text-zinc-500 mb-1 uppercase tracking-wider font-semibold">Chorus Consistency</div>
                <div className="text-sm font-medium text-zinc-200 truncate">
                  {health.chorusConsistency}
                </div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                <div className="text-xs text-zinc-500 mb-1 uppercase tracking-wider font-semibold">Rhyme Health</div>
                <div className="text-sm font-medium text-zinc-200 truncate">
                  {health.rhymeHealth}
                </div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                <div className="text-xs text-zinc-500 mb-1 uppercase tracking-wider font-semibold">Section Balance</div>
                <div className="text-sm font-medium text-zinc-200 truncate">
                  {health.sectionBalance}
                </div>
              </div>
            </div>

            {/* Suggestions List */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-2">Action Items</h3>
              
              {suggestions.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 bg-zinc-900/50 rounded-lg border border-zinc-800 border-dashed">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500/50" />
                  <p>Your song looks great! No major issues found.</p>
                </div>
              ) : (
                suggestions.map(suggestion => (
                  <div 
                    key={suggestion.id} 
                    className={`p-4 rounded-lg border ${getColorForSeverity(suggestion.severity)}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {getIconForType(suggestion.type)}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium text-sm mb-1">{suggestion.title}</h4>
                        <p className="text-xs opacity-80 leading-relaxed mb-3">
                          {suggestion.description}
                        </p>
                        {suggestion.action && (
                          <button
                            onClick={() => handleAction(suggestion.action, suggestion)}
                            className="text-xs px-3 py-1.5 bg-black/20 hover:bg-black/40 rounded border border-white/10 transition-colors font-medium"
                          >
                            {suggestion.action.label}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-4">
            <Wrench className="w-12 h-12 opacity-20" />
            <p className="text-sm text-center max-w-[250px]">
              Click "Analyze Song" to scan your lyrics for structural issues, rhyme breaks, and inconsistencies.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

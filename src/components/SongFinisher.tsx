/**
 * SongFinisher.tsx — Deep song analysis panel with inline diffs,
 * collapsible cards, and rich AI fix context.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';
import {
  analyzeSong,
  FullAnalysisResult,
  AnalysisIssue,
  IssueSeverity,
  CompletenessScore,
} from '../lib/songAnalysis';
import {
  AlertTriangle,
  Info,
  CheckCircle2,
  Lightbulb,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Send,
  Wrench,
  BarChart3,
} from 'lucide-react';

// ─── Severity Styling ───────────────────────────────────────────────

const SEVERITY_CONFIG: Record<IssueSeverity, {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  border: string;
  label: string;
}> = {
  error: {
    icon: AlertTriangle,
    color: 'text-red-400',
    bg: 'bg-red-500/5',
    border: 'border-red-500/20',
    label: 'Error',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-amber-400',
    bg: 'bg-amber-500/5',
    border: 'border-amber-500/20',
    label: 'Warning',
  },
  suggestion: {
    icon: Lightbulb,
    color: 'text-blue-400',
    bg: 'bg-blue-500/5',
    border: 'border-blue-500/20',
    label: 'Suggestion',
  },
  info: {
    icon: CheckCircle2,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/5',
    border: 'border-emerald-500/20',
    label: 'Info',
  },
};

// ─── Inline Diff Component ──────────────────────────────────────────

function InlineDiff({
  issue,
  onPickVersion,
  onSendToAI,
}: {
  issue: AnalysisIssue;
  onPickVersion: (version: 'a' | 'b') => void;
  onSendToAI: (prompt: string) => void;
}) {
  const ctx = issue.context;
  if (!ctx?.versionsA || !ctx?.versionsB) return null;

  const linesA = ctx.versionsA.split('\n');
  const linesB = ctx.versionsB.split('\n');
  const maxLen = Math.max(linesA.length, linesB.length);
  const diffSet = new Set((ctx.diffLines || []).map(d => d.lineNum));

  return (
    <div className="mt-2 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {/* Version A */}
        <div className="rounded-md border border-zinc-800 overflow-hidden">
          <div className="px-2 py-1 bg-zinc-800/50 text-[10px] font-semibold text-zinc-400 uppercase">
            Version A
          </div>
          <div className="p-2 space-y-0.5 font-mono text-[11px]">
            {linesA.map((line, i) => (
              <div
                key={i}
                className={`px-1 rounded ${
                  diffSet.has(i + 1) ? 'bg-amber-500/10 text-amber-300' : 'text-zinc-400'
                }`}
              >
                {line || '\u00A0'}
              </div>
            ))}
            {/* Pad if shorter */}
            {Array.from({ length: maxLen - linesA.length }).map((_, i) => (
              <div key={`pad-a-${i}`} className="px-1 text-zinc-700 italic text-[10px]">(missing)</div>
            ))}
          </div>
        </div>

        {/* Version B */}
        <div className="rounded-md border border-zinc-800 overflow-hidden">
          <div className="px-2 py-1 bg-zinc-800/50 text-[10px] font-semibold text-zinc-400 uppercase">
            Version B
          </div>
          <div className="p-2 space-y-0.5 font-mono text-[11px]">
            {linesB.map((line, i) => (
              <div
                key={i}
                className={`px-1 rounded ${
                  diffSet.has(i + 1) ? 'bg-amber-500/10 text-amber-300' : 'text-zinc-400'
                }`}
              >
                {line || '\u00A0'}
              </div>
            ))}
            {Array.from({ length: maxLen - linesB.length }).map((_, i) => (
              <div key={`pad-b-${i}`} className="px-1 text-zinc-700 italic text-[10px]">(missing)</div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onPickVersion('a')}
          className="px-2 py-1 text-[10px] font-medium text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
        >
          Use Version A
        </button>
        <button
          onClick={() => onPickVersion('b')}
          className="px-2 py-1 text-[10px] font-medium text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
        >
          Use Version B
        </button>
        <button
          onClick={() => {
            const prompt = buildMergePrompt(issue);
            onSendToAI(prompt);
          }}
          className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-indigo-400 hover:bg-indigo-500/10 rounded transition-colors"
        >
          <Send className="w-3 h-3" />
          AI Merge
        </button>
      </div>
    </div>
  );
}

// ─── Issue Card Component ───────────────────────────────────────────

const IssueCard: React.FC<{
  issue: AnalysisIssue;
  lyrics: string;
  onSendToAI: (prompt: string) => void;
  onPickVersion: (issue: AnalysisIssue, version: 'a' | 'b') => void;
}> = ({ issue, lyrics, onSendToAI, onPickVersion }) => {
  const [expanded, setExpanded] = useState(false);
  const config = SEVERITY_CONFIG[issue.severity];
  const Icon = config.icon;
  const hasDiff = issue.category === 'chorus-consistency' || issue.category === 'version-conflict';

  return (
    <div className={`border rounded-lg ${config.border} ${config.bg} transition-colors`}>
      {/* Collapsed header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${config.color}`} />
        <span className="flex-1 text-xs font-medium text-zinc-200 truncate">
          {issue.title}
        </span>
        {issue.sectionLabel && (
          <span className="text-[10px] text-zinc-600 flex-shrink-0">
            {issue.sectionLabel}
          </span>
        )}
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-zinc-600 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-zinc-600 flex-shrink-0" />
        )}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-zinc-800/50">
          <p className="text-[11px] text-zinc-400 whitespace-pre-wrap mt-2">
            {issue.description}
          </p>

          {/* Inline diff for chorus consistency / version conflicts */}
          {hasDiff && issue.context?.versionsA && (
            <InlineDiff
              issue={issue}
              onPickVersion={(v) => onPickVersion(issue, v)}
              onSendToAI={onSendToAI}
            />
          )}

          {/* Fix button for non-diff issues */}
          {!hasDiff && issue.severity !== 'info' && (
            <button
              onClick={() => {
                const prompt = buildFixPrompt(issue, lyrics);
                onSendToAI(prompt);
              }}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-indigo-400 hover:bg-indigo-500/10 rounded transition-colors"
            >
              <Send className="w-3 h-3" />
              Send to AI for fix
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Prompt Builders ────────────────────────────────────────────────

function buildFixPrompt(issue: AnalysisIssue, lyrics: string): string {
  const ctx = issue.context;
  const parts: string[] = [
    `I need help fixing a songwriting issue.`,
    ``,
    `**Issue:** ${issue.title}`,
    `**Category:** ${issue.category}`,
    `**Severity:** ${issue.severity}`,
    `**Description:** ${issue.description}`,
  ];

  if (ctx?.sectionLabel) {
    parts.push(``, `**Section:** ${ctx.sectionLabel} (${ctx.sectionType})`);
  }
  if (ctx?.sectionLyrics) {
    parts.push(``, `**Current section lyrics:**`, '```', ctx.sectionLyrics, '```');
  }
  if (ctx?.rhymeScheme) {
    parts.push(`**Rhyme scheme detected:** ${ctx.rhymeScheme}`);
  }
  if (ctx?.syllableCounts) {
    parts.push(`**Syllable counts per line:** ${ctx.syllableCounts.join(', ')}`);
  }

  parts.push(
    ``,
    `**What to preserve:** Keep the overall meaning and any strong imagery. Maintain the section's structural role.`,
    `**What to fix:** ${issue.description}`,
    ``,
    `Please provide 3 alternative versions (A, B, C) that fix this issue while preserving the song's voice.`
  );

  return parts.join('\n');
}

function buildMergePrompt(issue: AnalysisIssue): string {
  const ctx = issue.context;
  return [
    `I have two versions of "${ctx?.sectionLabel || 'a section'}" and need help merging the best parts.`,
    ``,
    `**Version A:**`,
    '```',
    ctx?.versionsA || '',
    '```',
    ``,
    `**Version B:**`,
    '```',
    ctx?.versionsB || '',
    '```',
    ``,
    ctx?.diffLines && ctx.diffLines.length > 0
      ? `**Lines that differ:** ${ctx.diffLines.map(d => `Line ${d.lineNum}`).join(', ')}`
      : '',
    ``,
    `Please create 3 merged versions (A, B, C) that combine the strongest lines from each. Keep the section's structural role (${ctx?.sectionType || 'unknown'}) in mind — ${
      ctx?.sectionType === 'chorus'
        ? 'choruses should be simple, repetitive, and singable'
        : 'maintain the section\'s energy and purpose'
    }.`,
  ].filter(Boolean).join('\n');
}

// ─── Completeness Bar ───────────────────────────────────────────────

function CompletenessBar({ score }: { score: CompletenessScore }) {
  const color =
    score.score >= 80 ? 'bg-emerald-500' :
    score.score >= 50 ? 'bg-amber-500' :
    'bg-red-500';

  return (
    <div className="p-3 border-b border-zinc-800">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
          <BarChart3 className="w-3 h-3" />
          Structure
        </span>
        <span className="text-xs font-bold text-zinc-300">{score.score}%</span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-500`}
          style={{ width: `${score.score}%` }}
        />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {score.present.map((s, i) => (
          <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
            {s}
          </span>
        ))}
        {score.missing.map((s, i) => (
          <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">
            {s}
          </span>
        ))}
        {score.extras.map((s, i) => (
          <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export function SongFinisher() {
  const { lyrics, addMessage, setLyrics } = useStore();
  const [result, setResult] = useState<FullAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState<IssueSeverity | 'all'>('all');

  const runAnalysis = useCallback(() => {
    if (!lyrics.trim()) {
      setResult(null);
      return;
    }
    setIsAnalyzing(true);
    // Use requestAnimationFrame to avoid blocking UI
    requestAnimationFrame(() => {
      const analysisResult = analyzeSong(lyrics);
      setResult(analysisResult);
      setIsAnalyzing(false);
    });
  }, [lyrics]);

  // Auto-analyze on mount and when lyrics change (debounced)
  useEffect(() => {
    const timer = setTimeout(runAnalysis, 500);
    return () => clearTimeout(timer);
  }, [lyrics, runAnalysis]);

  const handleSendToAI = (prompt: string) => {
    addMessage({
      id: Date.now().toString(),
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
    });
  };

  const handlePickVersion = (issue: AnalysisIssue, version: 'a' | 'b') => {
    const ctx = issue.context;
    if (!ctx?.versionsA || !ctx?.versionsB) return;

    const chosen = version === 'a' ? ctx.versionsA : ctx.versionsB;
    const other = version === 'a' ? ctx.versionsB : ctx.versionsA;

    // Replace the "other" version's text in the lyrics with the chosen version
    // Find the other version in the lyrics and replace with chosen
    const newLyrics = lyrics.replace(other, chosen);
    if (newLyrics !== lyrics) {
      setLyrics(newLyrics);
    }
  };

  const filteredIssues = result?.issues.filter(
    i => filterSeverity === 'all' || i.severity === filterSeverity
  ) || [];

  // Count by severity
  const counts: Record<IssueSeverity, number> = { error: 0, warning: 0, suggestion: 0, info: 0 };
  for (const issue of result?.issues || []) {
    counts[issue.severity]++;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          <Wrench className="w-4 h-4" />
          Song Finisher
        </div>
        <button
          onClick={runAnalysis}
          disabled={isAnalyzing || !lyrics.trim()}
          className="flex items-center gap-1 px-2 py-1 text-xs text-indigo-400 hover:bg-indigo-500/10 rounded-md transition-colors disabled:opacity-30"
        >
          <RefreshCw className={`w-3 h-3 ${isAnalyzing ? 'animate-spin' : ''}`} />
          Analyze
        </button>
      </div>

      {/* Completeness bar */}
      {result && <CompletenessBar score={result.completeness} />}

      {/* Severity filter pills */}
      {result && result.issues.length > 0 && (
        <div className="px-3 py-2 border-b border-zinc-800 flex items-center gap-1 flex-wrap">
          <button
            onClick={() => setFilterSeverity('all')}
            className={`px-2 py-0.5 text-[10px] rounded-full transition-colors ${
              filterSeverity === 'all'
                ? 'bg-zinc-700 text-zinc-200'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            All ({result.issues.length})
          </button>
          {(['error', 'warning', 'suggestion', 'info'] as IssueSeverity[]).map(sev => {
            if (counts[sev] === 0) return null;
            const cfg = SEVERITY_CONFIG[sev];
            return (
              <button
                key={sev}
                onClick={() => setFilterSeverity(sev)}
                className={`px-2 py-0.5 text-[10px] rounded-full transition-colors ${
                  filterSeverity === sev
                    ? `${cfg.bg} ${cfg.color}`
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {cfg.label} ({counts[sev]})
              </button>
            );
          })}
        </div>
      )}

      {/* Issue list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {!lyrics.trim() ? (
          <div className="text-center text-zinc-600 text-xs mt-10">
            <Wrench className="w-6 h-6 mx-auto mb-2 opacity-30" />
            <p>Write some lyrics to analyze.</p>
          </div>
        ) : isAnalyzing ? (
          <div className="text-center text-zinc-500 text-xs mt-10">
            <RefreshCw className="w-5 h-5 mx-auto mb-2 animate-spin opacity-50" />
            Analyzing...
          </div>
        ) : filteredIssues.length === 0 && result ? (
          <div className="text-center text-zinc-500 text-xs mt-10">
            <CheckCircle2 className="w-6 h-6 mx-auto mb-2 text-emerald-500 opacity-50" />
            <p>
              {filterSeverity === 'all'
                ? 'No issues found. Your song looks solid!'
                : `No ${filterSeverity}-level issues.`}
            </p>
          </div>
        ) : (
          filteredIssues.map(issue => (
            <IssueCard
              key={issue.id}
              issue={issue}
              lyrics={lyrics}
              onSendToAI={handleSendToAI}
              onPickVersion={handlePickVersion}
            />
          ))
        )}
      </div>
    </div>
  );
}

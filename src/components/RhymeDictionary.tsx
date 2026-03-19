import React, { useState } from 'react';
import { Search, BookOpen, Volume2 } from 'lucide-react';

interface WordResult {
  word: string;
  score: number;
  numSyllables: number;
}

export function RhymeDictionary() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WordResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'rhymes' | 'slant' | 'synonyms'>('rhymes');

  const searchWords = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    try {
      let endpoint = '';
      if (activeTab === 'rhymes') endpoint = `rel_rhy=${query}`;
      else if (activeTab === 'slant') endpoint = `rel_nry=${query}`;
      else if (activeTab === 'synonyms') endpoint = `ml=${query}`;

      const res = await fetch(`https://api.datamuse.com/words?${endpoint}&md=s`);
      const data = await res.json();
      setResults(data);
    } catch (error) {
      console.error('Error fetching words:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Trigger search when tab changes if there's a query
  const handleTabChange = (tab: 'rhymes' | 'slant' | 'synonyms') => {
    setActiveTab(tab);
    if (query.trim()) {
      // We need to use a timeout to let state update, or just pass the tab directly
      fetchData(tab, query);
    }
  };

  const fetchData = async (tab: string, searchWord: string) => {
    setIsLoading(true);
    try {
      let endpoint = '';
      if (tab === 'rhymes') endpoint = `rel_rhy=${searchWord}`;
      else if (tab === 'slant') endpoint = `rel_nry=${searchWord}`;
      else if (tab === 'synonyms') endpoint = `ml=${searchWord}`;

      const res = await fetch(`https://api.datamuse.com/words?${endpoint}&md=s`);
      const data = await res.json();
      setResults(data);
    } catch (error) {
      console.error('Error fetching words:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Group results by syllable count
  const groupedResults = results.reduce((acc, word) => {
    const syl = word.numSyllables || 1;
    if (!acc[syl]) acc[syl] = [];
    acc[syl].push(word);
    return acc;
  }, {} as Record<number, WordResult[]>);

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      <div className="p-4 border-b border-zinc-800">
        <form onSubmit={searchWords} className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search words..."
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </form>

        <div className="flex gap-2 mt-4">
          {(['rhymes', 'slant', 'synonyms'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                activeTab === tab
                  ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                  : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:bg-zinc-800'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : results.length > 0 ? (
          <div className="space-y-6">
            {Object.entries(groupedResults)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([syllables, words]) => (
                <div key={syllables}>
                  <h3 className="text-xs font-semibold text-zinc-500 mb-2 flex items-center gap-1">
                    <Volume2 className="w-3 h-3" />
                    {syllables} Syllable{Number(syllables) !== 1 ? 's' : ''}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {(words as WordResult[]).map((w, i) => (
                      <span
                        key={i}
                        className="px-2 py-1 bg-zinc-900 border border-zinc-800 rounded text-sm text-zinc-300 hover:border-indigo-500/50 hover:text-indigo-300 cursor-pointer transition-colors"
                        onClick={() => {
                          navigator.clipboard.writeText(w.word);
                        }}
                        title="Click to copy"
                      >
                        {w.word}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        ) : query ? (
          <div className="text-center text-zinc-500 py-8 text-sm">
            No results found for "{query}"
          </div>
        ) : (
          <div className="text-center text-zinc-500 py-8 text-sm flex flex-col items-center">
            <BookOpen className="w-8 h-8 opacity-20 mb-3" />
            <p>Search for rhymes, slant rhymes, or synonyms.</p>
            <p className="text-xs mt-2 opacity-60">Click any word to copy it.</p>
          </div>
        )}
      </div>
    </div>
  );
}

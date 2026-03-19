import { syllable } from 'syllable';

export function countSyllables(word: string): number {
  // Clean the word of punctuation before counting
  const cleaned = word.replace(/[^a-zA-Z]/g, '');
  if (!cleaned) return 0;
  return syllable(cleaned);
}

export function countLineSyllables(line: string): number {
  const words = line.trim().split(/\s+/);
  if (words.length === 0 || (words.length === 1 && words[0] === '')) return 0;
  
  return words.reduce((total, word) => total + countSyllables(word), 0);
}

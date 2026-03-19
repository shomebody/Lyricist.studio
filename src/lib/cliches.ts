// List of overused AI-generated lyric phrases (AI Slop)
export const AI_CLICHES = [
  "neon lights",
  "echoes in the dark",
  "shivers down my spine",
  "unbreakable",
  "we rise",
  "ashes to dust",
  "dancing in the rain",
  "like a hurricane",
  "whispers in the wind",
  "shadows of the past",
  "ignite the fire",
  "burn so bright",
  "paint the sky",
  "against the world",
  "heart of gold",
  "tears fall like rain",
  "lost in the maze",
  "symphony of",
  "tapestry of",
  "kaleidoscope",
  "test of time",
  "stars align",
  "chasing the sun",
  "into the unknown",
  "break the chains",
  "soaring high",
  "deep inside",
  "feel the beat",
  "rhythm of my heart",
  "city sleeps",
  "midnight hour",
  "electric feel",
  "magic in the air",
  "take my hand",
  "never let go",
  "end of time",
  "spark to a flame",
  "out of the ashes"
];

export interface ClicheMatch {
  phrase: string;
  line: number;
  startCol: number;
  endCol: number;
}

export function findCliches(lyrics: string): ClicheMatch[] {
  const matches: ClicheMatch[] = [];
  const lines = lyrics.split('\n');

  lines.forEach((line, lineIndex) => {
    const lowerLine = line.toLowerCase();
    
    AI_CLICHES.forEach(cliche => {
      let startIndex = 0;
      while ((startIndex = lowerLine.indexOf(cliche, startIndex)) !== -1) {
        matches.push({
          phrase: cliche,
          line: lineIndex + 1,
          startCol: startIndex + 1,
          endCol: startIndex + cliche.length + 1
        });
        startIndex += cliche.length;
      }
    });
  });

  return matches;
}

// Suno v5 Tag Validation Rules

export interface TagValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateSunoTags(lyrics: string): TagValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  const lines = lyrics.split('\n');
  
  let hasEndTag = false;
  let hasMasterArrangementSummary = false;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();
    
    // Check for unclosed brackets
    const openBrackets = (trimmed.match(/\[/g) || []).length;
    const closeBrackets = (trimmed.match(/\]/g) || []).length;
    if (openBrackets !== closeBrackets) {
      errors.push(`Line ${lineNumber}: Unmatched brackets.`);
    }

    // Check for structural tags not on their own line
    if (trimmed.includes('[') && trimmed.includes(']') && !trimmed.startsWith('[')) {
      warnings.push(`Line ${lineNumber}: Structural tags should ideally be at the start of the line.`);
    }

    // Check tag density (max 3 commands per bracket)
    const bracketContentMatch = trimmed.match(/\[(.*?)\]/);
    if (bracketContentMatch) {
      const content = bracketContentMatch[1];
      const commands = content.split(',').map(c => c.trim());
      if (commands.length > 3) {
        errors.push(`Line ${lineNumber}: Maximum 3 commands allowed per bracket set.`);
      }
      
      const pipes = content.split('|').map(c => c.trim());
      if (pipes.length > 4) {
        warnings.push(`Line ${lineNumber}: More than 4 pipe segments may confuse the AI.`);
      }

      if (content.toLowerCase().includes('instrumental')) {
        warnings.push(`Line ${lineNumber}: [Instrumental] tags can sometimes cause the AI to stop singing entirely.`);
      }
      
      if (content.toLowerCase().includes('end') || content.toLowerCase().includes('fade out')) {
        hasEndTag = true;
      }
    }

    // Check for Master Arrangement Summary
    if (trimmed.startsWith('***') || (hasEndTag && trimmed.length > 0 && !trimmed.startsWith('['))) {
      hasMasterArrangementSummary = true;
    }
  });

  if (hasMasterArrangementSummary && !hasEndTag) {
    errors.push('Master Arrangement Summary must appear AFTER an [End] or [Fade Out] tag.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

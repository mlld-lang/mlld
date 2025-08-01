export interface TokenTest {
  input: string;
  expectedTokens: TokenExpectation[] | null;
  notExpectedTokens: TokenExpectation[] | null;
  isPartial: boolean;
}

export interface TokenExpectation {
  text?: string;
  type: string;
  modifiers?: string[];
}

export function parseTokenTest(content: string): TokenTest {
  const sections = {
    input: '',
    tokens: null as string | null,
    partialTokens: null as string | null,
    notTokens: null as string | null
  };

  let currentSection: keyof typeof sections = 'input';
  const lines = content.split('\n');

  for (const line of lines) {
    if (line === '=== START TOKENS ===') {
      currentSection = 'tokens';
      sections.tokens = '';
    } else if (line === '=== START PARTIAL TOKENS ===') {
      currentSection = 'partialTokens';
      sections.partialTokens = '';
    } else if (line === '=== START NOT TOKENS ===') {
      currentSection = 'notTokens';
      sections.notTokens = '';
    } else if (line.startsWith('=== END')) {
      currentSection = 'input';
    } else if (currentSection !== 'input' && sections[currentSection] !== null) {
      sections[currentSection] += line + '\n';
    } else if (currentSection === 'input') {
      sections.input += line + '\n';
    }
  }

  return {
    input: sections.input.trim(),
    expectedTokens: sections.tokens ? parseTokenList(sections.tokens) :
                   sections.partialTokens ? parseTokenList(sections.partialTokens) : null,
    notExpectedTokens: sections.notTokens ? parseTokenList(sections.notTokens) : null,
    isPartial: !!sections.partialTokens
  };
}

function parseTokenList(tokenSection: string): TokenExpectation[] {
  const expectations: TokenExpectation[] = [];
  const lines = tokenSection.trim().split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;
    
    const match = line.match(/^(.+?)?\s*-->\s*(.+)$/);
    if (match) {
      const [_, textPart, typePart] = match;
      const text = textPart?.trim();
      const typeMatch = typePart.match(/^([^[]+)(?:\[([^\]]+)\])?$/);
      
      if (typeMatch) {
        const [__, type, modifierStr] = typeMatch;
        const modifiers = modifierStr ? modifierStr.split(',').map(m => m.trim()) : undefined;
        
        expectations.push({
          text: text || undefined,
          type: type.trim(),
          modifiers
        });
      }
    }
  }

  return expectations;
}
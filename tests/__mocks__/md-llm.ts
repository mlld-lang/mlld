// Mock implementation of md-llm for testing
export async function mdToLlm(content: string): Promise<string> {
  // Simple mock conversion
  const lines = content.split('\n');
  const converted = lines.map(line => {
    if (line.startsWith('# ')) {
      return `<heading level="1">${line.slice(2)}</heading>`;
    }
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      return `<code language="${lang}">`;
    }
    if (line === '```') {
      return '</code>';
    }
    return line ? `<paragraph>${line}</paragraph>` : '';
  });
  return `<content>\n${converted.join('\n')}\n</content>`;
}

export async function mdToMarkdown(content: string): Promise<string> {
  // For markdown, just return the content as is
  return content;
} 
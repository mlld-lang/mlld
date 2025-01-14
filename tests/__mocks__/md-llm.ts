// Mock implementation of md-llm for testing
interface ConversionOptions {
  includeMetadata?: boolean;
}

export async function mdToLlm(content: string, options: ConversionOptions = {}): Promise<string> {
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
  const result = `<content>\n${converted.join('\n')}\n</content>`;
  if (options.includeMetadata) {
    return `<metadata></metadata>\n${result}`;
  }
  return result;
}

export async function mdToMarkdown(content: string, options: ConversionOptions = {}): Promise<string> {
  // Mock implementation - just return the content as is
  if (options.includeMetadata) {
    return `<!-- metadata -->\n${content}`;
  }
  return content;
} 
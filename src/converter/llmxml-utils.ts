import { LLMXML, LLMXMLOptions, GetSectionOptions } from 'llmxml';

// Error types
export class MeldLLMXMLError extends Error {
  constructor(
    message: string,
    public code: LLMXMLErrorCode,
    public details?: any
  ) {
    super(message);
    this.name = 'MeldLLMXMLError';
  }
}

export type LLMXMLErrorCode = 
  | 'SECTION_NOT_FOUND'
  | 'PARSE_ERROR'
  | 'INVALID_FORMAT'
  | 'INVALID_LEVEL'
  | 'INVALID_SECTION_OPTIONS';

interface LLMXMLError {
  code?: string;
  message?: string;
  details?: {
    bestMatch?: string;
    [key: string]: any;
  };
  name?: string;
}

const llmxml = new LLMXML({
  defaultFuzzyThreshold: 0.7,
  warningLevel: 'all',
  validateXml: true,
  sectionTagName: 'Section'
} as LLMXMLOptions);

function handleLLMXMLError(error: LLMXMLError | unknown): never {
  const err = error as LLMXMLError;
  
  if (err?.code === 'SECTION_NOT_FOUND') {
    throw new MeldLLMXMLError(
      'Section not found',
      'SECTION_NOT_FOUND',
      err.details
    );
  }
  if (err?.code === 'AMBIGUOUS_MATCH') {
    console.warn('Multiple potential matches found:', err.details);
    throw new MeldLLMXMLError(
      'Multiple potential matches found',
      'INVALID_SECTION_OPTIONS',
      err.details
    );
  }
  if (err?.name === 'ParseError') {
    throw new MeldLLMXMLError(
      `Parse error: ${err.message}`,
      'PARSE_ERROR',
      err
    );
  }
  throw new MeldLLMXMLError(
    err?.message || 'Unknown llmxml error',
    err?.code as LLMXMLErrorCode || 'INVALID_FORMAT',
    err
  );
}

export async function toLLMXml(markdown: string): Promise<string> {
  try {
    const xml = await llmxml.toXML(markdown);
    return xml.replace(/^<\?xml[^>]+\?>/, '').trim();
  } catch (error) {
    if (error instanceof Error) {
      throw new MeldLLMXMLError(error.message, 'PARSE_ERROR');
    }
    throw error;
  }
}

export async function toMarkdown(xmlOrMd: string): Promise<string> {
  try {
    return await llmxml.toMarkdown(xmlOrMd);
  } catch (error) {
    handleLLMXMLError(error);
  }
}

export async function extractSection(content: string, title: string, options?: { fuzzyThreshold?: number; includeNested?: boolean }): Promise<string> {
  try {
    // First validate the content to catch malformed markdown early
    await validateContent(content);
    
    const result = await llmxml.getSection(content, title, {
      ...options,
      fuzzyMatch: true,
      throwOnNotFound: true,
      throwOnAmbiguous: true,
      includeNested: options?.includeNested ?? true
    } as GetSectionOptions);
    
    if (!result) {
      throw new MeldLLMXMLError(
        'Section not found',
        'SECTION_NOT_FOUND',
        { title }
      );
    }
    
    return result;
  } catch (error) {
    handleLLMXMLError(error);
  }
}

export async function validateContent(content: string): Promise<void> {
  try {
    // Parse and validate by attempting to convert
    await llmxml.toXML(content);
  } catch (error) {
    handleLLMXMLError(error);
  }
} 
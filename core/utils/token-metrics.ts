export interface TokenEstimationOptions {
  extension?: string | null;
  format?: string | null;
  language?: string | null;
}

export type TokenMetricSource = 'estimate' | 'exact';

export interface TokenMetrics {
  length: number;
  tokest: number;
  tokens?: number;
  source: TokenMetricSource;
}

const PROGRAMMING_EXTENSIONS = new Set([
  'py',
  'js',
  'ts',
  'java',
  'c',
  'cpp',
  'cs',
  'go',
  'rs'
]);

const NATURAL_LANGUAGE_EXTENSIONS = new Set(['md', 'txt', 'rst', 'adoc']);
const STRUCTURED_EXTENSIONS = new Set(['json', 'yaml', 'yml', 'toml', 'xml', 'html']);

const PROGRAMMING_RATIO = 3;
const NATURAL_LANGUAGE_RATIO = 4;
const STRUCTURED_RATIO = 5;
const DEFAULT_RATIO = 4;

function pickRatio(options?: TokenEstimationOptions): number {
  const ext = options?.extension?.toLowerCase();
  const format = options?.format?.toLowerCase();
  const language = options?.language?.toLowerCase();

  if (ext && PROGRAMMING_EXTENSIONS.has(ext)) {
    return PROGRAMMING_RATIO;
  }
  if (ext && NATURAL_LANGUAGE_EXTENSIONS.has(ext)) {
    return NATURAL_LANGUAGE_RATIO;
  }
  if (ext && STRUCTURED_EXTENSIONS.has(ext)) {
    return STRUCTURED_RATIO;
  }

  if (format === 'json' || format === 'yaml' || format === 'xml') {
    return STRUCTURED_RATIO;
  }

  if (language === 'js' || language === 'ts' || language === 'py' || language === 'go') {
    return PROGRAMMING_RATIO;
  }

  return DEFAULT_RATIO;
}

export function estimateTokenCount(text: string, options?: TokenEstimationOptions): number {
  if (!text) {
    return 0;
  }
  const ratio = pickRatio(options);
  return Math.ceil(text.length / ratio);
}

export function buildTokenMetrics(text: string, options?: TokenEstimationOptions): TokenMetrics {
  const length = text.length;
  const tokest = estimateTokenCount(text, options);
  return {
    length,
    tokest,
    tokens: undefined,
    source: 'estimate'
  };
}

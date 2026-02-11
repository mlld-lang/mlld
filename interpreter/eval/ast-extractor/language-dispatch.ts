import * as path from 'path';
import type { Definition } from './types';

export type AstExtractorKey =
  | 'ts'
  | 'python'
  | 'ruby'
  | 'go'
  | 'rust'
  | 'java'
  | 'solidity'
  | 'cpp'
  | 'csharp';

export type AstExtractorFn = (content: string, filePath: string) => Definition[];

export interface AstExtractorRegistry {
  ts: AstExtractorFn;
  python: AstExtractorFn;
  ruby: AstExtractorFn;
  go: AstExtractorFn;
  rust: AstExtractorFn;
  java: AstExtractorFn;
  solidity: AstExtractorFn;
  cpp: AstExtractorFn;
  csharp: AstExtractorFn;
}

const PYTHON_EXTENSIONS = new Set(['.py', '.pyi']);
const CPP_EXTENSIONS = new Set(['.c', '.h', '.cpp', '.hpp', '.cc', '.cxx', '.hh', '.hxx']);

export function resolveAstExtractorKey(filePath: string): AstExtractorKey {
  const extension = path.extname(filePath).toLowerCase();

  if (PYTHON_EXTENSIONS.has(extension)) {
    return 'python';
  }
  if (extension === '.rb') {
    return 'ruby';
  }
  if (extension === '.go') {
    return 'go';
  }
  if (extension === '.rs') {
    return 'rust';
  }
  if (extension === '.java') {
    return 'java';
  }
  if (extension === '.sol') {
    return 'solidity';
  }
  if (CPP_EXTENSIONS.has(extension)) {
    return 'cpp';
  }
  if (extension === '.cs') {
    return 'csharp';
  }
  return 'ts';
}

export function extractDefinitionsForFile(
  content: string,
  filePath: string,
  registry: AstExtractorRegistry
): Definition[] {
  const extractorKey = resolveAstExtractorKey(filePath);
  return registry[extractorKey](content, filePath);
}

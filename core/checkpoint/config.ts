import { MlldParseError } from '@core/errors/MlldParseError';
import type { CheckpointResumeMode } from '@core/types/checkpoint';

export const DEFAULT_CHECKPOINT_RESUME_MODE: CheckpointResumeMode = 'auto';
export const DEFAULT_SCRIPT_CHECKPOINT_RESUME_MODE: CheckpointResumeMode = 'manual';

const VALID_RESUME_MODES = new Set<CheckpointResumeMode>(['auto', 'manual', 'never']);

export interface LeadingResumeDirective {
  adjustedSource: string;
  removed: boolean;
  resumeMode?: CheckpointResumeMode;
}

export function normalizeCheckpointResumeMode(
  value: unknown,
  options: { sourceLabel?: string } = {}
): CheckpointResumeMode {
  const sourceLabel = options.sourceLabel ?? 'resume';
  const normalized =
    typeof value === 'string'
      ? value.trim().replace(/^['"]|['"]$/g, '').toLowerCase()
      : '';

  if (!VALID_RESUME_MODES.has(normalized as CheckpointResumeMode)) {
    throw new MlldParseError(
      `Invalid ${sourceLabel} mode "${String(value)}". Expected auto, manual, or never.`,
      { line: 1, column: 1, offset: 0 }
    );
  }

  return normalized as CheckpointResumeMode;
}

function buildAdjustedSource(source: string, endOffset: number): string {
  const prefix = source.slice(0, endOffset).replace(/[^\r\n]/g, ' ');
  return `${prefix}${source.slice(endOffset)}`;
}

export function extractLeadingResumeDirective(source: string): LeadingResumeDirective {
  if (!source) {
    return { adjustedSource: source, removed: false };
  }

  const bomOffset = source.startsWith('\uFEFF') ? 1 : 0;
  const firstLineBreak = source.indexOf('\n', bomOffset);
  const firstLineEnd = firstLineBreak === -1 ? source.length : firstLineBreak;
  const firstLine = source.slice(bomOffset, firstLineEnd);
  const match = firstLine.match(/^\s*resume\s*:\s*(.+?)\s*$/i);

  if (!match) {
    return { adjustedSource: source, removed: false };
  }

  const resumeMode = normalizeCheckpointResumeMode(match[1], {
    sourceLabel: 'script resume'
  });

  let endOffset = firstLineEnd;
  if (endOffset < source.length && source[endOffset] === '\r') {
    endOffset += 1;
  }
  if (endOffset < source.length && source[endOffset] === '\n') {
    endOffset += 1;
  }

  while (endOffset < source.length) {
    const nextLineBreak = source.indexOf('\n', endOffset);
    const lineEnd = nextLineBreak === -1 ? source.length : nextLineBreak + 1;
    const line = source.slice(endOffset, lineEnd);
    if (!/^[\r\n\s]*$/.test(line)) {
      break;
    }
    endOffset = lineEnd;
  }

  return {
    adjustedSource: buildAdjustedSource(source, endOffset),
    removed: true,
    resumeMode
  };
}

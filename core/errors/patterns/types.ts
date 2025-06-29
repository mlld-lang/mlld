import { Location } from 'peggy';
import { MlldParseError } from '@core/errors/MlldParseError';

export interface PeggyError extends Error {
  location: Location;
  found: string | null;
  expected: Array<{ type: string; text?: string; description?: string }>;
}

export interface ErrorPattern {
  name: string;
  test(error: PeggyError, ctx: ErrorContext): boolean;
  enhance(error: PeggyError, ctx: ErrorContext): MlldParseError;
}

export interface ErrorContext {
  line: string;
  source: string;
  location: Location;
}
import type { SourceLocation } from '@core/types';

export interface StaticValidationIssue {
  code: string;
  message: string;
  location?: SourceLocation;
}

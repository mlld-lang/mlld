export interface ForIterationError {
  index: number;
  key?: string | number | null;
  message: string;
  error: string;
  value?: unknown;
}

export type ForControlKindResolver = (value: unknown) => 'done' | 'continue' | null;

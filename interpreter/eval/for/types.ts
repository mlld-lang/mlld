export interface ForIterationError {
  index: number;
  key?: string | number | null;
  message: string;
  error: string;
  value?: unknown;
}

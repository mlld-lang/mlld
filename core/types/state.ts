import type { SecurityDescriptor } from './security';

export interface StateWrite {
  path: string;
  value: unknown;
  operation: 'set';
  security?: SecurityDescriptor;
  timestamp: string;
  index: number;
}

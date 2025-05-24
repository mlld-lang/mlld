import type { IDirectiveService } from './IDirectiveService';

/**
 * Directive service stub
 * NOTE: This is a stub for backward compatibility - the new interpreter doesn't use this
 */
export class DirectiveService implements IDirectiveService {
  initialize(): void {
    // No-op - new interpreter handles directives directly
  }
}
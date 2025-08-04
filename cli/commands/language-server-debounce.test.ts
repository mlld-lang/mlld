import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MlldLanguageServerConfig, DocumentState } from './language-server';

// Mock timers for testing debouncing
vi.useFakeTimers();

describe('Language Server Debouncing', () => {
  describe('Error Pattern Detection', () => {
    const INCOMPLETE_ERROR_PATTERNS = [
      /Expected ".*" but found end of input/,
      /Expected .* but found newline/,
      /Unexpected end of input/,
      /Expected expression/,
      /Expected value/,
      /Unterminated string/,
      /Expected closing/,
      /Expected "="/,
      /Expected identifier/,
      /Expected ":" but found/,
      /Expected ">" but found/
    ];
    
    function isIncompleteLineError(error: any): boolean {
      if (!error?.message) return false;
      return INCOMPLETE_ERROR_PATTERNS.some(pattern => pattern.test(error.message));
    }
    
    it('should detect incomplete line errors', () => {
      expect(isIncompleteLineError({ message: 'Expected "=" but found end of input' })).toBe(true);
      expect(isIncompleteLineError({ message: 'Expected value' })).toBe(true);
      expect(isIncompleteLineError({ message: 'Unterminated string' })).toBe(true);
      expect(isIncompleteLineError({ message: 'Expected identifier' })).toBe(true);
    });
    
    it('should not detect complete errors as incomplete', () => {
      expect(isIncompleteLineError({ message: 'Variable already defined' })).toBe(false);
      expect(isIncompleteLineError({ message: 'Unknown directive' })).toBe(false);
      expect(isIncompleteLineError({ message: 'Import not found' })).toBe(false);
    });
  });
  
  describe('DebouncedProcessor', () => {
    // Simple mock of DebouncedProcessor for testing
    class DebouncedProcessor {
      private validationTimers = new Map<string, NodeJS.Timeout>();
      private tokenTimers = new Map<string, NodeJS.Timeout>();
      
      constructor(
        private validateFn: (document: any) => Promise<void>,
        private tokenFn: (document: any) => Promise<void>
      ) {}
      
      scheduleValidation(document: any, delay: number): void {
        const uri = document.uri;
        
        const existingTimer = this.validationTimers.get(uri);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }
        
        const timer = setTimeout(async () => {
          this.validationTimers.delete(uri);
          await this.validateFn(document);
        }, delay);
        
        this.validationTimers.set(uri, timer);
      }
      
      scheduleTokenGeneration(document: any, delay: number): void {
        const uri = document.uri;
        
        const existingTimer = this.tokenTimers.get(uri);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }
        
        const timer = setTimeout(async () => {
          this.tokenTimers.delete(uri);
          await this.tokenFn(document);
        }, delay);
        
        this.tokenTimers.set(uri, timer);
      }
      
      async validateNow(document: any): Promise<void> {
        const uri = document.uri;
        
        const existingTimer = this.validationTimers.get(uri);
        if (existingTimer) {
          clearTimeout(existingTimer);
          this.validationTimers.delete(uri);
        }
        
        await this.validateFn(document);
      }
      
      clearTimers(uri: string): void {
        const validationTimer = this.validationTimers.get(uri);
        if (validationTimer) {
          clearTimeout(validationTimer);
          this.validationTimers.delete(uri);
        }
        
        const tokenTimer = this.tokenTimers.get(uri);
        if (tokenTimer) {
          clearTimeout(tokenTimer);
          this.tokenTimers.delete(uri);
        }
      }
    }
    
    let validateFn: any;
    let tokenFn: any;
    let processor: DebouncedProcessor;
    let mockDocument: any;
    
    beforeEach(() => {
      validateFn = vi.fn().mockResolvedValue(undefined);
      tokenFn = vi.fn().mockResolvedValue(undefined);
      processor = new DebouncedProcessor(validateFn, tokenFn);
      mockDocument = { uri: 'file:///test.mld' };
    });
    
    afterEach(() => {
      vi.clearAllTimers();
    });
    
    it('should delay validation by specified time', async () => {
      processor.scheduleValidation(mockDocument, 1000);
      
      // Should not be called immediately
      expect(validateFn).not.toHaveBeenCalled();
      
      // Should not be called after 500ms
      vi.advanceTimersByTime(500);
      expect(validateFn).not.toHaveBeenCalled();
      
      // Should be called after 1000ms
      vi.advanceTimersByTime(500);
      expect(validateFn).toHaveBeenCalledTimes(1);
      expect(validateFn).toHaveBeenCalledWith(mockDocument);
    });
    
    it('should cancel previous timer when scheduling new validation', async () => {
      processor.scheduleValidation(mockDocument, 1000);
      
      // Schedule again after 500ms
      vi.advanceTimersByTime(500);
      processor.scheduleValidation(mockDocument, 1000);
      
      // Original should not fire at 1000ms
      vi.advanceTimersByTime(500);
      expect(validateFn).not.toHaveBeenCalled();
      
      // New one should fire at 1500ms total
      vi.advanceTimersByTime(500);
      expect(validateFn).toHaveBeenCalledTimes(1);
    });
    
    it('should handle different delays for validation and tokens', async () => {
      processor.scheduleValidation(mockDocument, 1000);
      processor.scheduleTokenGeneration(mockDocument, 250);
      
      // Token generation should fire first
      vi.advanceTimersByTime(250);
      expect(tokenFn).toHaveBeenCalledTimes(1);
      expect(validateFn).not.toHaveBeenCalled();
      
      // Validation should fire later
      vi.advanceTimersByTime(750);
      expect(validateFn).toHaveBeenCalledTimes(1);
    });
    
    it('should validate immediately with validateNow', async () => {
      processor.scheduleValidation(mockDocument, 1000);
      
      // Call validateNow
      await processor.validateNow(mockDocument);
      
      // Should be called immediately
      expect(validateFn).toHaveBeenCalledTimes(1);
      
      // Should not be called again after delay
      vi.advanceTimersByTime(1000);
      expect(validateFn).toHaveBeenCalledTimes(1);
    });
    
    it('should clear all timers for a document', () => {
      processor.scheduleValidation(mockDocument, 1000);
      processor.scheduleTokenGeneration(mockDocument, 250);
      
      // Clear timers
      processor.clearTimers(mockDocument.uri);
      
      // Nothing should fire
      vi.advanceTimersByTime(2000);
      expect(validateFn).not.toHaveBeenCalled();
      expect(tokenFn).not.toHaveBeenCalled();
    });
  });
  
  describe('Error Filtering', () => {
    interface MockDiagnostic {
      range: { start: { line: number } };
      message: string;
    }
    
    function filterIncompleteLineErrors(
      errors: MockDiagnostic[],
      currentEditLine: number | undefined,
      timeSinceEdit: number,
      showIncompleteLineErrors: boolean
    ): MockDiagnostic[] {
      const INCOMPLETE_ERROR_PATTERNS = [
        /Expected ".*" but found end of input/,
        /Expected .* but found newline/,
        /Unexpected end of input/,
        /Expected expression/,
        /Expected value/,
        /Unterminated string/,
        /Expected closing/,
        /Expected "="/,
        /Expected identifier/,
        /Expected ":" but found/,
        /Expected ">" but found/
      ];
      
      if (showIncompleteLineErrors || currentEditLine === undefined) {
        return errors;
      }
      
      return errors.filter(error => {
        if (error.range.start.line !== currentEditLine) {
          return true;
        }
        
        if (timeSinceEdit < 2000) {
          return !INCOMPLETE_ERROR_PATTERNS.some(pattern => pattern.test(error.message));
        }
        
        return true;
      });
    }
    
    it('should filter incomplete errors on current edit line', () => {
      const errors: MockDiagnostic[] = [
        { range: { start: { line: 5 } }, message: 'Expected "=" but found end of input' },
        { range: { start: { line: 5 } }, message: 'Variable already defined' },
        { range: { start: { line: 10 } }, message: 'Expected value' }
      ];
      
      const filtered = filterIncompleteLineErrors(errors, 5, 100, false);
      
      expect(filtered).toHaveLength(2);
      expect(filtered[0].message).toBe('Variable already defined');
      expect(filtered[1].range.start.line).toBe(10);
    });
    
    it('should show all errors when showIncompleteLineErrors is true', () => {
      const errors: MockDiagnostic[] = [
        { range: { start: { line: 5 } }, message: 'Expected "=" but found end of input' },
        { range: { start: { line: 5 } }, message: 'Variable already defined' }
      ];
      
      const filtered = filterIncompleteLineErrors(errors, 5, 100, true);
      
      expect(filtered).toHaveLength(2);
    });
    
    it('should show all errors after 2 seconds', () => {
      const errors: MockDiagnostic[] = [
        { range: { start: { line: 5 } }, message: 'Expected "=" but found end of input' }
      ];
      
      const filtered = filterIncompleteLineErrors(errors, 5, 2500, false);
      
      expect(filtered).toHaveLength(1);
    });
    
    it('should always show errors on other lines', () => {
      const errors: MockDiagnostic[] = [
        { range: { start: { line: 5 } }, message: 'Expected "=" but found end of input' },
        { range: { start: { line: 10 } }, message: 'Expected "=" but found end of input' }
      ];
      
      const filtered = filterIncompleteLineErrors(errors, 5, 100, false);
      
      expect(filtered).toHaveLength(1);
      expect(filtered[0].range.start.line).toBe(10);
    });
  });
});
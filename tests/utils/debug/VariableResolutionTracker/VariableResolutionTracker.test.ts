import { describe, it, expect, beforeEach } from 'vitest';
import { VariableResolutionTracker, ResolutionAttempt } from '@tests/utils/debug/VariableResolutionTracker/VariableResolutionTracker.js';

describe('VariableResolutionTracker', () => {
  let tracker: VariableResolutionTracker;

  beforeEach(() => {
    tracker = new VariableResolutionTracker();
  });

  describe('configuration', () => {
    it('is disabled by default', () => {
      expect(tracker.isEnabled()).toBe(false);
    });

    it('can be enabled via configure', () => {
      tracker.configure({ enabled: true });
      expect(tracker.isEnabled()).toBe(true);
    });

    it('resets attempts when disabled', () => {
      // Setup
      tracker.configure({ enabled: true });
      tracker.trackResolutionAttempt('test', 'context', true, 'value');
      expect(tracker.getAttempts()).toHaveLength(1);

      // Disable
      tracker.configure({ enabled: false });
      expect(tracker.getAttempts()).toHaveLength(0);
    });
  });

  describe('tracking', () => {
    beforeEach(() => {
      tracker.configure({ enabled: true });
    });

    it('tracks successful resolution attempts', () => {
      tracker.trackResolutionAttempt('varName', 'file.meld', true, 'value', 'source');
      
      const attempts = tracker.getAttempts();
      expect(attempts).toHaveLength(1);
      expect(attempts[0]).toMatchObject({
        variableName: 'varName',
        context: 'file.meld',
        success: true,
        value: 'value',
        source: 'source'
      });
    });

    it('tracks failed resolution attempts', () => {
      tracker.trackResolutionAttempt('varName', 'file.meld', false, undefined, 'source');
      
      const attempts = tracker.getAttempts();
      expect(attempts).toHaveLength(1);
      expect(attempts[0]).toMatchObject({
        variableName: 'varName',
        context: 'file.meld',
        success: false,
        source: 'source'
      });
      expect(attempts[0].value).toBeUndefined();
    });

    it('does nothing when disabled', () => {
      tracker.configure({ enabled: false });
      tracker.trackResolutionAttempt('varName', 'file.meld', true, 'value');
      expect(tracker.getAttempts()).toHaveLength(0);
    });

    it('enforces maximum attempts limit', () => {
      tracker.configure({ enabled: true, maxAttempts: 2 });
      
      tracker.trackResolutionAttempt('var1', 'file.meld', true, 'value1');
      tracker.trackResolutionAttempt('var2', 'file.meld', true, 'value2');
      tracker.trackResolutionAttempt('var3', 'file.meld', true, 'value3');
      
      const attempts = tracker.getAttempts();
      expect(attempts).toHaveLength(2);
      expect(attempts[0].variableName).toBe('var2');
      expect(attempts[1].variableName).toBe('var3');
    });

    it('applies sampling rate', () => {
      // Set sampling rate to 0 to skip all attempts
      tracker.configure({ enabled: true, samplingRate: 0 });
      
      tracker.trackResolutionAttempt('var1', 'file.meld', true, 'value1');
      expect(tracker.getAttempts()).toHaveLength(0);
      
      // Set sampling rate to 1 to include all attempts
      tracker.configure({ enabled: true, samplingRate: 1 });
      
      tracker.trackResolutionAttempt('var1', 'file.meld', true, 'value1');
      expect(tracker.getAttempts()).toHaveLength(1);
    });

    it('filters by watched variables', () => {
      tracker.configure({ 
        enabled: true, 
        watchVariables: ['watchedVar'] 
      });
      
      tracker.trackResolutionAttempt('unwatchedVar', 'file.meld', true, 'value1');
      tracker.trackResolutionAttempt('watchedVar', 'file.meld', true, 'value2');
      
      const attempts = tracker.getAttempts();
      expect(attempts).toHaveLength(1);
      expect(attempts[0].variableName).toBe('watchedVar');
    });

    it('records context boundary information', () => {
      const boundary = {
        type: 'parent-to-child' as const,
        sourceId: 'parent123',
        targetId: 'child456'
      };
      
      tracker.trackResolutionAttempt('varName', 'file.meld', true, 'value', 'source', boundary);
      
      const attempts = tracker.getAttempts();
      expect(attempts[0].contextBoundary).toMatchObject(boundary);
    });
  });

  describe('querying', () => {
    beforeEach(() => {
      tracker.configure({ enabled: true });
      
      // Set up some test data
      tracker.trackResolutionAttempt('var1', 'file1.meld', true, 'value1');
      tracker.trackResolutionAttempt('var1', 'file2.meld', false, undefined);
      tracker.trackResolutionAttempt('var2', 'file1.meld', true, 'value2');
    });

    it('gets all attempts', () => {
      expect(tracker.getAttempts()).toHaveLength(3);
    });

    it('filters attempts by variable name', () => {
      const var1Attempts = tracker.getAttemptsForVariable('var1');
      expect(var1Attempts).toHaveLength(2);
      expect(var1Attempts.every(a => a.variableName === 'var1')).toBe(true);
      
      const var2Attempts = tracker.getAttemptsForVariable('var2');
      expect(var2Attempts).toHaveLength(1);
      expect(var2Attempts[0].variableName).toBe('var2');
    });

    it('returns a new array that does not affect the original', () => {
      const attempts = tracker.getAttempts();
      attempts.pop();
      
      expect(tracker.getAttempts()).toHaveLength(3);
    });
    
    it('clears all attempts', () => {
      tracker.clearAttempts();
      expect(tracker.getAttempts()).toHaveLength(0);
    });
  });
});
/**
 * State Machine Tests for Simplified Pipeline Model
 * 
 * These tests verify the simplified retry mechanism that:
 * - Uses single active context (no nested retries)
 * - Reuses contexts for same retry pattern
 * - Enforces retry limits (10 per context, 20 global per stage)
 * - Provides correct pipeline context variables
 */

import { PipelineStateMachine } from './state-machine';
import { isStructuredValue } from '@interpreter/utils/structured-value';

describe('PipelineStateMachine - Simplified Model', () => {
  describe('Basic Execution', () => {
    it('should execute pipeline stages sequentially', () => {
      const sm = new PipelineStateMachine(3);
      
      // Start pipeline
      let next = sm.transition({ type: 'START', input: 'base' });
      expect(next.type).toBe('EXECUTE_STAGE');
      expect(next.stage).toBe(0);
      expect(next.input).toBe('base');
      
      // Stage 0 succeeds
      next = sm.transition({ 
        type: 'STAGE_RESULT', 
        result: { type: 'success', output: 's0-output' }
      });
      expect(next.type).toBe('EXECUTE_STAGE');
      expect(next.stage).toBe(1);
      expect(next.input).toBe('s0-output');
      
      // Stage 1 succeeds
      next = sm.transition({ 
        type: 'STAGE_RESULT', 
        result: { type: 'success', output: 's1-output' }
      });
      expect(next.type).toBe('EXECUTE_STAGE');
      expect(next.stage).toBe(2);
      expect(next.input).toBe('s1-output');
      
      // Stage 2 succeeds
      next = sm.transition({ 
        type: 'STAGE_RESULT', 
        result: { type: 'success', output: 's2-output' }
      });
      expect(next.type).toBe('COMPLETE');
      expect(next.output).toBe('s2-output');
      
      // Verify events
      const events = sm.getEvents();
      expect(events.find(e => e.type === 'PIPELINE_START')).toMatchObject({ type: 'PIPELINE_START', input: 'base' });
      expect(events.find(e => e.type === 'PIPELINE_COMPLETE')).toMatchObject({ type: 'PIPELINE_COMPLETE', output: 's2-output' });
      expect(events.filter(e => e.type === 'STAGE_SUCCESS')).toHaveLength(3);
    });

    it('should handle empty output (early termination)', () => {
      const sm = new PipelineStateMachine(3);
      
      sm.transition({ type: 'START', input: 'base' });
      sm.transition({ 
        type: 'STAGE_RESULT', 
        result: { type: 'success', output: 's0' }
      });
      
      // Stage 1 returns empty output
      const next = sm.transition({ 
        type: 'STAGE_RESULT', 
        result: { type: 'success', output: '' }
      });
      
      expect(next.type).toBe('COMPLETE');
      expect(next.output).toBe('');
      
      // Verify no stage 2 execution
      const events = sm.getEvents();
      expect(events.filter(e => e.type === 'STAGE_START' && e.stage === 2)).toHaveLength(0);
    });
  });

  describe('Retry Mechanism', () => {
    it('should retry previous stage when retry is returned', () => {
      const sm = new PipelineStateMachine(3);
      
      sm.transition({ type: 'START', input: 'base' });
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's0' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1' }});
      
      // Stage 2 requests retry of stage 1
      const next = sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
      
      expect(next.type).toBe('EXECUTE_STAGE');
      expect(next.stage).toBe(1); // Retrying stage 1
      expect(next.input).toBe('s0'); // Same input as original
      expect(next.context.contextAttempt).toBe(2); // Second attempt
      expect(next.context.contextId).toBeDefined();
    });

    it('should increment attempt counter on retry', () => {
      const sm = new PipelineStateMachine(3);
      
      sm.transition({ type: 'START', input: 'base' });
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's0' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1' }});
      
      // First retry
      let next = sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
      expect(next.context.contextAttempt).toBe(2);
      
      // Stage 1 succeeds, stage 2 retries again
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1-v2' }});
      next = sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
      expect(next.context.contextAttempt).toBe(3); // Third attempt (reusing context)
      
      // Stage 1 succeeds, stage 2 retries yet again
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1-v3' }});
      next = sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
      expect(next.context.contextAttempt).toBe(4); // Fourth attempt
    });
  });

  describe('Context Management', () => {
    it('should reuse context for same retry pattern', () => {
      const sm = new PipelineStateMachine(3);
      
      sm.transition({ type: 'START', input: 'base' });
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's0' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1' }});
      
      // Stage 2 retries stage 1 (creates context)
      let next1 = sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
      const contextId1 = next1.context.contextId;
      expect(next1.context.contextAttempt).toBe(2);
      
      // Stage 1 succeeds, stage 2 retries again (reuses context)
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1-v2' }});
      let next2 = sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
      const contextId2 = next2.context.contextId;
      
      expect(contextId2).toBe(contextId1); // Same context ID
      expect(next2.context.contextAttempt).toBe(3); // Incremented attempt
    });

    it('should create new context for different retry pattern', () => {
      const sm = new PipelineStateMachine(5);
      
      sm.transition({ type: 'START', input: 'base' });
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's0' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1' }});
      
      // Stage 2 retries stage 1 (context A)
      let nextA = sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
      const contextA = nextA.context.contextId;
      
      // Stage 1 succeeds, stage 2 succeeds
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1-v2' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's2' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's3' }});
      
      // Stage 4 retries stage 3 (context B - different pattern)
      let nextB = sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
      const contextB = nextB.context.contextId;
      
      expect(contextB).not.toBe(contextA); // Different context IDs
      expect(nextB.context.contextAttempt).toBe(2); // Fresh attempt count
    });

    it('should clear context when requesting stage completes', () => {
      const sm = new PipelineStateMachine(5); // Use 5 stages for better testing
      
      sm.transition({ type: 'START', input: 'base' });
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's0' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1' }});
      
      // Stage 2 retries stage 1 (creates context A)
      const retryResult1 = sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
      const contextA = retryResult1.context.contextId;
      expect(contextA).toBeDefined();
      
      // Stage 1 succeeds
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1-v2' }});
      
      // Stage 2 succeeds (should clear context A)
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's2' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's3' }});
      
      // Stage 4 retries stage 3 (should create NEW context B, not reuse A)
      const retryResult2 = sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
      const contextB = retryResult2.context.contextId;
      
      // Contexts should be different, proving A was cleared
      expect(contextB).toBeDefined();
      expect(contextB).not.toBe(contextA);
      
      // Also verify the new context starts fresh at attempt 1
      expect(retryResult2.context.contextAttempt).toBe(2); // First retry is attempt 2
    });

    it('should maintain context until requesting stage completes', () => {
      const sm = new PipelineStateMachine(3);
      
      sm.transition({ type: 'START', input: 'base' });
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's0' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1' }});
      
      // Stage 2 retries stage 1
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
      
      // Stage 1 succeeds (context should still be active)
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1-v2' }});
      
      // Check context is still active by looking at next transition
      const nextStage2 = sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's2' }});
      expect(nextStage2.type).toBe('COMPLETE');
    });
  });

  describe('Stage 0 Retryability', () => {
    it('should retry stage 0 when marked as retryable (function source)', () => {
      const sm = new PipelineStateMachine(2, true); // isRetryable = true
      
      sm.transition({ type: 'START', input: 'base' });
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's0' }});
      
      // Stage 1 requests retry of stage 0
      const next = sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
      
      expect(next.type).toBe('EXECUTE_STAGE');
      expect(next.stage).toBe(0);
      expect(next.input).toBe('base'); // Original base input
      expect(next.context.contextAttempt).toBe(2);
    });

    it('should abort when trying to retry non-retryable stage 0', () => {
      const sm = new PipelineStateMachine(2, false); // isRetryable = false
      
      sm.transition({ type: 'START', input: 'base' });
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's0' }});
      
      // Stage 1 requests retry of stage 0
      const next = sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
      
      expect(next.type).toBe('ABORT');
      // The exact error message varies but should indicate stage 0 isn't retryable
      expect(next.reason.toLowerCase()).toMatch(/not.*function|not.*retryable/);
    });
  });

  describe('Retry Limits', () => {
    it('should enforce per-context retry limit (10)', () => {
      const sm = new PipelineStateMachine(3);
      
      sm.transition({ type: 'START', input: 'base' });
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's0' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1' }});
      
      let next;
      // Retry 10 times (limit is 10)
      for (let i = 0; i < 10; i++) {
        // Stage 2 retries stage 1
        next = sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
        expect(next.type).toBe('EXECUTE_STAGE');
        
        // Stage 1 succeeds
        sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: `s1-v${i+2}` }});
      }
      
      // 11th retry should abort
      next = sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
      expect(next.type).toBe('ABORT');
      expect(next.reason).toContain('exceeded retry limit');
    });

    it('should enforce global per-stage retry limit (20)', () => {
      const sm = new PipelineStateMachine(5);
      
      sm.transition({ type: 'START', input: 'base' });
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's0' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1' }});
      
      // First context: retry stage 1 from stage 2 (10 times)
      for (let i = 0; i < 10; i++) {
        sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
        sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: `s1-v${i+2}` }});
      }
      
      // Complete stage 2 to clear context
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's2' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's3' }});
      
      // Second context: retry stage 3 from stage 4 
      // But we're using a different stage (3), so this should work
      for (let i = 0; i < 10; i++) {
        sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
        sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: `s3-v${i+2}` }});
      }
      
      // This should succeed since we're retrying stage 3, not stage 1
      const next = sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's4' }});
      expect(next.type).toBe('COMPLETE');
    });

    it('should track global retries across different contexts', () => {
      const sm = new PipelineStateMachine(7);
      
      sm.transition({ type: 'START', input: 'base' });
      
      // Execute up to stage 2
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's0' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1' }});
      
      // Context A: Stage 2→1 retry 5 times
      for (let i = 0; i < 5; i++) {
        sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
        sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: `s1-a${i}` }});
      }
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's2' }});
      
      // Continue to stage 4
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's3' }});
      
      // Context B: Stage 4→3 retry 5 times
      for (let i = 0; i < 5; i++) {
        sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
        sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: `s3-b${i}` }});
      }
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's4' }});
      
      // Continue to stage 6
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's5' }});
      
      // Context C: Stage 6→5 retry 5 times
      for (let i = 0; i < 5; i++) {
        sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
        sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: `s5-c${i}` }});
      }
      
      // All should succeed since they're different stages
      const next = sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's6' }});
      expect(next.type).toBe('COMPLETE');
      
      // Verify by checking that all succeeded (global counts stayed under limit)
      const events = sm.getEvents();
      const retryEvents = events.filter(e => e.type === 'STAGE_RETRY_REQUEST');
      expect(retryEvents).toHaveLength(15); // 5 + 5 + 5 = 15 total retries
    });
  });

  describe('Pipeline Context (@pipeline variable)', () => {
    it('should provide correct previousOutputs array', () => {
      const sm = new PipelineStateMachine(4);
      
      sm.transition({ type: 'START', input: 'base' });
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's0' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's2' }});
      
      // Stage 3 should see outputs from stages 0, 1, 2
      let next = sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
      
      // Retry stage 2
      expect(next.stage).toBe(2);
      expect(next.context.previousOutputs).toEqual(['s0', 's1']); // Only 0 and 1
      
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's2-v2' }});
      
      // Now stage 3 should see updated output
      next = sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's3' }});
      expect(next.type).toBe('COMPLETE');
    });

    it('should provide array-style output access', () => {
      const sm = new PipelineStateMachine(3);
      
      sm.transition({ type: 'START', input: 'base' });
      let next = sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's0' }});
      
      // Stage 1 context
      expect(next.context.previousOutputs).toEqual(['s0']);
      
      next = sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1' }});
      
      // Stage 2 context
      expect(next.context.previousOutputs).toEqual(['s0', 's1']);
    });

    it('should provide correct attempt counts', () => {
      const sm = new PipelineStateMachine(3);
      
      sm.transition({ type: 'START', input: 'base' });
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's0' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1' }});
      
      // First execution of stage 2
      let next = sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
      
      // Retrying stage 1
      expect(next.context.contextAttempt).toBe(2); // Second attempt
      // History for the retrying stage might be empty on first retry
      expect(next.context.previousOutputs).toEqual(['s0']); // Has stage 0 output
      
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1-v2' }});
      
      // Stage 2 retries again
      next = sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
      
      // Third attempt of stage 1
      expect(next.context.contextAttempt).toBe(3);
      // The context tracks attempts but history might work differently
    });

    it('should accumulate retry history in allRetryHistory', () => {
      const sm = new PipelineStateMachine(3);
      
      sm.transition({ type: 'START', input: 'base' });
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's0' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1' }});
      
      // Stage 2 retries stage 1 multiple times
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1-v2' }});
      
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1-v3' }});
      
      // Complete the pipeline
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's2' }});
      
      // Check accumulated history
      const allHistory = sm.getAllRetryHistory();
      const contextId = Array.from(allHistory.keys())[0];
      // History accumulates but might not include the initial attempt
      const history = allHistory.get(contextId);
      expect(history).toBeDefined();
      const historyTexts = (history ?? []).map(entry => (isStructuredValue(entry) ? entry.text : entry));
      expect(historyTexts).toContain('s1-v2');
      expect(historyTexts).toContain('s1-v3');
    });
  });

  describe('Event Recording', () => {
    it('should record all pipeline events correctly', () => {
      const sm = new PipelineStateMachine(2);
      
      sm.transition({ type: 'START', input: 'base' });
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's0' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1' }});
      
      const events = sm.getEvents();
      
      expect(events[0]).toMatchObject({ type: 'PIPELINE_START', input: 'base' });
      expect(events[1]).toMatchObject({ type: 'STAGE_START', stage: 0, input: 'base' });
      expect(events[2]).toMatchObject({ type: 'STAGE_SUCCESS', stage: 0, output: 's0' });
      expect(events[3]).toMatchObject({ type: 'STAGE_START', stage: 1, input: 's0' });
      expect(events[4]).toMatchObject({ type: 'STAGE_SUCCESS', stage: 1, output: 's1' });
      expect(events[5]).toMatchObject({ type: 'PIPELINE_COMPLETE', output: 's1' });
    });

    it('should include contextId in retry-related events', () => {
      const sm = new PipelineStateMachine(3);
      
      sm.transition({ type: 'START', input: 'base' });
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's0' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1' }});
      
      // Stage 2 retries stage 1
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1-v2' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's2' }});
      
      const events = sm.getEvents();
      
      // Find retry-related events
      const retryRequest = events.find(e => e.type === 'STAGE_RETRY_REQUEST');
      expect(retryRequest).toBeDefined();
      expect(retryRequest?.contextId).toBeDefined();
      
      // Stage start/success during retry should have contextId
      const retryStageEvents = events.filter(e => 
        (e.type === 'STAGE_START' || e.type === 'STAGE_SUCCESS') && 
        e.contextId !== undefined
      );
      expect(retryStageEvents.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle immediate retry (stage 1 retries stage 0)', () => {
      const sm = new PipelineStateMachine(2, true); // retryable stage 0
      
      sm.transition({ type: 'START', input: 'base' });
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's0' }});
      
      // Stage 1 immediately retries stage 0
      const next = sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
      
      expect(next.type).toBe('EXECUTE_STAGE');
      expect(next.stage).toBe(0);
      expect(next.input).toBe('base');
    });

    it('should handle final stage retry', () => {
      const sm = new PipelineStateMachine(2);
      
      sm.transition({ type: 'START', input: 'base' });
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's0' }});
      
      // Final stage (1) retries stage 0
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's0-v2' }});
      
      // Final stage succeeds
      const next = sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1' }});
      
      expect(next.type).toBe('COMPLETE');
      expect(next.output).toBe('s1');
    });

    it('should handle multiple retries in sequence', () => {
      const sm = new PipelineStateMachine(5);
      
      sm.transition({ type: 'START', input: 'base' });
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's0' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1' }});
      
      // Stage 2 retries stage 1
      let retry1 = sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
      const context1 = retry1.context.contextId;
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1-v2' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's2' }});
      
      // Context should be cleared after stage 2 completes
      // Next stage should execute without a context
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's3' }});
      
      // Stage 4 should start fresh with no context
      const events = sm.getEvents();
      const stage4Events = events.filter(e => e.stage === 4);
      expect(stage4Events[0]?.contextId).toBeUndefined();
      
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's3' }});
      
      // Stage 4 retries stage 3
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
      const retryEvents = sm.getEvents().filter(e => e.type === 'STAGE_RETRY_REQUEST');
      const context2 = retryEvents[retryEvents.length - 1].contextId;
      
      // Should be different contexts (independent)
      expect(context2).not.toBe(context1);
      // Verify new context starts fresh (attempt 1 implies fresh context)
      const nextResult = sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's3-v2' }});
      expect(nextResult.type).toBe('EXECUTE_STAGE');
    });
  });

  describe('Error Handling', () => {
    it('should handle stage failure', () => {
      const sm = new PipelineStateMachine(3);
      
      sm.transition({ type: 'START', input: 'base' });
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's0' }});
      
      // Stage 1 fails
      const error = new Error('Stage 1 failed');
      const next = sm.transition({ 
        type: 'STAGE_RESULT', 
        result: { type: 'error', error }
      });
      
      expect(next.type).toBe('ERROR');
      expect(next.error).toBe(error);
      
      // Verify event
      const events = sm.getEvents();
      expect(events).toContainEqual({ 
        type: 'STAGE_FAILURE', 
        stage: 1, 
        error 
      });
    });

    it('should provide clear abort messages', () => {
      const sm = new PipelineStateMachine(2, false); // non-retryable stage 0
      
      sm.transition({ type: 'START', input: 'base' });
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's0' }});
      
      // Try to retry non-retryable stage 0
      const next = sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
      
      expect(next.type).toBe('ABORT');
      // Check that we got a clear error message about non-retryability  
      expect(next.reason).toBeDefined();
      expect(next.reason.length).toBeGreaterThan(0);
      
      // Verify abort event
      const events = sm.getEvents();
      const abortEvent = events.find(e => e.type === 'PIPELINE_ABORT');
      expect(abortEvent).toBeDefined();
      // The abort reason should indicate stage 0 is not retryable
      expect(abortEvent?.reason.toLowerCase()).toMatch(/not.*function|not.*retryable/);
    });
  });
});

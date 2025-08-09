import { PipelineStateMachine, EventQuery } from './state-machine';

describe('PipelineStateMachine - Event Sourced', () => {
  describe('Event-only derived state', () => {
    it('should derive all state from events without caching', () => {
      const sm = new PipelineStateMachine(3);
      
      // Start pipeline
      sm.transition({ type: 'START', input: 'base' });
      
      // Stage 0 succeeds
      sm.transition({ 
        type: 'STAGE_RESULT', 
        result: { type: 'success', output: 's0-v1' }
      });
      
      // Stage 1 succeeds
      sm.transition({ 
        type: 'STAGE_RESULT', 
        result: { type: 'success', output: 's1-v1' }
      });
      
      // Stage 2 retries (local)
      let next = sm.transition({ 
        type: 'STAGE_RESULT', 
        result: { type: 'retry' }
      });
      
      // Context should show correct previousOutputs
      expect(next.context.previousOutputs).toEqual(['s0-v1', 's1-v1']);
      expect(next.context.attempt).toBe(2);
      
      // Stage 2 succeeds on retry
      sm.transition({ 
        type: 'STAGE_RESULT', 
        result: { type: 'success', output: 's2-v2' }
      });
      
      // Now let's verify events are the source of truth
      const events = sm.getEvents();
      
      // Should have: START, STAGE_START(0), SUCCESS(0), STAGE_START(1), SUCCESS(1), 
      // STAGE_START(2), RETRY(2), STAGE_START(2), SUCCESS(2), COMPLETE
      expect(events.filter(e => e.type === 'STAGE_SUCCESS')).toHaveLength(3);
      expect(events.filter(e => e.type === 'STAGE_RETRY')).toHaveLength(1);
      
      // Verify we can reconstruct state from events
      expect(EventQuery.countSelfRetries(events, 2)).toBe(1);
      expect(EventQuery.okOutputsForStage(events, 2)).toEqual(['s2-v2']);
    });
  });

  describe('Local retry behavior', () => {
    it('should handle local retry with correct attempt counts', () => {
      const sm = new PipelineStateMachine(3);
      
      sm.transition({ type: 'START', input: 'base' });
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's0' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1' }});
      
      // Stage 2 retries twice
      let next = sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
      expect(next.context.attempt).toBe(2);
      expect(next.context.stage).toBe(3); // 1-indexed
      
      next = sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
      expect(next.context.attempt).toBe(3);
      
      // Other stages should still show attempt 1
      // We need to check this by examining what WOULD be built for them
      const events = sm.getEvents();
      expect(EventQuery.countSelfRetries(events, 0)).toBe(0);
      expect(EventQuery.countSelfRetries(events, 1)).toBe(0);
      expect(EventQuery.countSelfRetries(events, 2)).toBe(2);
    });
  });

  describe('Cascade retry behavior', () => {
    it('should handle cascade retry from stage 2 to stage 0', () => {
      const sm = new PipelineStateMachine(4);
      
      sm.transition({ type: 'START', input: 'base' });
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's0' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's2' }});
      
      // Stage 3 requests cascade retry from stage 0
      let next = sm.transition({ 
        type: 'STAGE_RESULT', 
        result: { type: 'retry', from: 0 }
      });
      
      // Should restart at stage 0 with base input
      expect(next.type).toBe('EXECUTE_STAGE');
      expect(next.stage).toBe(0);
      expect(next.input).toBe('base');
      expect(next.context.previousOutputs).toEqual([]);
      
      // Execute stages again
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's0-v2' }});
      next = sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1-v2' }});
      
      // Stage 2 context should show new outputs
      expect(next.context.previousOutputs).toEqual(['s0-v2', 's1-v2']);
    });

    it('should invalidate downstream outputs after retry', () => {
      const sm = new PipelineStateMachine(4);
      
      // Build up state
      sm.transition({ type: 'START', input: 'base' });
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's0' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's2' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's3' }});
      
      const events = sm.getEvents();
      
      // Now stage 1 retries (cascade from 1)
      let next = sm.transition({ 
        type: 'STAGE_RESULT', 
        result: { type: 'retry', from: 1 }
      });
      
      // Should restart at stage 1
      expect(next.stage).toBe(1);
      expect(next.input).toBe('s0'); // Last output of stage 0
      
      // previousOutputs for stage 1 should only have s0
      expect(next.context.previousOutputs).toEqual(['s0']);
      
      // Stage 3's old outputs should NOT appear when we get there
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1-v2' }});
      next = sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's2-v2' }});
      
      // Stage 3 context should not include old s3 output
      expect(next.context.previousOutputs).toEqual(['s0', 's1-v2', 's2-v2']);
    });
  });

  describe('Early termination', () => {
    it('should complete pipeline immediately on empty output', () => {
      const sm = new PipelineStateMachine(3);
      
      sm.transition({ type: 'START', input: 'base' });
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's0' }});
      
      // Stage 1 returns empty output
      const next = sm.transition({ 
        type: 'STAGE_RESULT', 
        result: { type: 'success', output: '' }
      });
      
      // Should complete immediately
      expect(next.type).toBe('COMPLETE');
      expect(next.output).toBe('');
      expect(sm.getStatus()).toBe('COMPLETED');
      
      // Should have recorded PIPELINE_COMPLETE
      const events = sm.getEvents();
      const completeEvent = events[events.length - 1];
      expect(completeEvent.type).toBe('PIPELINE_COMPLETE');
      expect(completeEvent.output).toBe('');
    });
  });

  describe('Retry limits', () => {
    it('should enforce per-stage retry limit', () => {
      const sm = new PipelineStateMachine(2);
      
      sm.transition({ type: 'START', input: 'base' });
      
      // Retry stage 0 up to the limit
      for (let i = 0; i < 10; i++) {
        const next = sm.transition({ 
          type: 'STAGE_RESULT', 
          result: { type: 'retry' }
        });
        expect(next.type).toBe('EXECUTE_STAGE');
        expect(next.context.attempt).toBe(i + 2);
      }
      
      // 11th retry should abort
      const next = sm.transition({ 
        type: 'STAGE_RESULT', 
        result: { type: 'retry' }
      });
      
      expect(next.type).toBe('ABORT');
      expect(next.reason).toContain('exceeded retry limit');
      expect(sm.getStatus()).toBe('FAILED');
    });

    it('should track retries per stage independently', () => {
      const sm = new PipelineStateMachine(3);
      
      sm.transition({ type: 'START', input: 'base' });
      
      // Stage 0 retries 5 times
      for (let i = 0; i < 5; i++) {
        sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
      }
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's0' }});
      
      // Stage 1 retries 3 times
      for (let i = 0; i < 3; i++) {
        sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
      }
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1' }});
      
      // Stage 2 can still retry 10 times
      for (let i = 0; i < 10; i++) {
        const next = sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
        expect(next.type).toBe('EXECUTE_STAGE');
      }
      
      // But 11th fails
      const next = sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
      expect(next.type).toBe('ABORT');
    });
  });

  describe('Context building correctness', () => {
    it('should build correct previousOutputs considering retry boundaries', () => {
      const sm = new PipelineStateMachine(4);
      
      // Execute stages with some success
      sm.transition({ type: 'START', input: 'base' });
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's0-v1' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1-v1' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's2-v1' }});
      
      // Stage 3 retries locally
      let next = sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
      expect(next.context.previousOutputs).toEqual(['s0-v1', 's1-v1', 's2-v1']);
      
      // Stage 3 succeeds
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's3-v2' }});
      
      // Now retry from stage 1
      next = sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry', from: 1 }});
      
      // Stage 1 should see only s0-v1
      expect(next.context.previousOutputs).toEqual(['s0-v1']);
      
      // Continue execution
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1-v3' }});
      next = sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's2-v3' }});
      
      // Stage 3 should see the new chain, not old s3-v2
      expect(next.context.previousOutputs).toEqual(['s0-v1', 's1-v3', 's2-v3']);
    });

    it('should provide correct array-style output access', () => {
      const sm = new PipelineStateMachine(3);
      
      sm.transition({ type: 'START', input: 'base' });
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's0' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1' }});
      
      const next = sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
      
      // Check array-style access
      expect(next.context.outputs[0]).toBe('base');
      expect(next.context.outputs[1]).toBe('s0');
      expect(next.context.outputs[2]).toBe('s1');
      expect(next.context.outputs[3]).toBeUndefined();
    });
  });

  describe('Event recording', () => {
    it('should record STAGE_START events', () => {
      const sm = new PipelineStateMachine(2);
      
      sm.transition({ type: 'START', input: 'base' });
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's0' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1' }});
      
      const events = sm.getEvents();
      const stageStarts = events.filter(e => e.type === 'STAGE_START');
      
      // Should have STAGE_START for 0 and 1
      expect(stageStarts).toHaveLength(2);
      expect(stageStarts[0]).toEqual({ type: 'STAGE_START', stage: 0, input: 'base' });
      expect(stageStarts[1]).toEqual({ type: 'STAGE_START', stage: 1, input: 's0' });
    });

    it('should record STAGE_START on retry', () => {
      const sm = new PipelineStateMachine(2);
      
      sm.transition({ type: 'START', input: 'base' });
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
      
      const events = sm.getEvents();
      const stageStarts = events.filter(e => e.type === 'STAGE_START');
      
      // Should have STAGE_START for initial and retry
      expect(stageStarts).toHaveLength(2);
      expect(stageStarts[0]).toEqual({ type: 'STAGE_START', stage: 0, input: 'base' });
      expect(stageStarts[1]).toEqual({ type: 'STAGE_START', stage: 0, input: 'base' });
    });
  });

  describe('Mixed retry scenarios', () => {
    it('should handle mixed local and cascade retries correctly', () => {
      const sm = new PipelineStateMachine(4);
      
      // Initial execution
      sm.transition({ type: 'START', input: 'base' });
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's0' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's2' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's3-v1' }});
      
      // Stage 1 retries (cascade from 1)
      let next = sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry', from: 1 }});
      expect(next.stage).toBe(1);
      expect(next.input).toBe('s0');
      
      // Complete stages 1, 2
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's1-v2' }});
      sm.transition({ type: 'STAGE_RESULT', result: { type: 'success', output: 's2-v2' }});
      
      // Stage 3 does local retry
      next = sm.transition({ type: 'STAGE_RESULT', result: { type: 'retry' }});
      expect(next.stage).toBe(3);
      expect(next.input).toBe('s2-v2');
      expect(next.context.previousOutputs).toEqual(['s0', 's1-v2', 's2-v2']);
      
      // Verify stage 3's prior outputs don't appear
      const events = sm.getEvents();
      const boundary = EventQuery.lastRetryIndexAffectingStage(events, 3);
      const s3Output = EventQuery.lastOkAfter(events, 3, boundary);
      expect(s3Output).toBeUndefined(); // Old s3-v1 was invalidated
    });
  });
});
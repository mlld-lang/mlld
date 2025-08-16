/**
 * Test suite for pipeline retry mechanism with builtin commands
 * 
 * These tests verify that builtin commands (show, log, output) are treated
 * as effects rather than stages, ensuring retry targets the correct stage.
 */

import { describe, it, expect } from 'vitest';
import { processMlld } from '../api';

describe('Pipeline Retry with Builtin Commands', () => {
  describe('Basic Retry Behavior', () => {
    it('should retry source stage, not builtin show command', async () => {
      const script = `
/exe @retrySource(p) = js {
  const attempt = p.try || 1;
  return attempt < 3 ? "fail" : "success";
}

/exe @check(input, p) = when first [
  @input == "success" => @input
  @p.try < 5 => retry
  * => "gave up"
]

/var @result = @retrySource(@p) | show "Attempt @p.try: @input" | @check(@p)
/show @result
`;

      const output = await processMlld(script);
      
      // Should see attempts with different inputs as source is retried
      expect(output).toContain('Attempt 1: fail');
      expect(output).toContain('Attempt 2: fail');
      expect(output).toContain('Attempt 3: success');
      expect(output).toContain('success'); // Final result
      
      // Should NOT see attempt 4 or 5
      expect(output).not.toContain('Attempt 4');
      expect(output).not.toContain('Attempt 5');
    });

    it('should retry source with log builtin', async () => {
      const script = `
/exe @logGenerator(p) = js {
  const attempt = p.try || 1;
  return \`attempt_\${attempt}\`;
}

/exe @validator(input, p) = when first [
  @input == "attempt_3" => @input
  @p.try < 5 => retry
  * => "failed"
]

/var @result = @logGenerator(@p) | log "Generated: @input" | @validator(@p)
/show @result
`;

      const output = await processMlld(script);
      expect(output).toContain('attempt_3');
      // Log outputs would go to stderr, not captured in main output
    });

    it('should handle output builtin in retry', async () => {
      const script = `
/exe @source(p) = js {
  return p.try < 2 ? "retry_me" : "done";
}

/exe @check(input, p) = when first [
  @input == "done" => @input
  @p.try < 3 => retry
  * => "failed"
]

/var @result = @source(@p) | output to stdout | @check(@p)
/show @result
`;

      const output = await processMlld(script);
      expect(output).toContain('done');
    });
  });

  describe('Multiple Effects', () => {
    it('should not count builtins as stages', async () => {
      const script = `
/exe @stage1() = "s1"
/exe @stage2(input, p) = js { return input + "-s2-stage" + p.stage; }
/exe @stage3(input, p) = js { return input + "-s3-stage" + p.stage; }

/var @result = @stage1() | show "After s1" | log "Processing" | @stage2(@p) | show "After s2" | @stage3(@p)
/show @result
`;

      const output = await processMlld(script);
      
      // Stage 2 should see stage number 2 (source replaces stage1, so stage2 is stage 2)
      expect(output).toContain('s1-s2-stage2');
      
      // Stage 3 should see stage number 3
      expect(output).toContain('s1-s2-stage2-s3-stage3');
    });

    it('should handle consecutive builtins', async () => {
      const script = `
/exe @source() = "data"
/exe @transform(input) = js { return "transformed: " + input; }

/var @result = @source() | show "A" | show "B" | log "C" | @transform
/show @result
`;

      const output = await processMlld(script);
      
      // All effects should execute
      expect(output).toContain('A');
      expect(output).toContain('B');
      // Log "C" goes to stderr
      
      // Final result
      expect(output).toContain('transformed: data');
    });
  });

  describe('Edge Cases', () => {
    it('should handle leading builtin with implicit identity', async () => {
      const script = `
/exe @process(input) = js { return "processed: " + input; }

/var @result = "start" | show @input | @process
/show @result
`;

      const output = await processMlld(script);
      
      // Show should execute with identity input
      expect(output).toContain('start');
      
      // Process should receive "start" as input
      expect(output).toContain('processed: start');
    });

    it('should handle trailing builtin', async () => {
      const script = `
/exe @generate() = "mydata"

/var @result = @generate() | show "Done: @input"
/show @result
`;

      const output = await processMlld(script);
      
      // Show effect should execute
      expect(output).toContain('Done: mydata');
      
      // Pipeline result should be unaffected
      expect(output).toContain('mydata');
    });

    it('should handle pipeline with only builtins', async () => {
      const script = `
/var @data = "hello"
/var @result = @data | show "First: @input" | log "Second: @input"
/show @result
`;

      const output = await processMlld(script);
      
      // Show should execute
      expect(output).toContain('First: hello');
      
      // Result should be pass-through
      expect(output).toContain('hello');
    });

    it('should handle empty pipeline after removing builtins', async () => {
      const script = `
/var @result = "only effects" | show @input
/show @result
`;

      const output = await processMlld(script);
      
      // Effect should execute
      expect(output).toContain('only effects');
      
      // Result should be identity output
      expect(output.trim().split('\n').pop()).toBe('only effects');
    });
  });

  describe('Pipeline Context in Builtins', () => {
    it('should show correct @p.try in builtin', async () => {
      const script = `
/exe @contextGen(p) = js {
  return "attempt_" + (p.try || 1);
}

/exe @check(input, p) = when first [
  @p.try < 3 => retry
  * => @input
]

/var @result = @contextGen(@p) | show "Debug @p.try: @input" | @check(@p)
/show @result
`;

      const output = await processMlld(script);
      
      // Builtin should see the logical stage's attempt count
      expect(output).toContain('Debug 1: attempt_1');
      expect(output).toContain('Debug 2: attempt_2');
      expect(output).toContain('Debug 3: attempt_3');
      expect(output).toContain('attempt_3');
    });

    it('should handle field access in builtin arguments', async () => {
      const script = `
/exe @getPersonData() = js {
  return { name: "Alice", age: 30 };
}

/var @person = @getPersonData()
/var @result = @person | show "Name: @input.name, Age: @input.age"
`;

      const output = await processMlld(script);
      expect(output).toContain('Name: Alice, Age: 30');
    });
  });

  describe('Synthetic Source with Builtins', () => {
    it('should handle synthetic source with immediate builtin', async () => {
      const script = `
/exe @synthGen() = "data"
/exe @check(input, p) = when first [
  @p.try < 2 => retry
  * => @input
]

/run @synthGen() | show "Got: @input" | @check(@p)
`;

      const output = await processMlld(script);
      
      // Should see the effect twice (once per attempt)
      const matches = output.match(/Got: data/g);
      expect(matches).toHaveLength(2);
    });

    it('should retry synthetic source correctly', async () => {
      const script = `
/exe @unstable() = js {
  return Math.random() > 0.8 ? "rare_success" : "common_fail";
}

/exe @requireSuccess(input, p) = when first [
  @input == "rare_success" => @input
  @p.try < 20 => retry
  * => "gave_up"
]

/run @unstable() | show "Try @p.try: @input" | @requireSuccess(@p)
`;

      const output = await processMlld(script);
      
      // Should see multiple attempts
      expect(output).toMatch(/Try \d+:/);
      
      // Should eventually succeed or give up
      expect(output).toMatch(/(rare_success|gave_up)/);
    });
  });

  describe('Error Handling', () => {
    it('should fail pipeline on error in builtin effect', async () => {
      const script = `
/exe @source() = "data"
/var @result = @source() | show @nonexistent | @process
`;

      await expect(processMlld(script)).rejects.toThrow(/Variable not found: nonexistent/);
    });

    it('should not retry on builtin error', async () => {
      const script = `
/exe @source(p) = js {
  return \`attempt_\${p.try || 1}\`;
}

/exe @check(input, p) = when first [
  @p.try < 3 => retry
  * => @input
]

/var @undefined = null
/var @result = @source(@p) | show @undefined.field | @check(@p)
`;

      // Should throw error, not retry indefinitely
      await expect(processMlld(script)).rejects.toThrow();
    });
  });

  describe('Complex Retry Patterns', () => {
    it('should handle nested pipelines with builtins', async () => {
      const script = `
/exe @outer(p) = js {
  return p.try < 2 ? "retry" : "success";
}

/exe @inner(input) = @input | show "Inner: @input"

/exe @check(input, p) = when first [
  @input == "success" => @input
  @p.try < 3 => retry
  * => "failed"
]

/var @result = @outer(@p) | @inner | @check(@p)
/show @result
`;

      const output = await processMlld(script);
      
      // Should retry outer, not inner's show
      expect(output).toContain('Inner: retry');
      expect(output).toContain('Inner: success');
      expect(output).toContain('success');
    });

    it('should handle retry with format pipelines', async () => {
      const script = `
/exe @formatGetData(p) = js {
  const attempt = p.try || 1;
  return attempt < 2 ? [{invalid: true}] : [{valid: true}];
}

/exe @validate(input, p) = js {
  const data = input.data || JSON.parse(input.text || input);
  if (data[0].valid) return "valid";
  if (p.try < 3) return "retry";
  return "invalid";
}

/var @result = @formatGetData(@p) with { 
  format: "json", 
  pipeline: [show "Validating: @input", @validate(@p)]
}
/show @result
`;

      const output = await processMlld(script);
      expect(output).toContain('valid');
    });
  });

  describe('Performance and Regression', () => {
    it('should handle many builtins without performance degradation', async () => {
      const script = `
/exe @source() = "data"
/exe @process(input) = js { return "final: " + input; }

/var @result = @source() | show | show | show | log | log | log | @process
/show @result
`;

      const start = Date.now();
      const output = await processMlld(script);
      const duration = Date.now() - start;
      
      expect(output).toContain('final: data');
      expect(duration).toBeLessThan(1000); // Should complete quickly
    });

    it('should not break existing retry behavior without builtins', async () => {
      const script = `
/exe @regressionGen(p) = js {
  return p.try < 2 ? "fail" : "pass";
}

/exe @transform(input) = js { return "t(" + input + ")"; }

/exe @check(input, p) = when first [
  @input == "t(pass)" => @input
  @p.try < 3 => retry
  * => "failed"
]

/var @result = @regressionGen(@p) | @transform | @check(@p)
/show @result
`;

      const output = await processMlld(script);
      expect(output).toContain('t(pass)');
    });
  });

  describe('Duplicate Execution Prevention', () => {
    it('should not duplicate final output', async () => {
      const script = `
/exe @claude() = "Howdy"
/exe @check(input, p) = when first [
  @input == "Howdy" => show \`SUCCESS: Got Howdy on attempt @p.try\`
  @p.try < 3 => retry
  * => show \`FAILED: After 3 attempts\`
]

/run @claude() | show "Claude said: @input" | @check(@p)
`;

      const output = await processMlld(script);
      
      // Should see SUCCESS only once, not duplicated
      const matches = output.match(/SUCCESS: Got Howdy/g);
      expect(matches).toHaveLength(1);
    });
  });
});
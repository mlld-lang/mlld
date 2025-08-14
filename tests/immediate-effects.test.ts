import { describe, it, expect } from 'vitest';
import { testWithEffects, expectEffectsInOrder } from './helpers/effect-test-helper';

describe('Immediate Effects', () => {
  it('should output immediately in for loops', async () => {
    const input = `/var @items = [1, 2, 3]\n/for @i in @items => show \`@i\``;
    const { output, handler } = await testWithEffects(input);
    
    // Each number should appear as a separate effect (show adds newlines)
    expectEffectsInOrder(handler, ['1\n', '2\n', '3\n']);
    
    // Combined output should be all numbers with newlines
    expect(output).toBe('1\n2\n3\n');
  });
  
  it('should output immediately in nested for loops', async () => {
    // Note: In /for RHS, use 'for' without slash for nested loops
    const input = `/var @xs = ["a", "b"]
/var @ys = [1, 2]
/for @x in @xs => for @y in @ys => show "@x@y "`;
    const { output, handler } = await testWithEffects(input);
    
    // Each combination should appear as a separate effect
    expectEffectsInOrder(handler, ['a1 \n', 'a2 \n', 'b1 \n', 'b2 \n']);
    
    // Combined output
    expect(output).toBe('a1 \na2 \nb1 \nb2 \n');
  });
  
  it('should handle /output to stdout immediately', async () => {
    const input = `/var @items = [1, 2, 3]\n/for @i in @items => output @i to stdout`;
    const { output, handler } = await testWithEffects(input);
    
    // Each output should include newline (added by output.ts)
    expectEffectsInOrder(handler, ['1\n', '2\n', '3\n']);
    
    expect(output).toBe('1\n2\n3\n');
  });
  
  it('should handle /output to stderr immediately', async () => {
    const input = `/var @items = ["error1", "error2"]\n/for @i in @items => output @i to stderr`;
    const { errors, handler } = await testWithEffects(input);
    
    // Check error effects
    const errorEffects = handler.collected
      .filter(e => e.type === 'stderr')
      .map(e => e.content);
    
    expect(errorEffects).toEqual(['error1\n', 'error2\n']);
    expect(errors).toBe('error1\nerror2\n');
  });
  
  it('should output immediately in pipelines within for loops', async () => {
    const input = `/exe @process(input) = \`Processing: @input\`
/var @items = ["a", "b"]
/for @item in @items => show @process(@item)`;
    const { output, handler } = await testWithEffects(input);
    
    expectEffectsInOrder(handler, ['Processing: a\n', 'Processing: b\n']);
    expect(output).toBe('Processing: a\nProcessing: b\n');
  });
});
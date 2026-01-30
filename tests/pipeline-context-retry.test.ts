import { describe, it, expect } from 'vitest';
import { testWithEffects } from './helpers/effect-test-helper';
import { interpret } from '@interpreter/index';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';

describe('Pipeline @mx/@p and retry behavior', () => {
  it('exposes current-stage input via @mx.input and original input via @p[0]; retry increments @pipeline.try', async () => {
    const input = `/exe @source() = \"seed\"\n\n/exe @validator(input, pipeline) = when [\n  @pipeline.try < 3 => retry \"hint!\"\n  * => \`ok try=@pipeline.try base=@p[0] input=@mx.input last=@p[-1] hint=@mx.hint\`\n]\n\n/var @result = @source() with { pipeline: [@validator(@p)] }\n/show @result`;

    const { output } = await testWithEffects(input);
    // Expect the validator to run until try=3, then report values
    expect(output).toContain('ok try=3');
    expect(output).toContain('base=seed');
    // The current stage input is the previous stage output (which is the source value)
    expect(output).toContain('input=seed');
    // At the first visible stage, there is no previous visible stage output
    expect(output).toContain('last= ');
    // hint is visible only inside the retried stage; outside it should be null
    expect(output).toContain('hint=null');
  });

  it('allows retry of stage 0 even when source is a literal', async () => {
    const failing = `/var @literal = \"text\"\n/exe @retryer(input) = when [\n  @pipeline.try < 2 => retry \"x\"\n  * => @input\n]\n/var @out = @literal with { pipeline: [@retryer] }\n/show @out`;

    const { output } = await testWithEffects(failing);
    expect(output.trim()).toBe('text');
  });

  it('supports negative index access on @p', async () => {
    const input = `/exe @stageA(input) = \`A:@input\`\n/exe @stageB(input) = \`B:@input\`\n/exe @emitPrev(input, pipeline) = \`prev=@p[-1] prev2=@p[-2]\`\n\n/var @result = \"x\" with { pipeline: [@stageA, @stageB, @emitPrev(@p)] }\n/show @result`;

    const { output } = await testWithEffects(input);
    expect(output.trim()).toBe('prev=B:A:x prev2=A:x');
  });

  it('aggregates all retry contexts via @p.retries.all', async () => {
    const input = `/exe @seed() = \"base\"\n\n/exe @gen(input, pipeline) = \`v-@pipeline.try: @input\`\n\n/exe @retry2(input, pipeline) = when [\n  @pipeline.try < 3 => retry\n  * => @input\n]\n\n/exe @id(input) = \`@input\`\n\n/exe @retry3(input, pipeline) = when [\n  @pipeline.try < 2 => retry\n  * => @input\n]\n\n/exe @emitAll(input, pipeline) = js {\n  return JSON.stringify(pipeline.retries.all);\n}\n\n/var @result = @seed() with { pipeline: [@gen(@p), @retry2(@p), @id, @retry3(@p), @emitAll(@p)] }\n/show @result`;

    const { output } = await testWithEffects(input);
    // Expect JSON arrays representing attempts from two distinct contexts
    expect(output.trim().startsWith('[')).toBe(true);
    expect(output).toContain('v-'); // should include values produced by @gen attempts
  });
});

import { describe, expect, it } from 'vitest';
import { ArgumentParser } from './ArgumentParser';
import { OptionProcessor } from './OptionProcessor';

describe('ArgumentParser streaming flag', () => {
  it('parses --no-stream', () => {
    const parser = new ArgumentParser();
    const options = parser.parseArgs(['script.mld', '--no-stream']);

    expect(options.noStream).toBe(true);
  });
});

describe('OptionProcessor streaming mapping', () => {
  it('maps noStream to streaming enabled=false', () => {
    const processor = new OptionProcessor();
    const apiOptions = processor.cliToApiOptions({
      input: 'script.mld',
      noStream: true
    } as any);

    expect(apiOptions.streaming).toEqual({ enabled: false });
  });
});

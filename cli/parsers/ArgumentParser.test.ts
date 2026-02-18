import { describe, expect, it } from 'vitest';
import { ArgumentParser } from './ArgumentParser';
import { OptionProcessor } from './OptionProcessor';

describe('ArgumentParser --payload alias', () => {
  it('parses --payload as alias for --inject', () => {
    const parser = new ArgumentParser();
    const options = parser.parseArgs(['script.mld', '--payload', '@data={"name":"test"}']);

    expect(options.inject).toEqual(['@data={"name":"test"}', '@payload={}']);
  });

  it('allows mixing --inject and --payload', () => {
    const parser = new ArgumentParser();
    const options = parser.parseArgs([
      'script.mld',
      '--inject', '@config={"a":1}',
      '--payload', '@data={"b":2}'
    ]);

    expect(options.inject).toEqual(['@config={"a":1}', '@data={"b":2}', '@payload={}']);
  });

  it('supports multiple --payload flags', () => {
    const parser = new ArgumentParser();
    const options = parser.parseArgs([
      'script.mld',
      '--payload', '@a=1',
      '--payload', '@b=2'
    ]);

    expect(options.inject).toEqual(['@a=1', '@b=2', '@payload={}']);
  });
});

describe('ArgumentParser custom payload flags', () => {
  it('collects unknown flags as @payload for file input', () => {
    const parser = new ArgumentParser();
    const options = parser.parseArgs(['script.mld', '--topic', 'vars', '--count', '5']);

    expect(options.inject).toEqual(['@payload={"topic":"vars","count":"5"}']);
  });

  it('treats custom flag without value as boolean true', () => {
    const parser = new ArgumentParser();
    const options = parser.parseArgs(['script.mld', '--dry-run']);

    expect(options.inject).toEqual(['@payload={"dryRun":true}']);
  });

  it('converts kebab-case flags to camelCase in payload', () => {
    const parser = new ArgumentParser();
    const options = parser.parseArgs(['script.mld', '--output-format', 'json', '--max-retries', '3']);

    expect(options.inject).toEqual(['@payload={"outputFormat":"json","maxRetries":"3"}']);
  });

  it('merges --inject with custom payload flags', () => {
    const parser = new ArgumentParser();
    const options = parser.parseArgs([
      'script.mld',
      '--inject', '@config={"a":1}',
      '--topic', 'mlld'
    ]);

    expect(options.inject).toEqual(['@config={"a":1}', '@payload={"topic":"mlld"}']);
  });
});

describe('ArgumentParser eval mode', () => {
  it('parses -e/--eval inline code', () => {
    const parser = new ArgumentParser();
    const options = parser.parseArgs(['-e', 'show @now']);

    expect(options.eval).toBe('show @now');
    expect(options.input).toBe('');
  });

  it('accepts empty eval string', () => {
    const parser = new ArgumentParser();
    const options = parser.parseArgs(['--eval', '']);

    expect(options.eval).toBe('');
  });

  it('throws when --eval has no argument', () => {
    const parser = new ArgumentParser();

    expect(() => parser.parseArgs(['-e'])).toThrow('--eval requires a code string');
  });

  it('throws when both input file and --eval are provided', () => {
    const parser = new ArgumentParser();

    expect(() => parser.parseArgs(['script.mld', '--eval', 'show @now'])).toThrow(
      'Cannot specify both an input file and --eval'
    );
  });
});

describe('ArgumentParser streaming flag', () => {
  it('parses --no-stream', () => {
    const parser = new ArgumentParser();
    const options = parser.parseArgs(['script.mld', '--no-stream']);

    expect(options.noStream).toBe(true);
  });

  it('parses --json', () => {
    const parser = new ArgumentParser();
    const options = parser.parseArgs(['script.mld', '--json']);

    expect(options.json).toBe(true);
  });

  it('parses --show-json', () => {
    const parser = new ArgumentParser();
    const options = parser.parseArgs(['script.mld', '--show-json']);

    expect(options.json).toBe(true);
    expect(options.showJson).toBe(true);
  });
});

describe('ArgumentParser streaming visibility flags', () => {
  it('parses --show-thinking', () => {
    const parser = new ArgumentParser();
    const options = parser.parseArgs(['script.mld', '--show-thinking']);

    expect(options.showThinking).toBe(true);
  });

  it('parses --show-tools', () => {
    const parser = new ArgumentParser();
    const options = parser.parseArgs(['script.mld', '--show-tools']);

    expect(options.showTools).toBe(true);
  });

  it('parses --show-metadata', () => {
    const parser = new ArgumentParser();
    const options = parser.parseArgs(['script.mld', '--show-metadata']);

    expect(options.showMetadata).toBe(true);
  });

  it('parses --show-all-streaming', () => {
    const parser = new ArgumentParser();
    const options = parser.parseArgs(['script.mld', '--show-all-streaming']);

    expect(options.showAllStreaming).toBe(true);
  });

  it('parses --stream-format text', () => {
    const parser = new ArgumentParser();
    const options = parser.parseArgs(['script.mld', '--stream-format', 'text']);

    expect(options.streamOutputFormat).toBe('text');
  });

  it('parses --stream-format ansi', () => {
    const parser = new ArgumentParser();
    const options = parser.parseArgs(['script.mld', '--stream-format', 'ansi']);

    expect(options.streamOutputFormat).toBe('ansi');
  });

  it('throws on invalid --stream-format', () => {
    const parser = new ArgumentParser();

    expect(() => parser.parseArgs(['script.mld', '--stream-format', 'invalid'])).toThrow(
      '--stream-format must be "text", "ansi", or "json"'
    );
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

  it('maps visibility flags to streaming visibility', () => {
    const processor = new OptionProcessor();
    const apiOptions = processor.cliToApiOptions({
      input: 'script.mld',
      showThinking: true,
      showTools: true
    } as any);

    expect(apiOptions.streaming).toEqual({
      visibility: {
        showThinking: true,
        showTools: true
      }
    });
  });

  it('maps showAllStreaming to visibility.showAll', () => {
    const processor = new OptionProcessor();
    const apiOptions = processor.cliToApiOptions({
      input: 'script.mld',
      showAllStreaming: true
    } as any);

    expect(apiOptions.streaming).toEqual({
      visibility: {
        showAll: true
      }
    });
  });

  it('maps streamOutputFormat to streaming.format', () => {
    const processor = new OptionProcessor();
    const apiOptions = processor.cliToApiOptions({
      input: 'script.mld',
      streamOutputFormat: 'ansi'
    } as any);

    expect(apiOptions.streaming).toEqual({
      format: 'ansi'
    });
  });

  it('combines all streaming options', () => {
    const processor = new OptionProcessor();
    const apiOptions = processor.cliToApiOptions({
      input: 'script.mld',
      noStream: false,
      showThinking: true,
      streamOutputFormat: 'text'
    } as any);

    expect(apiOptions.streaming).toEqual({
      enabled: true,
      visibility: {
        showThinking: true
      },
      format: 'text'
    });
  });
});

describe('ArgumentParser live command', () => {
  it('treats live as subcommand-style command and preserves --stdio in remaining args', () => {
    const parser = new ArgumentParser();
    const options = parser.parseArgs(['live', '--stdio']);

    expect(options.input).toBe('live');
    expect(options._).toEqual(['--stdio']);
  });
});

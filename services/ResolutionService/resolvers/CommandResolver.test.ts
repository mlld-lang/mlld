import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommandResolver } from './CommandResolver';
import { IStateService } from '../../StateService/IStateService';
import { ResolutionContext } from '../IResolutionService';
import { ResolutionError } from '../errors/ResolutionError';

describe('CommandResolver', () => {
  let resolver: CommandResolver;
  let stateService: IStateService;
  let context: ResolutionContext;

  beforeEach(() => {
    stateService = {
      getCommand: vi.fn(),
      setCommand: vi.fn(),
    } as unknown as IStateService;

    resolver = new CommandResolver(stateService);

    context = {
      currentFilePath: 'test.meld',
      allowedVariableTypes: {
        text: true,
        data: true,
        path: true,
        command: true
      },
      allowCommands: true
    };
  });

  describe('resolve', () => {
    it('should resolve simple command without parameters', async () => {
      vi.mocked(stateService.getCommand).mockReturnValue({
        command: '@run [echo test]'
      });

      const result = await resolver.resolve('simple', [], context);
      expect(result).toBe('echo test');
      expect(stateService.getCommand).toHaveBeenCalledWith('simple');
    });

    it('should resolve command with parameters', async () => {
      vi.mocked(stateService.getCommand).mockReturnValue({
        command: '@run [echo ${param1} ${param2}]'
      });

      const result = await resolver.resolve('echo', ['hello', 'world'], context);
      expect(result).toBe('echo hello world');
      expect(stateService.getCommand).toHaveBeenCalledWith('echo');
    });

    it('should handle commands with options', async () => {
      vi.mocked(stateService.getCommand).mockReturnValue({
        command: '@run [echo ${text}]',
        options: { background: true }
      });

      const result = await resolver.resolve('echo', ['test'], context);
      expect(result).toBe('echo test');
    });
  });

  describe('error handling', () => {
    it('should throw when commands are not allowed', async () => {
      context.allowCommands = false;

      await expect(resolver.resolve('cmd', [], context))
        .rejects
        .toThrow('Command references are not allowed in this context');
    });

    it('should throw on undefined command', async () => {
      vi.mocked(stateService.getCommand).mockReturnValue(undefined);

      await expect(resolver.resolve('missing', [], context))
        .rejects
        .toThrow('Undefined command: missing');
    });

    it('should throw on invalid command format', async () => {
      vi.mocked(stateService.getCommand).mockReturnValue({
        command: 'invalid format'
      });

      await expect(resolver.resolve('invalid', [], context))
        .rejects
        .toThrow('Invalid command definition: must start with @run [');
    });

    it('should throw on parameter count mismatch', async () => {
      vi.mocked(stateService.getCommand).mockReturnValue({
        command: '@run [echo ${one} ${two}]'
      });

      await expect(resolver.resolve('echo', ['one'], context))
        .rejects
        .toThrow('Command echo expects 2 parameters but got 1');
    });
  });

  describe('parseCommandReference', () => {
    it('should parse simple command without args', () => {
      const result = resolver.parseCommandReference('$cmd()');
      expect(result).toEqual({
        cmd: 'cmd',
        args: ['']
      });
    });

    it('should parse command with single arg', () => {
      const result = resolver.parseCommandReference('$cmd(arg)');
      expect(result).toEqual({
        cmd: 'cmd',
        args: ['arg']
      });
    });

    it('should parse command with multiple args', () => {
      const result = resolver.parseCommandReference('$cmd(one, two, three)');
      expect(result).toEqual({
        cmd: 'cmd',
        args: ['one', 'two', 'three']
      });
    });

    it('should handle whitespace in args', () => {
      const result = resolver.parseCommandReference('$cmd( arg1 ,  arg2 )');
      expect(result).toEqual({
        cmd: 'cmd',
        args: ['arg1', 'arg2']
      });
    });

    it('should return null for invalid format', () => {
      expect(resolver.parseCommandReference('not a command')).toBeNull();
      expect(resolver.parseCommandReference('$cmd')).toBeNull();
      expect(resolver.parseCommandReference('$cmd[')).toBeNull();
    });
  });

  describe('extractReferences', () => {
    it('should extract simple command reference', () => {
      const refs = resolver.extractReferences('$cmd()');
      expect(refs).toEqual(['cmd']);
    });

    it('should extract multiple command references', () => {
      const refs = resolver.extractReferences('$one() and $two()');
      expect(refs).toEqual(['one', 'two']);
    });

    it('should extract only command names, not args', () => {
      const refs = resolver.extractReferences('$cmd(arg1, arg2)');
      expect(refs).toEqual(['cmd']);
    });

    it('should handle repeated references', () => {
      const refs = resolver.extractReferences('$cmd() and $cmd()');
      expect(refs).toEqual(['cmd', 'cmd']);
    });

    it('should return empty array for no references', () => {
      const refs = resolver.extractReferences('no commands here');
      expect(refs).toEqual([]);
    });

    it('should only match valid command names', () => {
      const refs = resolver.extractReferences('$valid() $123invalid() $_valid()');
      expect(refs).toEqual(['valid', '_valid']);
    });
  });
}); 
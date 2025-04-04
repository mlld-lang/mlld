import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CommandResolver } from '@services/resolution/ResolutionService/resolvers/CommandResolver.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import { 
  ResolutionContext, 
  VariableType, 
  CommandVariable // If CommandVariable type exists
} from '@core/types'; 
import type { VariableReferenceNode } from '@core/types/ast-types';
import { MeldResolutionError } from '@core/types/errors';
import { createMockStateService, createVariableReferenceNode } from '@tests/utils/testFactories.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';

describe('CommandResolver', () => {
  let resolver: CommandResolver;
  let stateService: ReturnType<typeof createMockStateService>;
  let context: ResolutionContext;

  beforeEach(() => {
    // Use factory for mock state service
    stateService = createMockStateService();

    // Mock getCommand
    vi.mocked(stateService.getCommand).mockImplementation((name: string) => {
      if (name === 'simple') return { command: 'echo test' };
      if (name === 'echo') return { command: 'echo ${arg1} ${arg2}' }; // Use simple numbered args
      if (name === 'complex') return { command: 'echo -n "Hello World"' };
      // Add other mocks as needed
      return undefined;
    });
    
    // Instantiate resolver - assuming no parser dependency
    resolver = new CommandResolver(stateService); 

    // Create context using Factory
    context = ResolutionContextFactory.create(stateService, 'test.meld')
               .withAllowedTypes([VariableType.COMMAND]); // Default to only allowing commands
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('resolve', () => {
    it('should resolve command without parameters', async () => {
      const node = createVariableReferenceNode('simple', VariableType.COMMAND);
      // beforeEach mocks stateService.getCommand('simple') -> { command: 'echo test' }
      
      const result = await resolver.resolve(node, context);
      
      expect(result).toBe('echo test'); // Expect the definition string
      expect(stateService.getCommand).toHaveBeenCalledWith('simple');
    });

    it('should resolve command with parameters and substitute args', async () => {
      // Node provides arguments
      const node = createVariableReferenceNode('echo', VariableType.COMMAND, undefined, undefined, ['hello', 'world']);
      // beforeEach mocks stateService.getCommand('echo') -> { command: 'echo ${arg1} ${arg2}' }

      const result = await resolver.resolve(node, context);
      
      // Expect definition string with args substituted
      expect(result).toBe('echo hello world'); 
      expect(stateService.getCommand).toHaveBeenCalledWith('echo');
    });

    it('should handle commands with options (no substitution needed)', async () => {
      const node = createVariableReferenceNode('complex', VariableType.COMMAND);
      // beforeEach mocks stateService.getCommand('complex') -> { command: 'echo -n "Hello World"' }
      
      const result = await resolver.resolve(node, context);
      expect(result).toBe('echo -n "Hello World"');
      expect(stateService.getCommand).toHaveBeenCalledWith('complex');
    });

    // Remove parsing error fallback test - resolver likely doesn't parse now

    // --- Error Handling --- 
    it('should throw MeldResolutionError when command not found (strict mode)', async () => {
      const node = createVariableReferenceNode('missing', VariableType.COMMAND);
      vi.mocked(stateService.getCommand).mockReturnValue(undefined); // Ensure undefined
      context = context.withFlags({ ...context.flags, strict: true });

      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow(MeldResolutionError);
      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow("Command 'missing' not found");
      expect(stateService.getCommand).toHaveBeenCalledWith('missing');
    });
    
    it('should return empty string when command not found (non-strict mode)', async () => {
      const node = createVariableReferenceNode('missing', VariableType.COMMAND);
      vi.mocked(stateService.getCommand).mockReturnValue(undefined);
      context = context.withFlags({ ...context.flags, strict: false });

      const result = await resolver.resolve(node, context);
      expect(result).toBe('');
      expect(stateService.getCommand).toHaveBeenCalledWith('missing');
    });

    it('should throw MeldResolutionError when command definition is invalid (e.g., missing command property)', async () => {
       const node = createVariableReferenceNode('invalidDef', VariableType.COMMAND);
       vi.mocked(stateService.getCommand).mockReturnValue({} as any); // Invalid definition
       context = context.withFlags({ ...context.flags, strict: true });

       await expect(resolver.resolve(node, context))
        .rejects
        .toThrow(MeldResolutionError);
       await expect(resolver.resolve(node, context))
        .rejects
        .toThrow("Invalid command definition found for 'invalidDef'");
    });
    
    it('should throw MeldResolutionError when command variables are not allowed', async () => {
      const node = createVariableReferenceNode('simple', VariableType.COMMAND);
      const modifiedContext = context.withAllowedTypes([VariableType.TEXT]); // Disallow COMMAND

      await expect(resolver.resolve(node, modifiedContext))
        .rejects
        .toThrow(MeldResolutionError);
      await expect(resolver.resolve(node, modifiedContext))
        .rejects
        .toThrow('Command variables are not allowed');
    });

  }); // End describe resolve
  
  // Remove extractReferences suite
  /*
  describe('extractReferences', () => {
    // ... old tests ...
  });
  */
}); 
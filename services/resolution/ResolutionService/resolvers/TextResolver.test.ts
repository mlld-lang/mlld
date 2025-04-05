import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TextResolver } from '@services/resolution/ResolutionService/resolvers/TextResolver.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import { 
  ResolutionContext, 
  VariableType, 
  TextVariable 
} from '@core/types';
import { MeldResolutionError } from '@core/errors/index.js';
import { createMockStateService } from '@tests/utils/testFactories.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { 
  expectThrowsWithSeverity, 
  expectWarningsInPermissiveMode,
  ErrorCollector,
  createPermissiveModeOptions
} from '@tests/utils/ErrorTestUtils.js';

describe('TextResolver', () => {
  let resolver: TextResolver;
  let stateService: ReturnType<typeof createMockStateService>;
  let context: ResolutionContext;

  beforeEach(() => {
    stateService = createMockStateService();

    vi.mocked(stateService.getTextVar).mockImplementation((name: string): TextVariable | undefined => {
      if (name === 'test') return { name: 'test', valueType: VariableType.TEXT, value: 'resolved', source: {type: 'definition', filePath: 'mock'} };
      if (name === 'ENV_TEST_ENV_VAR') return { name, valueType: VariableType.TEXT, value: 'test-value', source: {type: 'environment'} };
      return undefined;
    });

    resolver = new TextResolver(stateService);

    context = ResolutionContextFactory.create(stateService, 'test.meld');
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('resolve', () => {
    it('should return plain text unchanged', async () => {
      const inputText = 'no variables here';
      // Assuming resolve now takes a string
      const result = await resolver.resolve(inputText, context);
      expect(result).toBe('no variables here');
    });

    it('should resolve simple text variable', async () => {
      const inputText = '{{test}}';
      // beforeEach mocks stateService.getTextVar('test') to return TextVariable
      const result = await resolver.resolve(inputText, context);
      expect(result).toBe('resolved');
      expect(stateService.getTextVar).toHaveBeenCalledWith('test');
    });

    it('should handle environment variables appropriately', async () => {
      const originalEnv = { ...process.env }; // Clone original env
      try {
        process.env.TEST_ENV_VAR = 'test-value';
        
        // Test resolving existing ENV var
        const inputTextExisting = '{{ENV_TEST_ENV_VAR}}';
        // beforeEach mocks stateService for ENV_TEST_ENV_VAR
        const resultExisting = await resolver.resolve(inputTextExisting, context);
        expect(resultExisting).toBe('test-value');
        expect(stateService.getTextVar).toHaveBeenCalledWith('ENV_TEST_ENV_VAR');

        // Test resolving missing ENV var (strict mode)
        const inputTextMissing = '{{ENV_MISSING_VAR}}';
        context = context.withFlags({ ...context.flags, strict: true }); // Ensure strict
        
        await expect(resolver.resolve(inputTextMissing, context))
          .rejects
          .toThrow(MeldResolutionError);
        // Optional: Check specific message/code if needed
        // .toThrow('Environment variable not set: MISSING_VAR');

        // Test resolving missing ENV var (non-strict mode)
        context = context.withFlags({ ...context.flags, strict: false }); // Ensure non-strict
        const resultMissingNonStrict = await resolver.resolve(inputTextMissing, context);
        expect(resultMissingNonStrict).toBe(''); // Expect empty string in non-strict

      } finally {
        process.env = originalEnv; // Restore original env
      }
    });

    it('should handle undefined variables', async () => {
      const inputText = '{{undefinedVar}}';
      // stateService.getTextVar will return undefined based on beforeEach mock

      // Test strict mode
      context = context.withFlags({ ...context.flags, strict: true }); // Ensure strict
      await expect(resolver.resolve(inputText, context))
        .rejects
        .toThrow(MeldResolutionError);
      // Optional: Check specific message/code if needed
      // .toThrow("Undefined text variable 'undefinedVar'");
      
      // Test non-strict mode
      context = context.withFlags({ ...context.flags, strict: false }); // Ensure non-strict
      const resultNonStrict = await resolver.resolve(inputText, context);
      expect(resultNonStrict).toBe('');
    });

    // ADD test for mixed content
    it('should resolve variables within mixed text content', async () => {
      const inputText = 'Hello {{test}} world';
      const result = await resolver.resolve(inputText, context);
      expect(result).toBe('Hello resolved world');
      expect(stateService.getTextVar).toHaveBeenCalledWith('test');
    });

  });

  describe('error handling', () => {
    it('should throw when text variables are not allowed', async () => {
      // Modify context to disallow text
      const modifiedContext = context.withAllowedTypes([
        VariableType.DATA, VariableType.PATH, VariableType.COMMAND
      ]);
      const inputText = '{{test}}';

      // Expect MeldResolutionError when resolving disallowed type
      await expect(resolver.resolve(inputText, modifiedContext))
        .rejects
        .toThrow(MeldResolutionError);
        // Optional: Check specific message/code
        // .toThrow('Text variables are not allowed in this context');
    });

    // Remove tests for invalid node type and missing variable name as likely obsolete
    
  });
}); 
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TextDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { DirectiveNode, InterpolatableValue, VariableReferenceNode, TextNode } from '@core/syntax/types/nodes.js';
import type { DirectiveProcessingContext, FormattingContext } from '@core/types/index.js';
import type { ResolutionContext } from '@core/types/resolution.js';
import { VariableType, TextVariable, createTextVariable } from '@core/types/variables.js';
import { DirectiveTestFixture } from '@tests/utils/fixtures/DirectiveTestFixture.js';

/**
 * TextDirectiveHandler Command Test Status
 * --------------------------------
 * 
 * MIGRATION STATUS: Complete
 * 
 * This test file has been fully migrated to use:
 * - TestContextDI for container management
 * - Standardized mock factories with vitest-mock-extended
 */

describe('TextDirectiveHandler - Command Execution', () => {
  let fixture: DirectiveTestFixture;
  let handler: TextDirectiveHandler;

  beforeEach(async () => {
    // Create fixture and resolve handler
    fixture = await DirectiveTestFixture.create();
    handler = await fixture.context.resolve(TextDirectiveHandler);
    fixture.handler = handler; // Assign handler to fixture
  });

  afterEach(async () => {
    await fixture?.cleanup();
  });

  it('should execute command and store its output', async () => {
    const identifier = 'cmdOutput';
    const command = 'echo "Hello Command"';
    const nodeValue = '@run [echo "Hello Command"]'; // Keep original value for reference

    // Create node using fixture
    const node = fixture.createDirectiveNode('text', identifier, nodeValue);
    // Manually add the expected structure for source='run'
    node.directive.source = 'run';
    node.directive.run = { 
      subtype: 'runCommand', // Assuming parser identifies this subtype
      command: [{ type: 'Text', content: command } as TextNode]
    };

    // Configure mocks needed for this test
    vi.spyOn(fixture.fileSystemService, 'getCwd').mockReturnValue('/test');
    vi.spyOn(fixture.fileSystemService, 'executeCommand').mockResolvedValue({ stdout: 'Hello Command\n', stderr: '' });
    vi.spyOn(fixture.resolutionService, 'resolveNodes').mockResolvedValue(command); // Assume command string is resolved directly
    const setVariableSpy = vi.spyOn(fixture.stateService, 'setVariable');

    await fixture.executeHandler(node);

    expect(fixture.fileSystemService.executeCommand).toHaveBeenCalledWith(command, { cwd: '/test' });
    expect(setVariableSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'text',
      name: identifier,
      value: 'Hello Command'
    }));
  });
  
  it('should handle variable references in command input', async () => {
    const identifier = 'cmdOutputVar';
    const nodeValue = '@run [echo "Input: {{inputVar}}"]';
    const commandTemplateNodes: InterpolatableValue = [
      { type: 'Text', content: 'echo "Input: ' } as TextNode, 
      { type: 'VariableReference', identifier: 'inputVar' } as VariableReferenceNode,
      { type: 'Text', content: '"' } as TextNode
    ];
    const resolvedCommand = 'echo "Input: test value"';

    const node = fixture.createDirectiveNode('text', identifier, nodeValue);
    node.directive.source = 'run';
    node.directive.run = { 
      subtype: 'runCommand', 
      command: commandTemplateNodes
    };

    // Configure mocks needed for this test
    vi.spyOn(fixture.fileSystemService, 'getCwd').mockReturnValue('/test');
    const resolveNodesSpy = vi.spyOn(fixture.resolutionService, 'resolveNodes').mockResolvedValue(resolvedCommand);
    vi.spyOn(fixture.fileSystemService, 'executeCommand').mockResolvedValue({ stdout: 'Input: test value\n', stderr: '' });
    const setVariableSpy = vi.spyOn(fixture.stateService, 'setVariable');

    await fixture.executeHandler(node);

    expect(resolveNodesSpy).toHaveBeenCalledWith(commandTemplateNodes, expect.anything());
    expect(fixture.fileSystemService.executeCommand).toHaveBeenCalledWith(resolvedCommand, { cwd: '/test' });
    expect(setVariableSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'text',
      name: identifier,
      value: 'Input: test value'
    }));
  });
  
  it('should handle special characters in command outputs', async () => {
    const identifier = 'specialOutput';
    const command = 'echo "special chars: \'\"\\`$"';
    const nodeValue = '@run [echo "special chars: \'\"\\`$"]';
    const expectedOutput = 'special chars: \'\"\\`$';

    const node = fixture.createDirectiveNode('text', identifier, nodeValue);
    node.directive.source = 'run';
    node.directive.run = { 
      subtype: 'runCommand', 
      command: [{ type: 'Text', content: command } as TextNode]
    };

    // Configure mocks needed for this test
    vi.spyOn(fixture.fileSystemService, 'getCwd').mockReturnValue('/test');
    const resolveNodesSpy = vi.spyOn(fixture.resolutionService, 'resolveNodes').mockResolvedValue(command);
    vi.spyOn(fixture.fileSystemService, 'executeCommand').mockResolvedValue({ stdout: `${expectedOutput}\n`, stderr: '' });
    const setVariableSpy = vi.spyOn(fixture.stateService, 'setVariable');

    await fixture.executeHandler(node);

    expect(fixture.fileSystemService.executeCommand).toHaveBeenCalledWith(command, { cwd: '/test' });
    expect(setVariableSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'text',
      name: identifier,
      value: expectedOutput
    }));
  });
  
  it('should handle multi-line command outputs', async () => {
    const identifier = 'multiLineOutput';
    const command = 'echo "line1\nline2"';
    const nodeValue = '@run [echo "line1\nline2"]';
    const expectedOutput = 'line1\nline2';

    const node = fixture.createDirectiveNode('text', identifier, nodeValue);
    node.directive.source = 'run';
    node.directive.run = { 
      subtype: 'runCommand', 
      command: [{ type: 'Text', content: command } as TextNode]
    };

    // Configure mocks needed for this test
    vi.spyOn(fixture.fileSystemService, 'getCwd').mockReturnValue('/test');
    const resolveNodesSpy = vi.spyOn(fixture.resolutionService, 'resolveNodes').mockResolvedValue(command);
    vi.spyOn(fixture.fileSystemService, 'executeCommand').mockResolvedValue({ stdout: `${expectedOutput}\n`, stderr: '' });
    const setVariableSpy = vi.spyOn(fixture.stateService, 'setVariable');

    await fixture.executeHandler(node);

    expect(fixture.fileSystemService.executeCommand).toHaveBeenCalledWith(command, { cwd: '/test' });
    expect(setVariableSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'text',
      name: identifier,
      value: expectedOutput
    }));
  });
  
  it('should handle nested variable references across multiple levels', async () => {
    // This test is complex and relies heavily on accurate mocking of resolveNodes
    const identifier = 'cmdOutputNested';
    const nodeValue = '@run [echo "Final: {{level2}}"]';
    const commandTemplateNodes: InterpolatableValue = [
      { type: 'Text', content: 'echo "Final: ' } as TextNode,
      { type: 'VariableReference', identifier: 'level2' } as VariableReferenceNode,
      { type: 'Text', content: '"' } as TextNode
    ];
    const resolvedCommand = 'echo "Final: Level 2 references Level 1 output"'; // Mock resolution
    const finalOutput = 'Final: Level 2 references Level 1 output';

    const node = fixture.createDirectiveNode('text', identifier, nodeValue);
    node.directive.source = 'run';
    node.directive.run = { 
      subtype: 'runCommand', 
      command: commandTemplateNodes
    };

    // Configure mocks needed for this test
    vi.spyOn(fixture.fileSystemService, 'getCwd').mockReturnValue('/test');
    const resolveNodesSpy = vi.spyOn(fixture.resolutionService, 'resolveNodes').mockResolvedValue(resolvedCommand);
    vi.spyOn(fixture.fileSystemService, 'executeCommand').mockResolvedValue({ stdout: `${finalOutput}\n`, stderr: '' });
    const setVariableSpy = vi.spyOn(fixture.stateService, 'setVariable');

    await fixture.executeHandler(node);

    expect(resolveNodesSpy).toHaveBeenCalledWith(commandTemplateNodes, expect.anything());
    expect(fixture.fileSystemService.executeCommand).toHaveBeenCalledWith(resolvedCommand, { cwd: '/test' });
    expect(setVariableSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'text',
      name: identifier,
      value: finalOutput
    }));
  });
}); 
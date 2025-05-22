import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InterpreterService } from './InterpreterService.new';
import { StateService } from '@services/state/StateService/StateService';
import type { IDirectiveService } from '@services/pipeline/DirectiveService/IDirectiveService.new';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import type { TextNode, DirectiveNode, VariableReferenceNode } from '@core/ast/types';
import { MeldInterpreterError } from '@core/errors';
import { VariableType, createTextVariable } from '@core/types';

describe('Minimal InterpreterService', () => {
  let interpreterService: InterpreterService;
  let mockDirectiveService: Partial<IDirectiveService>;
  let mockResolutionService: Partial<IResolutionService>;

  beforeEach(() => {
    mockDirectiveService = {
      handleDirective: vi.fn().mockResolvedValue({
        stateChanges: undefined
      })
    };

    mockResolutionService = {
      resolveNodes: vi.fn().mockResolvedValue('resolved')
    };

    interpreterService = new InterpreterService(
      mockDirectiveService as IDirectiveService,
      mockResolutionService as IResolutionService
    );
  });

  it('should process text nodes', async () => {
    const state = new StateService();
    const textNode: TextNode = {
      type: 'Text',
      nodeId: 'text-1',
      content: 'Hello, World!'
    };

    const result = await interpreterService.interpret([textNode], {}, state);
    
    expect(result.getNodes()).toHaveLength(1);
    expect(result.getNodes()[0]).toBe(textNode);
  });

  it('should process directive nodes', async () => {
    const state = new StateService();
    const directive: DirectiveNode = {
      type: 'Directive',
      nodeId: 'dir-1',
      kind: 'text',
      subtype: 'textAssignment',
      values: {},
      raw: { identifier: 'test' },
      meta: {}
    } as DirectiveNode;

    const variable = createTextVariable('test', 'test value');
    mockDirectiveService.handleDirective = vi.fn().mockResolvedValue({
      stateChanges: {
        variables: { test: variable }
      }
    });

    const result = await interpreterService.interpret([directive], {}, state);
    
    expect(mockDirectiveService.handleDirective).toHaveBeenCalledWith(
      directive,
      expect.any(Object),
      { strict: true, filePath: undefined }
    );
    expect(result.getVariable('test')).toBeDefined();
    expect(result.getVariable('test')?.value).toBe('test value');
  });

  it('should process variable references', async () => {
    const state = new StateService();
    state.setVariable(createTextVariable('myVar', 'variable value'));

    const varRef: VariableReferenceNode = {
      type: 'VariableReference',
      nodeId: 'var-1',
      identifier: 'myVar',
      isVariableReference: true,
      valueType: 'identifier'
    };

    const result = await interpreterService.interpret([varRef], {}, state);
    
    // Should have original node plus resolved text node
    expect(result.getNodes()).toHaveLength(2);
    const textNode = result.getNodes().find(n => n.type === 'Text') as TextNode;
    expect(textNode?.content).toBe('variable value');
  });

  it('should throw error for missing variable in strict mode', async () => {
    const state = new StateService();
    const varRef: VariableReferenceNode = {
      type: 'VariableReference',
      nodeId: 'var-1',
      identifier: 'missingVar',
      isVariableReference: true,
      valueType: 'identifier'
    };

    await expect(
      interpreterService.interpret([varRef], { strict: true }, state)
    ).rejects.toThrow(MeldInterpreterError);
  });

  it('should not throw error for missing variable in non-strict mode', async () => {
    const state = new StateService();
    const varRef: VariableReferenceNode = {
      type: 'VariableReference',
      nodeId: 'var-1',
      identifier: 'missingVar',
      isVariableReference: true,
      valueType: 'identifier'
    };

    const result = await interpreterService.interpret([varRef], { strict: false }, state);
    
    // Should only have the variable reference node
    expect(result.getNodes()).toHaveLength(1);
  });

  it('should handle directive replacements', async () => {
    const state = new StateService();
    const directive: DirectiveNode = {
      type: 'Directive',
      nodeId: 'dir-1',
      kind: 'run',
      subtype: 'runCommand',
      values: {},
      raw: {},
      meta: {}
    } as DirectiveNode;

    const replacementNode: TextNode = {
      type: 'Text',
      nodeId: 'replacement-1',
      content: 'Command output'
    };

    mockDirectiveService.handleDirective = vi.fn().mockResolvedValue({
      replacement: [replacementNode]
    });

    const result = await interpreterService.interpret([directive], {}, state);
    
    // Should have both the directive and its replacement
    expect(result.getNodes()).toHaveLength(2);
    expect(result.getNodes()[1]).toBe(replacementNode);
  });

  it('should throw error for invalid input', async () => {
    await expect(
      interpreterService.interpret(null as any)
    ).rejects.toThrow('No nodes provided');

    await expect(
      interpreterService.interpret('not an array' as any)
    ).rejects.toThrow('Invalid nodes provided');
  });

  it('should set file path from options', async () => {
    const state = new StateService();
    const textNode: TextNode = {
      type: 'Text',
      nodeId: 'text-1',
      content: 'Test'
    };

    const result = await interpreterService.interpret(
      [textNode],
      { filePath: '/test/file.meld' },
      state
    );
    
    expect(result.currentFilePath).toBe('/test/file.meld');
  });
});
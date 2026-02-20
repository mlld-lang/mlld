import { describe, it, expect, beforeEach } from 'vitest';
import { Environment } from '../env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { evaluateIf } from './if';
import { evaluateExeBlock } from './exe';
import type { IfNode } from '@core/types/if';
import type { ExeBlockNode, ExeReturnNode } from '@core/types';
import type { AugmentedAssignmentNode } from '@core/types/when';
import { createSimpleTextVariable } from '@core/types/variable';
import { extractVariableValue } from '../utils/variable-resolution';

describe('evaluateIf', () => {
  let env: Environment;

  beforeEach(() => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    env = new Environment(fileSystem, pathService, '/');
  });

  it('executes then branch when condition is true', async () => {
    const node: IfNode = {
      type: 'Directive',
      kind: 'if',
      subtype: 'ifBlock',
      values: {
        condition: [{ type: 'Text', content: 'true' }],
        then: [{ type: 'Text', content: 'then' }],
        else: [{ type: 'Text', content: 'else' }]
      },
      meta: {
        hasElse: true
      }
    };

    const result = await evaluateIf(node, env);
    expect(result.value).toBe('then');
  });

  it('executes else branch when condition is false', async () => {
    const node: IfNode = {
      type: 'Directive',
      kind: 'if',
      subtype: 'ifBlock',
      values: {
        condition: [{ type: 'Text', content: 'false' }],
        then: [{ type: 'Text', content: 'then' }],
        else: [{ type: 'Text', content: 'else' }]
      },
      meta: {
        hasElse: true
      }
    };

    const result = await evaluateIf(node, env);
    expect(result.value).toBe('else');
  });

  it('treats "NaN" text conditions as false', async () => {
    const node: IfNode = {
      type: 'Directive',
      kind: 'if',
      subtype: 'ifBlock',
      values: {
        condition: [{ type: 'Text', content: 'NaN' }],
        then: [{ type: 'Text', content: 'then' }],
        else: [{ type: 'Text', content: 'else' }]
      },
      meta: {
        hasElse: true
      }
    };

    const result = await evaluateIf(node, env);
    expect(result.value).toBe('else');
  });

  it('supports nested if blocks', async () => {
    const inner: IfNode = {
      type: 'Directive',
      kind: 'if',
      subtype: 'ifBlock',
      values: {
        condition: [{ type: 'Text', content: 'true' }],
        then: [{ type: 'Text', content: 'inner' }]
      }
    };

    const outer: IfNode = {
      type: 'Directive',
      kind: 'if',
      subtype: 'ifBlock',
      values: {
        condition: [{ type: 'Text', content: 'true' }],
        then: [inner],
        else: [{ type: 'Text', content: 'outer-else' }]
      }
    };

    const result = await evaluateIf(outer, env);
    expect(result.value).toBe('inner');
  });

  it('returns early from exe blocks when if returns', async () => {
    env.setVariable(
      'message',
      createSimpleTextVariable('message', 'start', {
        directive: 'var',
        syntax: 'quoted',
        hasInterpolation: false,
        isMultiLine: false
      })
    );

    const returnNode: ExeReturnNode = {
      type: 'ExeReturn',
      values: [{ type: 'Text', content: 'done' }],
      meta: { hasValue: true }
    };

    const ifNode: IfNode = {
      type: 'Directive',
      kind: 'if',
      subtype: 'ifBlock',
      values: {
        condition: [{ type: 'Text', content: 'true' }],
        then: [returnNode]
      },
      meta: {
        hasReturn: true
      }
    };

    const appendNode: AugmentedAssignmentNode = {
      type: 'AugmentedAssignment',
      identifier: 'message',
      operator: '+=',
      value: [{ type: 'Text', content: 'after' }]
    };

    const block: ExeBlockNode = {
      type: 'ExeBlock',
      values: {
        statements: [ifNode, appendNode]
      }
    };

    const result = await evaluateExeBlock(block, env);
    expect(result.value).toBe('done');
    const message = await extractVariableValue(env.getVariable('message')!, env);
    expect(message).toBe('start');
  });

  it('rejects return statements outside exe blocks', async () => {
    const node: IfNode = {
      type: 'Directive',
      kind: 'if',
      subtype: 'ifBlock',
      values: {
        condition: [{ type: 'Text', content: 'true' }],
        then: [{
          type: 'ExeReturn',
          values: [{ type: 'Text', content: 'nope' }],
          meta: { hasValue: true }
        }]
      },
      meta: {
        hasReturn: true
      }
    };

    await expect(evaluateIf(node, env)).rejects.toThrow(
      'Return statements are only allowed inside exe blocks.'
    );
  });
});

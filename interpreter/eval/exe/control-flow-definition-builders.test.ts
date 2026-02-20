import { describe, expect, it } from 'vitest';
import type { DirectiveNode } from '@core/types';
import { buildControlFlowExecutableDefinition } from './control-flow-definition-builders';

function createVarRef(identifier: string): any {
  return {
    type: 'VariableReference',
    nodeId: `ref-${identifier}`,
    identifier
  };
}

function createText(content: string): any {
  return {
    type: 'Text',
    nodeId: `text-${content.replace(/\W+/g, '-') || 'node'}`,
    content
  };
}

function createDirective(
  identifier: string,
  subtype: string,
  values: Record<string, unknown>,
  meta: Record<string, unknown> = {}
): DirectiveNode {
  return {
    type: 'Directive',
    kind: 'exe',
    subtype,
    nodeId: `exe-${identifier}-${subtype}`,
    values: {
      identifier: [createVarRef(identifier)],
      params: [],
      ...values
    } as any,
    raw: {},
    meta: {
      parameterCount: 0,
      ...meta
    } as any,
    location: {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 1, offset: 0 }
    }
  } as DirectiveNode;
}

describe('exe control-flow definition builders', () => {
  it('keeps control-flow executable definitions stable for each subtype family', () => {
    const definitionCases = [
      {
        identifier: 'whenExec',
        directive: createDirective('whenExec', 'exeWhen', {
          content: [{ type: 'WhenExpression', nodeId: 'when-expr', conditions: [] }]
        }),
        assertDef: (def: any) => {
          expect(def.type).toBe('code');
          expect(def.language).toBe('mlld-when');
        }
      },
      {
        identifier: 'foreachExec',
        directive: createDirective('foreachExec', 'exeForeach', {
          content: [{ type: 'foreach-command', nodeId: 'foreach-expr' }]
        }),
        assertDef: (def: any) => {
          expect(def.type).toBe('code');
          expect(def.language).toBe('mlld-foreach');
        }
      },
      {
        identifier: 'forExec',
        directive: createDirective('forExec', 'exeFor', {
          content: [{ type: 'ForExpression', nodeId: 'for-expr', variable: { identifier: 'item' } }]
        }),
        assertDef: (def: any) => {
          expect(def.type).toBe('code');
          expect(def.language).toBe('mlld-for');
        }
      },
      {
        identifier: 'loopExec',
        directive: createDirective('loopExec', 'exeLoop', {
          content: [{ type: 'LoopExpression', nodeId: 'loop-expr' }]
        }),
        assertDef: (def: any) => {
          expect(def.type).toBe('code');
          expect(def.language).toBe('mlld-loop');
        }
      },
      {
        identifier: 'blockExec',
        directive: createDirective(
          'blockExec',
          'exeBlock',
          {
            statements: [createText('noop')]
          },
          { statementCount: 1, hasReturn: false }
        ),
        assertDef: (def: any) => {
          expect(def.type).toBe('code');
          expect(def.language).toBe('mlld-exe-block');
          expect(def.codeTemplate?.[0]?.type).toBe('ExeBlock');
        }
      }
    ] as const;

    for (const entry of definitionCases) {
      const definition = buildControlFlowExecutableDefinition(
        entry.directive,
        entry.identifier
      );
      expect(definition).not.toBeNull();
      entry.assertDef(definition);
    }
  });

  it('keeps control-flow invalid-content error surfaces stable', () => {
    const invalidCases = [
      {
        directive: createDirective('badWhenMissing', 'exeWhen', { content: [] }),
        message: 'Exec when directive missing when expression'
      },
      {
        directive: createDirective('badWhenShape', 'exeWhen', { content: [createText('wrong')] }),
        message: 'Exec when directive content must be a WhenExpression'
      },
      {
        directive: createDirective('badForeachMissing', 'exeForeach', { content: [] }),
        message: 'Exec foreach directive missing foreach expression'
      },
      {
        directive: createDirective('badForeachShape', 'exeForeach', { content: [createText('wrong')] }),
        message: 'Exec foreach directive content must be a ForeachCommandExpression'
      },
      {
        directive: createDirective('badForMissing', 'exeFor', { content: [] }),
        message: 'Exec for directive missing for expression'
      },
      {
        directive: createDirective('badForShape', 'exeFor', { content: [createText('wrong')] }),
        message: 'Exec for directive content must be a ForExpression'
      },
      {
        directive: createDirective('badLoopMissing', 'exeLoop', { content: [] }),
        message: 'Exec loop directive missing loop expression'
      },
      {
        directive: createDirective('badLoopShape', 'exeLoop', { content: [createText('wrong')] }),
        message: 'Exec loop directive content must be a LoopExpression'
      }
    ] as const;

    for (const entry of invalidCases) {
      expect(() =>
        buildControlFlowExecutableDefinition(entry.directive, 'testExec')
      ).toThrow(entry.message);
    }
  });

  it('returns null for non-control-flow subtypes', () => {
    const definition = buildControlFlowExecutableDefinition(
      createDirective('commandExec', 'exeCommand', { command: [createText('echo hi')] }),
      'commandExec'
    );

    expect(definition).toBeNull();
  });
});

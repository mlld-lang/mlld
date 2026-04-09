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

function createReturn(value: string, kind: 'canonical' | 'tool' | 'dual' = 'canonical'): any {
  return {
    type: 'ExeReturn',
    kind,
    nodeId: `return-${kind}-${value}`,
    values: [createText(value)],
    meta: { hasValue: true }
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
          expect(def.toolReturnMode).toEqual({
            strict: false,
            allToolSigilsInForBodies: false
          });
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
          expect(def.toolReturnMode).toEqual({
            strict: false,
            allToolSigilsInForBodies: false
          });
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
          expect(def.toolReturnMode).toEqual({
            strict: false,
            allToolSigilsInForBodies: false
          });
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

  it('derives strict-mode return metadata from control-flow executable bodies', () => {
    const blockDefinition = buildControlFlowExecutableDefinition(
      createDirective(
        'strictBlockExec',
        'exeBlock',
        {
          statements: [createReturn('planner-status', 'tool'), createReturn('canonical', 'canonical')]
        },
        { statementCount: 2, hasReturn: false }
      ),
      'strictBlockExec'
    ) as any;

    expect(blockDefinition.toolReturnMode).toEqual({
      strict: true,
      allToolSigilsInForBodies: false
    });

    const forDefinition = buildControlFlowExecutableDefinition(
      createDirective('strictForExec', 'exeFor', {
        content: [{
          type: 'ForExpression',
          nodeId: 'for-expr-strict',
          variable: { identifier: 'item' },
          source: [createText('items')],
          expression: [createReturn('iteration-status', 'tool')],
          meta: { isForExpression: true }
        }]
      }),
      'strictForExec'
    ) as any;

    expect(forDefinition.toolReturnMode).toEqual({
      strict: true,
      allToolSigilsInForBodies: true
    });

    const whenDefinition = buildControlFlowExecutableDefinition(
      createDirective('strictWhenExec', 'exeWhen', {
        content: [{
          type: 'WhenExpression',
          nodeId: 'when-expr-strict',
          conditions: [
            {
              condition: [createText('cond')],
              action: [createReturn('branch-status', 'dual')]
            }
          ],
          meta: {
            conditionCount: 1,
            isValueReturning: true,
            evaluationType: 'expression',
            hasTailModifiers: false
          }
        }]
      }),
      'strictWhenExec'
    ) as any;

    expect(whenDefinition.toolReturnMode).toEqual({
      strict: true,
      allToolSigilsInForBodies: false
    });

    const nestedForDefinition = buildControlFlowExecutableDefinition(
      createDirective('strictNestedForExec', 'exeFor', {
        content: [{
          type: 'ForExpression',
          nodeId: 'for-expr-nested-strict',
          variable: { identifier: 'item' },
          source: [createText('items')],
          expression: [{
            type: 'Directive',
            kind: 'if',
            nodeId: 'if-in-for',
            values: {
              condition: [createText('cond')],
              then: [createReturn('nested-iteration-status', 'tool')]
            },
            raw: {},
            meta: { hasElse: false, hasReturn: true }
          }],
          meta: { isForExpression: true }
        }]
      }),
      'strictNestedForExec'
    ) as any;

    expect(nestedForDefinition.toolReturnMode).toEqual({
      strict: true,
      allToolSigilsInForBodies: true
    });

    const nestedTopLevelIfDefinition = buildControlFlowExecutableDefinition(
      createDirective(
        'strictTopLevelIfExec',
        'exeBlock',
        {
          statements: [{
            type: 'Directive',
            kind: 'if',
            nodeId: 'if-top-level',
            values: {
              condition: [createText('cond')],
              then: [createReturn('top-level-status', 'tool')]
            },
            raw: {},
            meta: { hasElse: false, hasReturn: true }
          }]
        },
        { statementCount: 1, hasReturn: false }
      ),
      'strictTopLevelIfExec'
    ) as any;

    expect(nestedTopLevelIfDefinition.toolReturnMode).toEqual({
      strict: true,
      allToolSigilsInForBodies: false
    });
  });
});

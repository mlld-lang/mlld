import type { DirectiveNode, ExeBlockNode } from '@core/types';
import type { ExecutableDefinition, CodeExecutable } from '@core/types/executable';
import { extractParamNames } from './definition-helpers';

export function buildControlFlowExecutableDefinition(
  directive: DirectiveNode,
  identifier: string
): ExecutableDefinition | null {
  if (directive.subtype === 'exeWhen') {
    const contentNodes = directive.values?.content;
    if (!contentNodes || !Array.isArray(contentNodes) || contentNodes.length === 0) {
      throw new Error('Exec when directive missing when expression');
    }

    const whenExprNode = contentNodes[0];
    if (!whenExprNode || whenExprNode.type !== 'WhenExpression') {
      throw new Error('Exec when directive content must be a WhenExpression');
    }

    const params = directive.values?.params || [];
    const paramNames = extractParamNames(params);

    return {
      type: 'code',
      codeTemplate: contentNodes,
      language: 'mlld-when',
      paramNames,
      sourceDirective: 'exec'
    } satisfies CodeExecutable;
  }

  if (directive.subtype === 'exeForeach') {
    const contentNodes = directive.values?.content;
    if (!contentNodes || !Array.isArray(contentNodes) || contentNodes.length === 0) {
      throw new Error('Exec foreach directive missing foreach expression');
    }

    const foreachNode = contentNodes[0];
    if (
      !foreachNode ||
      (foreachNode.type !== 'foreach-command' && foreachNode.value?.type !== 'foreach')
    ) {
      throw new Error('Exec foreach directive content must be a ForeachCommandExpression');
    }

    const params = directive.values?.params || [];
    const paramNames = extractParamNames(params);

    return {
      type: 'code',
      codeTemplate: contentNodes,
      language: 'mlld-foreach',
      paramNames,
      sourceDirective: 'exec'
    } satisfies CodeExecutable;
  }

  if (directive.subtype === 'exeFor') {
    const contentNodes = directive.values?.content;
    if (!contentNodes || !Array.isArray(contentNodes) || contentNodes.length === 0) {
      throw new Error('Exec for directive missing for expression');
    }

    const forExprNode = contentNodes[0];
    if (!forExprNode || forExprNode.type !== 'ForExpression') {
      throw new Error('Exec for directive content must be a ForExpression');
    }

    const params = directive.values?.params || [];
    const paramNames = extractParamNames(params);

    return {
      type: 'code',
      codeTemplate: contentNodes,
      language: 'mlld-for',
      paramNames,
      sourceDirective: 'exec'
    } satisfies CodeExecutable;
  }

  if (directive.subtype === 'exeLoop') {
    const contentNodes = directive.values?.content;
    if (!contentNodes || !Array.isArray(contentNodes) || contentNodes.length === 0) {
      throw new Error('Exec loop directive missing loop expression');
    }

    const loopExprNode = contentNodes[0];
    if (!loopExprNode || loopExprNode.type !== 'LoopExpression') {
      throw new Error('Exec loop directive content must be a LoopExpression');
    }

    const params = directive.values?.params || [];
    const paramNames = extractParamNames(params);

    return {
      type: 'code',
      codeTemplate: contentNodes,
      language: 'mlld-loop',
      paramNames,
      sourceDirective: 'exec'
    } satisfies CodeExecutable;
  }

  if (directive.subtype === 'exeEnv') {
    const blockNode = (directive.values as any)?.block as ExeBlockNode | undefined;
    if (!blockNode || blockNode.type !== 'ExeBlock') {
      throw new Error('Exec env directive missing env block');
    }

    const params = directive.values?.params || [];
    const paramNames = extractParamNames(params);
    const envConfig = Array.isArray((directive.values as any)?.config)
      ? ((directive.values as any).config as any[])
      : undefined;
    const envWithClause = (directive.values as any)?.envWithClause;

    const envDirective = {
      type: 'Directive',
      kind: 'env',
      subtype: 'env',
      source: 'env',
      nodeId: directive.nodeId,
      values: {
        ...(envConfig && envConfig.length > 0 ? { config: envConfig } : {}),
        ...(envWithClause ? { withClause: envWithClause } : {}),
        block: blockNode
      },
      raw: {
        ...((directive.raw as any)?.config !== undefined
          ? { config: (directive.raw as any).config }
          : {}),
        ...((directive.raw as any)?.envWithClause !== undefined
          ? { withClause: (directive.raw as any).envWithClause }
          : {})
      },
      meta: {
        statementCount:
          (directive.meta as any)?.statementCount ??
          blockNode?.meta?.statementCount ??
          blockNode?.values?.statements?.length ??
          0,
        hasReturn: (directive.meta as any)?.hasReturn ?? blockNode?.meta?.hasReturn === true,
        ...(envWithClause ? { withClause: envWithClause } : {})
      },
      location: directive.location
    } as DirectiveNode;

    return {
      type: 'code',
      codeTemplate: [envDirective],
      language: 'mlld-env',
      paramNames,
      sourceDirective: 'exec'
    } satisfies CodeExecutable;
  }

  if (directive.subtype === 'exeBlock') {
    const statements = (directive.values as any)?.statements || [];
    const returnStmt = (directive.values as any)?.return;
    const params = directive.values?.params || [];
    const paramNames = extractParamNames(params);

    const blockNode: ExeBlockNode = {
      type: 'ExeBlock',
      nodeId: directive.nodeId,
      values: {
        statements,
        ...(returnStmt ? { return: returnStmt } : {})
      },
      meta: {
        statementCount: (directive.meta as any)?.statementCount ?? statements.length,
        hasReturn: (directive.meta as any)?.hasReturn ?? Boolean(returnStmt)
      },
      location: directive.location
    };

    return {
      type: 'code',
      codeTemplate: [blockNode],
      language: 'mlld-exe-block',
      paramNames,
      sourceDirective: 'exec'
    } satisfies CodeExecutable;
  }

  return null;
}

import { MlldInterpreterError } from '@core/errors';
import type { ExeBlockNode, ExeReturnNode } from '@core/types';
import type { CodeExecutable } from '@core/types/executable';
import type { WhenExpressionNode } from '@core/types/when';

function asWhenExpression(node: unknown): WhenExpressionNode | null {
  return node && typeof node === 'object' && (node as { type?: string }).type === 'WhenExpression'
    ? (node as WhenExpressionNode)
    : null;
}

function extractBlockReturnWhenExpression(returnNode?: ExeReturnNode): WhenExpressionNode | null {
  const returnValues = Array.isArray(returnNode?.values) ? returnNode.values : [];
  if (returnValues.length !== 1) {
    return null;
  }
  return asWhenExpression(returnValues[0]);
}

function extractBlockTerminalWhenExpression(blockNode: ExeBlockNode): WhenExpressionNode | null {
  const returnWhenExpr = extractBlockReturnWhenExpression(blockNode.values?.return);
  if (returnWhenExpr) {
    return returnWhenExpr;
  }

  const statements = Array.isArray(blockNode.values?.statements) ? blockNode.values.statements : [];
  return asWhenExpression(statements[statements.length - 1]);
}

export function extractExecDeniedHandlerWhenExpression(
  definition: CodeExecutable
): WhenExpressionNode | null {
  if (definition.language === 'mlld-when') {
    const candidate =
      Array.isArray(definition.codeTemplate) && definition.codeTemplate.length > 0
        ? definition.codeTemplate[0]
        : undefined;
    const whenExpr = asWhenExpression(candidate);
    if (!whenExpr) {
      throw new MlldInterpreterError('mlld-when executable missing WhenExpression node');
    }
    return whenExpr;
  }

  if (definition.language !== 'mlld-exe-block') {
    return null;
  }

  const blockNode =
    Array.isArray(definition.codeTemplate) && definition.codeTemplate.length > 0
      ? definition.codeTemplate[0]
      : undefined;
  if (!blockNode || blockNode.type !== 'ExeBlock') {
    throw new MlldInterpreterError('mlld-exe-block executable missing block content');
  }

  return extractBlockTerminalWhenExpression(blockNode as ExeBlockNode);
}

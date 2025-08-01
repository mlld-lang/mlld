import { Token } from './semantic-tokens';
import { TokenExpectation } from './parser';

export function validateExpectedTokens(
  actual: Token[], 
  expected: TokenExpectation[], 
  isPartial: boolean
) {
  if (isPartial) {
    // Each expected token must exist somewhere in actual
    for (const exp of expected) {
      const found = actual.find(act => tokenMatches(act, exp));
      if (!found) {
        throw new Error(
          `Expected token not found: ${formatExpectation(exp)}\n` +
          `Actual tokens:\n${actual.map(formatToken).join('\n')}`
        );
      }
    }
  } else {
    // Exact match - same count and order
    if (actual.length !== expected.length) {
      throw new Error(
        `Token count mismatch:\n` +
        `Expected ${expected.length} tokens:\n${expected.map(formatExpectation).join('\n')}\n\n` +
        `Got ${actual.length} tokens:\n${actual.map(formatToken).join('\n')}`
      );
    }

    expected.forEach((exp, i) => {
      const act = actual[i];
      if (!tokenMatches(act, exp)) {
        throw new Error(
          `Token ${i} mismatch:\n` +
          `Expected: ${formatExpectation(exp)}\n` +
          `Actual: ${formatToken(act)}`
        );
      }
    });
  }
}

export function validateNotExpectedTokens(actual: Token[], notExpected: TokenExpectation[]) {
  for (const exp of notExpected) {
    const found = actual.find(act => tokenMatches(act, exp));
    if (found) {
      throw new Error(
        `Unexpected token found: ${formatToken(found)}\n` +
        `This token should NOT exist: ${formatExpectation(exp)}`
      );
    }
  }
}

function tokenMatches(actual: Token, expected: TokenExpectation): boolean {
  // Check text if specified
  if (expected.text !== undefined) {
    if (actual.text !== expected.text) {
      return false;
    }
  }

  // Check type (wildcard * matches any type)
  if (expected.type !== '*' && actual.type !== expected.type) {
    return false;
  }

  // Check modifiers if specified
  if (expected.modifiers) {
    for (const mod of expected.modifiers) {
      if (!actual.modifiers.includes(mod)) {
        return false;
      }
    }
  }

  return true;
}

function formatExpectation(exp: TokenExpectation): string {
  let result = exp.text ? `"${exp.text}"` : '<any text>';
  result += ` --> ${exp.type}`;
  if (exp.modifiers && exp.modifiers.length > 0) {
    result += `[${exp.modifiers.join(',')}]`;
  }
  return result;
}

function formatToken(token: Token): string {
  let result = token.text ? `"${token.text}"` : `<empty at ${token.line}:${token.character}>`;
  result += ` --> ${token.type}`;
  if (token.modifiers && token.modifiers.length > 0) {
    result += `[${token.modifiers.join(',')}]`;
  }
  result += ` (${token.line}:${token.character}, len=${token.length})`;
  return result;
}
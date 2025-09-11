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
    // Relaxed exactness: expected tokens must appear in order as a subsequence of actual
    let idx = 0;
    const misses: { expected: TokenExpectation; fromIndex: number }[] = [];
    for (const exp of expected) {
      let foundIndex = -1;
      for (let i = idx; i < actual.length; i++) {
        if (tokenMatches(actual[i], exp)) {
          foundIndex = i;
          break;
        }
      }
      if (foundIndex === -1) {
        misses.push({ expected: exp, fromIndex: idx });
      } else {
        idx = foundIndex + 1; // advance to preserve order
      }
    }

    if (misses.length > 0) {
      const missReport = misses.map(m => `  - Missing after index ${m.fromIndex}: ${formatExpectation(m.expected)}`).join('\n');
      throw new Error(
        `Expected tokens not found in order (allowing extra tokens):\n${missReport}\n\n` +
        `Actual tokens:\n${actual.map(formatToken).join('\n')}`
      );
    }
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

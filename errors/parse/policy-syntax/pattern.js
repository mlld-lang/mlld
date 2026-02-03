export const pattern = {
  name: 'policy-syntax',

  test(error, mx) {
    // Match policy directive parse errors
    const line = mx.line || '';
    if (!/^\s*\/?policy\s+@/.test(line)) {
      return false;
    }

    // Check if error mentions union or data object literal
    const msg = error.message || '';
    if (msg.includes('union') || msg.includes('data object literal')) {
      return true;
    }

    // Also match errors at the = or { position in policy lines
    if (error.found === '=' || error.found === '{' || error.found === '@') {
      return true;
    }

    return false;
  },

  enhance(error, mx) {
    const line = mx.line || '';
    const policyMatch = line.match(/policy\s+@([a-zA-Z_][a-zA-Z0-9_]*)/);
    const policyName = policyMatch ? policyMatch[1] : 'myPolicy';

    // Detect what they might have been trying to do
    let syntaxType = 'unknown';
    if (line.includes('union(')) {
      syntaxType = 'union';
    } else if (line.includes('= {') || line.includes('={')) {
      syntaxType = 'inline';
    } else if (line.match(/=\s*@/)) {
      syntaxType = 'reference';
    }

    return {
      POLICY_NAME: policyName,
      SYNTAX_TYPE: syntaxType,
      LINE: line.trim()
    };
  }
};

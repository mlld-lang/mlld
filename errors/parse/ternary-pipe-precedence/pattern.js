export const pattern = {
  name: 'ternary-pipe-precedence',

  test(error, mx) {
    if (!error.message?.includes('Text content not allowed in strict mode')) {
      return false;
    }

    // Match: var @x = @expr ? @expr | @filter : value
    // The ternary parses fine alone, but adding a pipe in a branch breaks it
    const line = mx?.line || '';
    return /^\s*var\s+@\w+\s*=\s*.+\?.*\|/.test(line);
  },

  enhance(error, mx) {
    const line = mx?.line || '';

    // Extract variable name
    const varMatch = line.match(/var\s+@(\w+)/);
    const varName = varMatch ? varMatch[1] : 'x';

    // Extract condition (between = and ?)
    const condMatch = line.match(/=\s*(.+?)\s*\?/);
    const condition = condMatch ? condMatch[1].trim() : '@value';

    // Extract the true branch with pipe (between ? and :)
    const branchMatch = line.match(/\?\s*(.+?\|.+?)\s*:/);
    const trueBranch = branchMatch ? branchMatch[1].trim() : '@value | @filter';

    // Extract the false branch (after last :)
    const falseMatch = line.match(/:\s*(.+?)\s*$/);
    const falseBranch = falseMatch ? falseMatch[1].trim() : 'null';

    return {
      VARNAME: varName,
      CONDITION: condition,
      TRUE_BRANCH: trueBranch,
      FALSE_BRANCH: falseBranch,
    };
  }
};

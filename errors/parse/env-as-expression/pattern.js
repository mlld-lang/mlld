export const pattern = {
  name: 'env-as-expression',

  test(error, mx) {
    // Check for /env used without a block (missing the [])
    // Examples:
    //   exe @result = env @config @command  (wrong - env needs a block)
    //   var @x = env @config                (wrong - env needs a block)
    if (!mx.line) return false;

    const line = mx.line.trim();

    // Check if this is an exe or var assignment that references env
    // The env directive requires: env @config [ ... ]
    const exeVarPattern = /^\/?(?:exe|var)\s+@\w+\s*=\s*(?:\/)?env\b/i;
    if (exeVarPattern.test(line)) {
      // Make sure it doesn't have the block syntax
      return !line.includes('[');
    }

    // Also catch direct env usage without block on same line
    const envNoBlock = /^\/?env\s+@\w+\s+[^[\s]/;
    if (envNoBlock.test(line) && !line.includes('[')) {
      return true;
    }

    return false;
  },

  enhance(error, mx) {
    const line = mx.line.trim();

    // Extract the config reference
    const configMatch = line.match(/env\s+(@\w+)/i);
    const config = configMatch ? configMatch[1] : '@config';

    return {
      ORIGINAL: line,
      CONFIG: config
    };
  }
};

export const pattern = {
  name: 'semver-quoted-version',

  test(error, mx) {
    // Check for quoted version strings in module references
    // Examples:
    //   @author/module@"1.0.0"  (wrong - should be @author/module@1.0.0)
    //   import @author/module@'2.3.4'  (wrong - quotes not needed)
    if (!mx.line) return false;

    const line = mx.line;

    // Pattern: @namespace/path@"version" or @namespace/path@'version'
    const quotedVersionPattern = /@[a-zA-Z_][a-zA-Z0-9_-]*\/[a-zA-Z0-9_/-]+@["'][0-9]/;

    return quotedVersionPattern.test(line);
  },

  enhance(error, mx) {
    const line = mx.line.trim();

    // Extract the module reference and quoted version
    const match = line.match(/(@[a-zA-Z_][a-zA-Z0-9_/-]+)@(["'])([^"']+)\2/);

    if (match) {
      const modulePath = match[1];
      const version = match[3];
      return {
        ORIGINAL: `${modulePath}@${match[2]}${version}${match[2]}`,
        SUGGESTED: `${modulePath}@${version}`,
        VERSION: version
      };
    }

    // Fallback
    return {
      ORIGINAL: line,
      SUGGESTED: line.replace(/@["']([0-9][^"']*)["']/, '@$1'),
      VERSION: 'version'
    };
  }
};

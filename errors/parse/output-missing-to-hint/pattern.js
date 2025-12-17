export const pattern = {
  name: 'output-missing-to-hint',

  test(error, mx) {
    // Trigger on the specific grammar error for missing 'to' in /output
    if (!error || !error.message) return false;
    if (!error.message.includes("Missing 'to' keyword in /output directive")) return false;
    // Extra guard: line context contains '/output'
    return typeof mx.line === 'string' && mx.line.includes('/output');
  },

  enhance(error, mx) {
    // Try to extract the current line after /output
    const line = mx.line || '';
    // Provide a minimal example using quoted paths
    return {
      LINE: line.trim(),
      EXAMPLE: '/output @content to "path/to/file.txt"',
      TIP: 'Use the "to" keyword followed by a target (quoted file path, stdout, stderr, or env)'
    };
  }
};


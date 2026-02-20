export const pattern = {
  name: 'pipeline-bare-braces-command',

  test(error, mx) {
    const isTextNotAllowed = /Text content not allowed in strict mode/i.test(error.message || error);
    if (!isTextNotAllowed) return false;

    const line = (mx?.line || '').trim();
    if (!line.includes('|')) return false;

    // Reject bare brace stages in pipelines: @x | { echo "hi" }
    return /\|\s*\{/.test(line);
  },

  enhance() {
    return {};
  }
};

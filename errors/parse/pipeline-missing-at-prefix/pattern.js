export const pattern = {
  name: 'pipeline-missing-at-prefix',

  test(error, mx) {
    // Match when parsing fails after a pipe with a bare identifier
    const isTextNotAllowed = /Text content not allowed in strict mode/i.test(error.message || error);
    if (!isTextNotAllowed) return false;

    // Check if the line contains | followed by a bare identifier (not @)
    const line = mx?.line || '';
    const match = line.match(/\|\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*$/);
    if (!match) return false;

    // Make sure it's not already prefixed with @
    const beforePipe = line.substring(0, line.lastIndexOf('|'));
    const afterPipe = line.substring(line.lastIndexOf('|'));
    return !afterPipe.includes('@');
  },

  enhance(error, mx) {
    const line = mx?.line || '';
    const match = line.match(/\|\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*$/);
    const filterName = match ? match[1] : 'filter';

    return {
      FILTER: filterName
    };
  }
};

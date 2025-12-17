export const pattern = {
  name: 'import-wildcard',
  
  test(error, mx) {
    // Check for import statement with wildcard
    return mx.line.match(/^\/import\s+\*/) || 
           (mx.line.includes('/import') && error.message?.includes('wildcard'));
  },
  
  enhance(error, mx) {
    // No variables needed for this error template
    return {};
  }
};
export const pattern = {
  name: 'import-wildcard',
  
  test(error, ctx) {
    // Check for import statement with wildcard
    return ctx.line.match(/^\/import\s+\*/) || 
           (ctx.line.includes('/import') && error.message?.includes('wildcard'));
  },
  
  enhance(error, ctx) {
    // No variables needed for this error template
    return {};
  }
};
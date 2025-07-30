
export const pattern = {
  name: 'var-nested-fields',
  
  test(error, ctx) {
    // Check for /var with nested field syntax
    return ctx.line.match(/^\/var\s+@\w+\./);
  },
  
  enhance(error, ctx) {
    // Extract the variable and field names
    const match = ctx.line.match(/^\/var\s+@(\w+)((?:\.\w+)+)/);
    const baseVar = match?.[1] || 'object';
    const fields = match?.[2] || '.field';
    
    // Extract field names for suggestions
    const fieldName = fields.slice(1).split('.')[0];
    const flatName = fields.slice(1).replace(/\./g, '_');
    
    // Return variables for template interpolation
    return {
      baseVar,
      fieldName,
      flatName
    };
  }
};
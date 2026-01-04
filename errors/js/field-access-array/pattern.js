export const pattern = {
  name: 'field-access-array',
  
  test(error, mx) {
    // Match errors about field access on LoadContentResultArray
    return error.message && error.message.includes('not found in LoadContentResultArray');
  },
  
  enhance(error, mx) {
    // Extract the field name being accessed
    const fieldMatch = error.message.match(/Field "([^"]+)" not found/);
    const fieldName = fieldMatch ? fieldMatch[1] : 'unknown';
    
    // Check if the code shows the problematic access pattern
    let contextLine = '';
    let suggestion = '';
    
    if (mx.code) {
      // Look for patterns like @files.filename
      const accessPattern = new RegExp(`@\\w+\\.${fieldName}`, 'g');
      const matches = mx.code.match(accessPattern);
      if (matches && matches.length > 0) {
        contextLine = matches[0];
        const varName = contextLine.split('.')[0];
        suggestion = `/for @file in ${varName} => @file.${fieldName}`;
      }
    }
    
    return {
      FIELD: fieldName,
      CONTEXT: contextLine || `@array.${fieldName}`,
      SUGGESTION: suggestion || `/for @item in @array => @item.${fieldName}`
    };
  }
};
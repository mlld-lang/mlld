
export const pattern = {
  name: 'run-missing-braces',
  
  test(error, mx) {
    // Check for /run with unbraced content
    return mx.line.match(/^\/run\s+[^{"]/) && 
           !mx.line.match(/^\/run\s+{/) &&
           !mx.line.match(/^\/run\s+"/);
  },
  
  enhance(error, mx) {
    // Extract the attempted command (though not used in template)
    const command = mx.line.match(/^\/run\s+(.+)/)?.[1] || 'command';
    
    // Return variables for template interpolation
    // Even though current template doesn't use variables, we'll return command
    // in case template is updated in the future
    return {
      command
    };
  }
};
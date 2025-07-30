
export const pattern = {
  name: 'run-missing-braces',
  
  test(error, ctx) {
    // Check for /run with unbraced content
    return ctx.line.match(/^\/run\s+[^{"]/) && 
           !ctx.line.match(/^\/run\s+{/) &&
           !ctx.line.match(/^\/run\s+"/);
  },
  
  enhance(error, ctx) {
    // Extract the attempted command (though not used in template)
    const command = ctx.line.match(/^\/run\s+(.+)/)?.[1] || 'command';
    
    // Return variables for template interpolation
    // Even though current template doesn't use variables, we'll return command
    // in case template is updated in the future
    return {
      command
    };
  }
};
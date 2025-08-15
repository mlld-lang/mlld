export const pattern = {
  name: 'exe-unnecessary-block',
  
  test(error, ctx) {
    // Check if error is about invalid exe syntax and line has single show/output in block
    return error.message && 
           error.message.includes('Invalid /exe syntax') &&
           ctx.line.includes('/exe') &&
           ctx.line.includes('= {') &&
           ctx.line.match(/=\s*{\s*(show|output)\s+/);
  },
  
  enhance(error, ctx) {
    // Extract the exe function parts
    const exeMatch = ctx.line.match(/\/exe\s+@(\w+)\((.*?)\)\s*=\s*{\s*(.+?)\s*}/);
    const funcName = exeMatch ? exeMatch[1] : 'myFunc';
    const params = exeMatch ? exeMatch[2] : '';
    const body = exeMatch ? exeMatch[3] : 'show "text"';
    
    // For single directives, suggest simpler syntax
    const isSimpleShow = body.match(/^show\s+/);
    const isSimpleOutput = body.match(/^output\s+/);
    
    let suggestion = '';
    if (isSimpleShow || isSimpleOutput) {
      suggestion = `/exe @${funcName}(${params}) = ${body}`;
    }
    
    return {
      FUNC: funcName,
      PARAMS: params,
      BODY: body,
      SUGGESTION: suggestion
    };
  }
};
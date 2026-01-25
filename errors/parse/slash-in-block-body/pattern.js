export const pattern = {
  name: 'slash-in-block-body',

  test(error, mx) {
    // Match when error says "block body" and found is "/"
    // This covers for blocks, if blocks, etc.
    if (error.found === '/' && error.message) {
      return error.message.includes('block body') ||
             error.message.includes('block expression');
    }
    return false;
  },

  enhance(error, mx) {
    // Try to extract the directive name from the current line
    const match = mx.line && mx.line.match(/\/(\w+)/);
    const directive = match ? match[1] : 'directive';

    // Determine the block type from the error message or context
    let blockType = 'block';
    if (error.message.includes('for')) {
      blockType = 'for';
    } else if (error.message.includes('if')) {
      blockType = 'if';
    } else if (error.message.includes('when')) {
      blockType = 'when';
    }

    return {
      DIRECTIVE: directive,
      BLOCK_TYPE: blockType
    };
  }
};

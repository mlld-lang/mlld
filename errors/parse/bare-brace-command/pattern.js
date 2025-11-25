export const pattern = {
  name: 'bare-brace-command',
  
  test(error) {
    return /Use cmd \{ .* \} for commands or data \{ .* \} for objects\./i.test(error.message || error);
  },
  
  enhance(error, ctx) {
    return {
      LINE: ctx?.line?.trim() || '{...}'
    };
  }
};

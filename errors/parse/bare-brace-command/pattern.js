export const pattern = {
  name: 'bare-brace-command',
  
  test(error) {
    return /Use cmd \{ .* \} for commands or data \{ .* \} for objects\./i.test(error.message || error);
  },
  
  enhance(error, mx) {
    return {
      LINE: mx?.line?.trim() || '{...}'
    };
  }
};

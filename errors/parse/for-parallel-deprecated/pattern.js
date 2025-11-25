export const pattern = {
  name: 'for-parallel-deprecated',

  test(error) {
    return Boolean(error && (error.code === 'for-parallel-deprecated' || (typeof error.message === 'string' && error.message.includes('parallel(cap, pacing)'))));
  },

  enhance() {
    return {
      SUGGESTION: 'parallel(cap, pacing)'
    };
  }
};

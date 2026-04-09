const path = require('path');
const { pathToFileURL } = require('url');

function resolveTsxImportSpecifier() {
  try {
    const resolved = require.resolve('tsx/esm', {
      paths: [path.resolve(__dirname, '..'), __dirname]
    });
    return pathToFileURL(resolved).href;
  } catch (error) {
    const detail = error instanceof Error && error.message ? `\n${error.message}` : '';
    throw new Error(`Could not resolve tsx from the mlld install location.${detail}`);
  }
}

module.exports = {
  resolveTsxImportSpecifier
};

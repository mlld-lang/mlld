// Simple script to test path directive parsing
// Run with: node dev/fixes/path-test.js

const { parseMeld } = require('../../dist/index.cjs');

const content = `
@path docs = "$PROJECTPATH/docs"
@text docPath = "Docs are at \${docs}"
\${docPath}
`;

try {
  const nodes = parseMeld(content);
  console.log('Parsed nodes:');
  console.log(JSON.stringify(nodes, null, 2));
} catch (error) {
  console.error('Parse error:', error);
}
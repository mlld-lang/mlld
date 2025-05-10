/**
 * Example usage of the AST Explorer
 */
import { Explorer } from '../src/explorer';
import * as path from 'path';

async function main() {
  // Create an Explorer instance
  const explorer = new Explorer({
    outputDir: path.resolve(__dirname, '../output')
  });
  
  // Example 1: Parse a directive and explore the AST
  console.log('Example 1: Parse a directive');
  const directive = '@text greeting = "Hello, world!"';
  const ast = explorer.parseDirective(directive);
  console.log(JSON.stringify(ast, null, 2));
  
  // Example 2: Generate TypeScript interface
  console.log('\nExample 2: Generate TypeScript interface');
  const typesPath = explorer.generateTypes(directive, 'text-assignment');
  console.log(`TypeScript interface written to: ${typesPath}`);
  
  // Example 3: Generate test fixture
  console.log('\nExample 3: Generate test fixture');
  const fixturePath = explorer.generateFixture(directive, 'text-assignment');
  console.log(`Test fixture written to: ${fixturePath}`);
  
  // Example 4: Generate snapshot
  console.log('\nExample 4: Generate snapshot');
  const snapshotPath = explorer.generateSnapshot(directive, 'text-assignment');
  console.log(`Snapshot written to: ${snapshotPath}`);
  
  // Example 5: Process multiple examples
  console.log('\nExample 5: Process batch of examples');
  explorer.processBatch(path.resolve(__dirname, './directives.json'));
  console.log('Batch processing complete!');
  
  // Example 6: Generate documentation
  console.log('\nExample 6: Generate documentation');
  explorer.generateDocs();
  console.log('Documentation generated!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
const { parse } = require('meld-ast');
const fs = require('fs');
const path = require('path');

// Read in all test case files in the directory
const testCasesDir = path.join('/Users/adam/dev/meld/meld-ast-comparison/specific-cases');
const files = fs.readdirSync(testCasesDir)
  .filter(file => file.endsWith('.meld'));

async function run() {
  console.log(`Analyzing meld-ast ${process.argv[2] || 'current version'}...`);
  
  for (const file of files) {
    const filePath = path.join(testCasesDir, file);
    const basename = path.basename(file, '.meld');
    const content = fs.readFileSync(filePath, 'utf8');
    
    try {
      console.log(`Processing ${basename}...`);
      
      const result = await parse(content, {
        preserveCodeFences: true,
        failFast: false,
        trackLocations: true,
        validateNodes: true
      });
      
      // Save AST as JSON
      fs.writeFileSync(
        path.join('/Users/adam/dev/meld/meld-ast-comparison/specific-cases', '3.0.1', `${basename}-ast.json`),
        JSON.stringify(result, null, 2)
      );
      
      console.log(`Saved AST for ${basename}`);
    } catch (error) {
      console.error(`Error processing ${basename}:`, error);
      fs.writeFileSync(
        path.join('/Users/adam/dev/meld/meld-ast-comparison/specific-cases', '3.0.1', `${basename}-error.log`),
        error.toString()
      );
    }
  }
}

run().catch(console.error);

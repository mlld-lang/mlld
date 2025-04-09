w#!/usr/bin/env node

/**
 * Script to compare output between meld-ast versions
 * This script:
 * 1. Runs tests with different versions of meld-ast
 * 2. Captures test output and failure details
 * 3. Creates sample AST outputs for comparison
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { promisify } = require('util');
const writeFileAsync = promisify(fs.writeFile);
const mkdirAsync = promisify(fs.mkdir);

const COMPARISON_DIR = path.join(process.cwd(), 'meld-ast-comparison');
const TEST_SAMPLES = [
  {
    name: 'simple-field-access',
    content: `
@data person = {
  name: "John Doe",
  age: 30,
  address: {
    street: "123 Main St",
    city: "Anytown"
  }
}

Field access: {{person.name}}
`
  },
  {
    name: 'array-access',
    content: `
@data items = [
  "apple",
  "banana",
  "cherry"
]

First item: {{items[0]}}
Second item: {{items[1]}}
`
  },
  {
    name: 'nested-array-access',
    content: `
@data users = [
  { 
    name: "Alice", 
    tasks: ["coding", "testing"] 
  },
  { 
    name: "Bob", 
    tasks: ["design", "documentation"] 
  }
]

User: {{users[0].name}}
Task: {{users[0].tasks[1]}}
`
  },
  {
    name: 'code-fence-test',
    content: '```javascript\nconst array = [1, 2, 3];\nconsole.log(array[0]);\n```'
  }
];

async function ensureDirectoryExists(directory) {
  try {
    await mkdirAsync(directory, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

async function run() {
  try {
    // Ensure the comparison directory exists
    await ensureDirectoryExists(COMPARISON_DIR);
    await ensureDirectoryExists(path.join(COMPARISON_DIR, '3.0.1'));
    await ensureDirectoryExists(path.join(COMPARISON_DIR, '3.3.0'));
    
    // Create sample test files
    for (const sample of TEST_SAMPLES) {
      const filePath = path.join(COMPARISON_DIR, `${sample.name}.meld`);
      await writeFileAsync(filePath, sample.content);
    }
    
    // Run comparison for both versions
    await compareVersions('3.0.1');
    await compareVersions('3.3.0');
    
    // Generate comparison report
    await generateComparisonReport();
    
    console.log('Comparison completed successfully. Check the meld-ast-comparison directory for results.');
  } catch (error) {
    console.error('Error during comparison:', error);
    process.exit(1);
  }
}

async function compareVersions(version) {
  console.log(`\n=== Testing with meld-ast ${version} ===`);
  
  try {
    // Clean node_modules and install specific version
    console.log(`Installing meld-ast@${version}...`);
    execSync('rm -rf node_modules', { stdio: 'inherit' });
    execSync('npm install', { stdio: 'inherit' }); 
    execSync(`npm install meld-ast@${version}`, { stdio: 'inherit' });
    
    // Run tests and capture output
    console.log(`Running tests with meld-ast@${version}...`);
    try {
      const testOutput = execSync('npm test', { encoding: 'utf8' });
      await writeFileAsync(path.join(COMPARISON_DIR, version, 'test-output.log'), testOutput);
      console.log(`Test output saved for version ${version}`);
    } catch (testError) {
      // If tests fail, still capture the output
      const errorOutput = testError.stdout || testError.message;
      await writeFileAsync(path.join(COMPARISON_DIR, version, 'test-output.log'), errorOutput);
      console.log(`Test failures captured for version ${version}`);
    }
    
    // Generate AST for each sample
    for (const sample of TEST_SAMPLES) {
      const samplePath = path.join(COMPARISON_DIR, `${sample.name}.meld`);
      try {
        // Create a small test script that will output the AST
        const astScript = `
        const { parse } = require('meld-ast');
        
        async function main() {
          const content = \`${sample.content.replace(/`/g, '\\`')}\`;
          const result = await parse(content, {
            preserveCodeFences: true,
            failFast: false,
            trackLocations: true,
            validateNodes: true
          });
          console.log(JSON.stringify(result, null, 2));
        }
        
        main().catch(console.error);
        `;
        
        const scriptPath = path.join(COMPARISON_DIR, version, `${sample.name}-ast-generator.js`);
        await writeFileAsync(scriptPath, astScript);
        
        // Execute the AST script
        const astOutput = execSync(`node ${scriptPath}`, { encoding: 'utf8' });
        await writeFileAsync(path.join(COMPARISON_DIR, version, `${sample.name}-ast.json`), astOutput);
      } catch (error) {
        await writeFileAsync(
          path.join(COMPARISON_DIR, version, `${sample.name}-ast-error.log`), 
          error.toString()
        );
      }
    }
  } catch (error) {
    console.error(`Error processing version ${version}:`, error);
    await writeFileAsync(
      path.join(COMPARISON_DIR, version, 'installation-error.log'), 
      error.toString()
    );
  }
}

async function generateComparisonReport() {
  console.log('\n=== Generating Comparison Report ===');
  
  let report = `# meld-ast Version Comparison Report\n\n`;
  report += `Comparing version 3.0.1 with 3.3.0\n\n`;
  
  // Check if test outputs indicate different results
  const v301TestOutput = fs.existsSync(path.join(COMPARISON_DIR, '3.0.1', 'test-output.log')) 
    ? fs.readFileSync(path.join(COMPARISON_DIR, '3.0.1', 'test-output.log'), 'utf8')
    : 'No test output captured';
    
  const v330TestOutput = fs.existsSync(path.join(COMPARISON_DIR, '3.3.0', 'test-output.log'))
    ? fs.readFileSync(path.join(COMPARISON_DIR, '3.3.0', 'test-output.log'), 'utf8')
    : 'No test output captured';
  
  report += `## Test Results Comparison\n\n`;
  report += `Version 3.0.1 test result summary: ${v301TestOutput.includes('FAIL') ? 'FAILURES DETECTED' : 'PASSED'}\n`;
  report += `Version 3.3.0 test result summary: ${v330TestOutput.includes('FAIL') ? 'FAILURES DETECTED' : 'PASSED'}\n\n`;
  
  // Compare AST outputs for each sample
  report += `## AST Comparison\n\n`;
  
  for (const sample of TEST_SAMPLES) {
    report += `### ${sample.name}\n\n`;
    
    const ast301Path = path.join(COMPARISON_DIR, '3.0.1', `${sample.name}-ast.json`);
    const ast330Path = path.join(COMPARISON_DIR, '3.3.0', `${sample.name}-ast.json`);
    
    if (fs.existsSync(ast301Path) && fs.existsSync(ast330Path)) {
      const ast301 = JSON.parse(fs.readFileSync(ast301Path, 'utf8'));
      const ast330 = JSON.parse(fs.readFileSync(ast330Path, 'utf8'));
      
      // Simple diff to find key differences (this is a basic implementation)
      const differences = findASTDifferences(ast301, ast330);
      
      if (differences.length > 0) {
        report += `Differences found:\n\n`;
        differences.forEach(diff => {
          report += `- ${diff}\n`;
        });
      } else {
        report += `No structural differences detected in AST output.\n`;
      }
    } else {
      report += `Could not compare ASTs - one or both files missing.\n`;
    }
    
    report += `\n`;
  }
  
  await writeFileAsync(path.join(COMPARISON_DIR, 'comparison-report.md'), report);
}

function findASTDifferences(ast1, ast2, path = '') {
  const differences = [];
  
  // Check for structural differences
  if (typeof ast1 !== typeof ast2) {
    differences.push(`${path || 'root'}: Type mismatch - ${typeof ast1} vs ${typeof ast2}`);
    return differences;
  }
  
  if (Array.isArray(ast1) !== Array.isArray(ast2)) {
    differences.push(`${path || 'root'}: Array structure mismatch`);
    return differences;
  }
  
  if (Array.isArray(ast1)) {
    // Compare arrays
    if (ast1.length !== ast2.length) {
      differences.push(`${path || 'root'}: Array length differs - ${ast1.length} vs ${ast2.length}`);
    }
    
    // Check array contents (limited to first few elements for simplicity)
    const maxCheck = Math.min(ast1.length, ast2.length, 5);
    for (let i = 0; i < maxCheck; i++) {
      const childPath = path ? `${path}[${i}]` : `[${i}]`;
      differences.push(...findASTDifferences(ast1[i], ast2[i], childPath));
    }
  } else if (typeof ast1 === 'object' && ast1 !== null && ast2 !== null) {
    // Compare objects
    const keys1 = Object.keys(ast1);
    const keys2 = Object.keys(ast2);
    
    // Check for key differences
    const uniqueKeys1 = keys1.filter(k => !keys2.includes(k));
    const uniqueKeys2 = keys2.filter(k => !keys1.includes(k));
    
    if (uniqueKeys1.length > 0) {
      differences.push(`${path || 'root'}: Keys only in v3.0.1: ${uniqueKeys1.join(', ')}`);
    }
    
    if (uniqueKeys2.length > 0) {
      differences.push(`${path || 'root'}: Keys only in v3.3.0: ${uniqueKeys2.join(', ')}`);
    }
    
    // Check common keys recursively
    const commonKeys = keys1.filter(k => keys2.includes(k));
    for (const key of commonKeys) {
      const childPath = path ? `${path}.${key}` : key;
      differences.push(...findASTDifferences(ast1[key], ast2[key], childPath));
    }
  } else if (ast1 !== ast2) {
    // Compare primitive values
    differences.push(`${path || 'root'}: Value changed from "${ast1}" to "${ast2}"`);
  }
  
  return differences;
}

// Run the comparison
run().catch(console.error); 
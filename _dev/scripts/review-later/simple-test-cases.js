#!/usr/bin/env node

/**
 * Simple script to create test cases for comparing meld-ast versions
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const COMPARISON_DIR = path.join(process.cwd(), 'meld-ast-comparison');
const CASES_DIR = path.join(COMPARISON_DIR, 'specific-cases');

// Define test cases for array notation and other issues
const TEST_CASES = [
  {
    name: 'array-notation-simple',
    description: 'Tests simple array access notation',
    content: `
@data fruits = ["apple", "banana", "cherry"]

Bracket notation: {{fruits[0]}}, {{fruits[1]}}, {{fruits[2]}}
`
  },
  {
    name: 'array-notation-nested',
    description: 'Tests nested array access notation',
    content: `
@data users = [
  { name: "Alice", hobbies: ["reading", "hiking"] },
  { name: "Bob", hobbies: ["gaming", "cooking"] }
]

User 1: {{users[0].name}} - {{users[0].hobbies[0]}}
User 2: {{users[1].name}} - {{users[1].hobbies[1]}}
`
  },
  {
    name: 'array-variable-index',
    description: 'Tests array access with variable index',
    content: `
@data fruits = ["apple", "banana", "cherry"]
@data index = 1

Using variable index: {{fruits[index]}}
`
  }
];

// Create directory structure
function ensureDirExists(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Create a version analyzer script
function createAnalyzerScript(version) {
  const content = `
#!/usr/bin/env node

const { parse } = require('meld-ast');
const fs = require('fs');
const path = require('path');

// Read in all test case files in the directory
const testCasesDir = path.join('${CASES_DIR}');
const files = fs.readdirSync(testCasesDir)
  .filter(file => file.endsWith('.meld'));

async function run() {
  console.log(\`Analyzing meld-ast \${process.argv[2] || 'current version'}...\`);
  
  for (const file of files) {
    const filePath = path.join(testCasesDir, file);
    const basename = path.basename(file, '.meld');
    const content = fs.readFileSync(filePath, 'utf8');
    
    try {
      console.log(\`Processing \${basename}...\`);
      
      const result = await parse(content, {
        preserveCodeFences: true,
        failFast: false,
        trackLocations: true,
        validateNodes: true
      });
      
      // Save AST as JSON
      fs.writeFileSync(
        path.join('${CASES_DIR}', '${version}', \`\${basename}-ast.json\`),
        JSON.stringify(result, null, 2)
      );
      
      console.log(\`Saved AST for \${basename}\`);
    } catch (error) {
      console.error(\`Error processing \${basename}:\`, error);
      fs.writeFileSync(
        path.join('${CASES_DIR}', '${version}', \`\${basename}-error.log\`),
        error.toString()
      );
    }
  }
}

run().catch(console.error);
`;

  const scriptPath = path.join(CASES_DIR, version, 'analyze.js');
  fs.writeFileSync(scriptPath, content);
  
  try {
    execSync(`chmod +x ${scriptPath}`);
  } catch (error) {
    console.warn('Could not make script executable:', error);
  }
}

// Main function
function main() {
  // Create directories
  ensureDirExists(COMPARISON_DIR);
  ensureDirExists(CASES_DIR);
  ensureDirExists(path.join(CASES_DIR, '3.0.1'));
  ensureDirExists(path.join(CASES_DIR, '3.3.0'));
  
  // Create test case files
  for (const testCase of TEST_CASES) {
    const filePath = path.join(CASES_DIR, `${testCase.name}.meld`);
    fs.writeFileSync(filePath, testCase.content);
    console.log(`Created test case: ${testCase.name}`);
  }
  
  // Create README with test case descriptions
  let readme = '# Specific Test Cases\n\n';
  readme += 'This directory contains test cases designed to highlight specific differences between meld-ast 3.0.1 and 3.3.0.\n\n';
  
  for (const testCase of TEST_CASES) {
    readme += `## ${testCase.name}\n\n`;
    readme += `${testCase.description}\n\n`;
    readme += '```meld\n' + testCase.content + '\n```\n\n';
  }
  
  fs.writeFileSync(path.join(CASES_DIR, 'README.md'), readme);
  
  // Create analyzer scripts for each version
  createAnalyzerScript('3.0.1');
  createAnalyzerScript('3.3.0');
  
  // Create a script to compare results
  const compareScript = `
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const CASES_DIR = path.join(process.cwd(), 'meld-ast-comparison', 'specific-cases');

// Get all test case files
const testFiles = fs.readdirSync(CASES_DIR)
  .filter(file => file.endsWith('.meld'))
  .map(file => path.basename(file, '.meld'));

// Generate a comparison report
let report = '# AST Comparison Report\\n\\n';
report += 'Comparison of meld-ast 3.0.1 vs 3.3.0 for specific test cases\\n\\n';

for (const testName of testFiles) {
  report += \`## \${testName}\\n\\n\`;
  
  const ast301Path = path.join(CASES_DIR, '3.0.1', \`\${testName}-ast.json\`);
  const ast330Path = path.join(CASES_DIR, '3.3.0', \`\${testName}-ast.json\`);
  
  if (!fs.existsSync(ast301Path) || !fs.existsSync(ast330Path)) {
    report += \`Could not compare ASTs - one or both files missing.\\n\\n\`;
    continue;
  }
  
  try {
    const ast301 = JSON.parse(fs.readFileSync(ast301Path, 'utf8'));
    const ast330 = JSON.parse(fs.readFileSync(ast330Path, 'utf8'));
    
    // Simple comparison focusing on array notation
    const arrayNotationDiffs = findArrayNotationDiffs(ast301, ast330);
    
    if (arrayNotationDiffs.length > 0) {
      report += \`### Array Notation Differences\\n\\n\`;
      arrayNotationDiffs.forEach(diff => {
        report += \`- \${diff}\\n\`;
      });
    } else {
      report += \`No significant array notation differences detected.\\n\`;
    }
    
  } catch (error) {
    report += \`Error comparing ASTs: \${error.message}\\n\`;
  }
  
  report += \`\\n---\\n\\n\`;
}

fs.writeFileSync(path.join(CASES_DIR, 'comparison-report.md'), report);
console.log('Generated comparison report');

// Find differences in array notation
function findArrayNotationDiffs(ast1, ast2) {
  const diffs = [];
  
  // Helper to find all array accesses
  function findArrayAccesses(ast) {
    const results = [];
    
    function traverse(node, path = '') {
      if (!node || typeof node !== 'object') return;
      
      // Check if this is an array access node
      if ((node.type === 'MemberExpression' && node.computed === true) ||
          node.type === 'ComputedMemberExpression') {
        results.push({ node, path });
      }
      
      // Traverse children
      for (const key in node) {
        if (Array.isArray(node[key])) {
          node[key].forEach((child, i) => traverse(child, \`\${path}.\${key}[\${i}]\`));
        } else if (node[key] && typeof node[key] === 'object') {
          traverse(node[key], \`\${path}.\${key}\`);
        }
      }
    }
    
    if (ast.ast) {
      ast.ast.forEach((node, i) => traverse(node, \`ast[\${i}]\`));
    }
    
    return results;
  }
  
  const accesses1 = findArrayAccesses(ast1);
  const accesses2 = findArrayAccesses(ast2);
  
  // Compare counts
  if (accesses1.length !== accesses2.length) {
    diffs.push(\`Number of array access expressions differs: \${accesses1.length} vs \${accesses2.length}\`);
  }
  
  // Check for type differences in array accesses
  const minLength = Math.min(accesses1.length, accesses2.length);
  for (let i = 0; i < minLength; i++) {
    const access1 = accesses1[i].node;
    const access2 = accesses2[i].node;
    
    if (access1.type !== access2.type) {
      diffs.push(\`Array access type changed from \${access1.type} to \${access2.type}\`);
    }
    
    if (access1.property && access2.property && 
        access1.property.type !== access2.property.type) {
      diffs.push(\`Array property type changed from \${access1.property.type} to \${access2.property.type}\`);
    }
  }
  
  return diffs;
}
`;

  const compareScriptPath = path.join(CASES_DIR, 'compare-results.js');
  fs.writeFileSync(compareScriptPath, compareScript);
  
  try {
    execSync(`chmod +x ${compareScriptPath}`);
  } catch (error) {
    console.warn('Could not make script executable:', error);
  }
  
  console.log('\nTest cases and scripts created successfully.');
  console.log('\nNow you can:');
  console.log('1. Install meld-ast@3.0.1 and run node meld-ast-comparison/specific-cases/3.0.1/analyze.js');
  console.log('2. Install meld-ast@3.3.0 and run node meld-ast-comparison/specific-cases/3.3.0/analyze.js');
  console.log('3. Run node meld-ast-comparison/specific-cases/compare-results.js to generate a comparison report');
}

main(); 
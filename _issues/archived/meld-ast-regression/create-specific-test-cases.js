#!/usr/bin/env node

/**
 * Script to create specific test cases that highlight differences 
 * between meld-ast 3.0.1 and 3.3.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { promisify } = require('util');
const writeFileAsync = promisify(fs.writeFile);
const mkdirAsync = promisify(fs.mkdir);

const COMPARISON_DIR = path.join(process.cwd(), 'meld-ast-comparison');
const CASES_DIR = path.join(COMPARISON_DIR, 'specific-cases');

// Define test cases that specifically target potential changes
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
  },
  {
    name: 'array-variable-expression',
    description: 'Tests array access with expression in index',
    content: `
@data fruits = ["apple", "banana", "cherry"]
@data offset = 1

Using expression index: {{fruits[1 + offset]}}
`
  },
  {
    name: 'array-string-keys',
    description: 'Tests objects with string keys that look like array indices',
    content: `
@data obj = {
  "0": "zero",
  "1": "one",
  "2": "two"
}

Accessing object with numeric keys: {{obj["0"]}}, {{obj["1"]}}
`
  },
  {
    name: 'complex-expressions',
    description: 'Tests complex expressions with array access',
    content: `
@data nested = {
  items: [
    { values: [10, 20, 30] },
    { values: [40, 50, 60] }
  ]
}

Nested complex: {{nested.items[0].values[2]}}
Math expression: {{nested.items[1].values[2 - 1]}}
`
  },
  {
    name: 'multi-dimensional-arrays',
    description: 'Tests multi-dimensional array access',
    content: `
@data matrix = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9]
]

Matrix access: {{matrix[0][0]}}, {{matrix[1][1]}}, {{matrix[2][2]}}
`
  },
  {
    name: 'bracket-notation-properties',
    description: 'Tests bracket notation for property access',
    content: `
@data user = {
  "first name": "John",
  "last-name": "Doe",
  "age": 30
}

Bracket property access: {{user["first name"]}}, {{user["last-name"]}}
`
  },
  {
    name: 'mixed-notation',
    description: 'Tests mixed dot and bracket notation',
    content: `
@data users = [
  { 
    name: "Alice", 
    "contact info": { 
      email: "alice@example.com",
      phones: ["123-456-7890", "098-765-4321"]
    }
  }
]

Mixed notation: {{users[0].name}}, {{users[0]["contact info"].email}}, {{users[0]["contact info"].phones[1]}}
`
  }
];

async function run() {
  try {
    // Ensure directories exist
    await ensureDirectoryExists(CASES_DIR);
    await ensureDirectoryExists(path.join(CASES_DIR, '3.0.1'));
    await ensureDirectoryExists(path.join(CASES_DIR, '3.3.0'));
    
    // Create test case documentation
    let documentation = `# Specific Test Cases\n\n`;
    documentation += `This directory contains test cases designed to highlight specific differences between meld-ast 3.0.1 and 3.3.0.\n\n`;
    
    // Create each test case
    for (const testCase of TEST_CASES) {
      console.log(`Creating test case: ${testCase.name}`);
      
      // Write test case file
      const testFilePath = path.join(CASES_DIR, `${testCase.name}.meld`);
      await writeFileAsync(testFilePath, testCase.content);
      
      // Add to documentation
      documentation += `## ${testCase.name}\n\n`;
      documentation += `${testCase.description}\n\n`;
      documentation += "```meld\n" + testCase.content + "\n```\n\n";
    }
    
    // Save documentation
    await writeFileAsync(path.join(CASES_DIR, 'README.md'), documentation);
    
    // Create AST comparison script
    await createASTComparisonScript();
    
    console.log('Test cases created successfully. You can now run the AST comparison script to analyze differences.');
  } catch (error) {
    console.error('Error creating test cases:', error);
    process.exit(1);
  }
}

async function ensureDirectoryExists(directory) {
  try {
    await mkdirAsync(directory, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

async function createASTComparisonScript() {
  const scriptContent = `#!/usr/bin/env node

/**
 * Script to compare AST outputs between meld-ast versions
 * for the specific test cases
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { promisify } = require('util');
const writeFileAsync = promisify(fs.writeFile);
const readFileAsync = promisify(fs.readFile);
const readDirAsync = promisify(fs.readdir);

const COMPARISON_DIR = path.join(process.cwd(), 'meld-ast-comparison');
const CASES_DIR = path.join(COMPARISON_DIR, 'specific-cases');

async function run() {
  try {
    // Get all test case files
    const files = await readDirAsync(CASES_DIR);
    const testFiles = files.filter(file => file.endsWith('.meld'));
    
    // Process each version
    for (const version of ['3.0.1', '3.3.0']) {
      console.log(\`\\n=== Processing meld-ast \${version} ===\`);
      
      try {
        // Install the specific version
        console.log(\`Installing meld-ast@\${version}...\`);
        execSync('rm -rf node_modules', { stdio: 'inherit' });
        execSync('npm install', { stdio: 'inherit' }); 
        execSync(\`npm install meld-ast@\${version}\`, { stdio: 'inherit' });
        
        // Process each test file
        for (const testFile of testFiles) {
          const baseName = path.basename(testFile, '.meld');
          console.log(\`Processing \${baseName}...\`);
          
          const content = await readFileAsync(path.join(CASES_DIR, testFile), 'utf8');
          
          // Create AST generator script with properly escaped content
          const astScriptContent = \`
          const { parse } = require('meld-ast');
          
          async function main() {
            const content = \\\`\${content.replace(/\\\`/g, '\\\\\\\`')}\\\`;
            const result = await parse(content, {
              preserveCodeFences: true,
              failFast: false,
              trackLocations: true,
              validateNodes: true
            });
            console.log(JSON.stringify(result, null, 2));
          }
          
          main().catch(console.error);
          \`;
          
          const scriptPath = path.join(CASES_DIR, version, \`\${baseName}-ast-generator.js\`);
          await writeFileAsync(scriptPath, astScriptContent);
          
          // Generate AST output
          try {
            const astOutput = execSync(\`node \${scriptPath}\`, { encoding: 'utf8' });
            await writeFileAsync(path.join(CASES_DIR, version, \`\${baseName}-ast.json\`), astOutput);
            
            // Create a human-readable report highlighting important parts
            const ast = JSON.parse(astOutput);
            const summary = generateASTSummary(ast, baseName);
            await writeFileAsync(path.join(CASES_DIR, version, \`\${baseName}-summary.md\`), summary);
          } catch (error) {
            await writeFileAsync(
              path.join(CASES_DIR, version, \`\${baseName}-error.log\`), 
              error.toString()
            );
          }
        }
      } catch (error) {
        console.error(\`Error processing version \${version}:\`, error);
      }
    }
    
    // Generate comparison report
    await generateComparisonReport(testFiles);
    
  } catch (error) {
    console.error('Error running AST comparison:', error);
    process.exit(1);
  }
}

function generateASTSummary(ast, testName) {
  let summary = \`# AST Summary for \${testName}\n\n\`;
  
  // Ensure we have an AST to work with
  if (!ast || !ast.ast || !Array.isArray(ast.ast)) {
    return summary + 'Invalid or empty AST structure.\\n';
  }
  
  // Add overall stats
  summary += \`## Overall Structure\n\n\`;
  summary += \`- Total nodes: \${countNodes(ast.ast)}\n\`;
  summary += \`- Top-level nodes: \${ast.ast.length}\n\`;
  
  // Extract and summarize interesting parts based on the test name
  if (testName.includes('array-notation')) {
    // Find interpolation expressions
    const interpolations = findNodesOfType(ast.ast, 'Interpolation');
    summary += \`\n## Interpolation Expressions (\${interpolations.length})\n\n\`;
    
    interpolations.forEach((node, index) => {
      summary += \`### Interpolation #\${index + 1}\n\n\`;
      
      if (node.expression) {
        summary += \`Expression type: \${node.expression.type}\n\n\`;
        summary += \`\`\`json\n\${JSON.stringify(node.expression, null, 2)}\n\`\`\`\n\n\`;
      } else {
        summary += \`No expression found.\n\n\`;
      }
    });
  } else if (testName.includes('bracket-notation')) {
    // Find member expressions
    const members = findNodesByPredicate(ast.ast, node => 
      node.type === 'MemberExpression' || node.type === 'ComputedMemberExpression'
    );
    
    summary += \`\n## Member Expressions (\${members.length})\n\n\`;
    
    members.forEach((node, index) => {
      summary += \`### Member Expression #\${index + 1}\n\n\`;
      summary += \`Type: \${node.type}\n\`;
      
      if (node.property) {
        summary += \`Property: \${JSON.stringify(node.property)}\n\`;
      }
      
      summary += \`\n\`\`\`json\n\${JSON.stringify(node, null, 2)}\n\`\`\`\n\n\`;
    });
  } else {
    // General summary for other test cases
    const nodeTypes = countNodeTypes(ast.ast);
    
    summary += \`\n## Node Types\n\n\`;
    Object.entries(nodeTypes).forEach(([type, count]) => {
      summary += \`- \${type}: \${count}\n\`;
    });
  }
  
  return summary;
}

function countNodes(nodes) {
  if (!Array.isArray(nodes)) return 0;
  
  let count = nodes.length;
  for (const node of nodes) {
    if (node && typeof node === 'object') {
      for (const key in node) {
        if (Array.isArray(node[key])) {
          count += countNodes(node[key]);
        } else if (node[key] && typeof node[key] === 'object') {
          count += 1 + countNodes(Object.values(node[key]).filter(v => Array.isArray(v)));
        }
      }
    }
  }
  return count;
}

function countNodeTypes(nodes) {
  const types = {};
  
  function traverse(node) {
    if (!node || typeof node !== 'object') return;
    
    if (node.type) {
      types[node.type] = (types[node.type] || 0) + 1;
    }
    
    for (const key in node) {
      if (Array.isArray(node[key])) {
        node[key].forEach(traverse);
      } else if (node[key] && typeof node[key] === 'object') {
        traverse(node[key]);
      }
    }
  }
  
  nodes.forEach(traverse);
  return types;
}

function findNodesOfType(nodes, targetType) {
  const results = [];
  
  function traverse(node) {
    if (!node || typeof node !== 'object') return;
    
    if (node.type === targetType) {
      results.push(node);
    }
    
    for (const key in node) {
      if (Array.isArray(node[key])) {
        node[key].forEach(traverse);
      } else if (node[key] && typeof node[key] === 'object') {
        traverse(node[key]);
      }
    }
  }
  
  nodes.forEach(traverse);
  return results;
}

function findNodesByPredicate(nodes, predicate) {
  const results = [];
  
  function traverse(node) {
    if (!node || typeof node !== 'object') return;
    
    if (predicate(node)) {
      results.push(node);
    }
    
    for (const key in node) {
      if (Array.isArray(node[key])) {
        node[key].forEach(traverse);
      } else if (node[key] && typeof node[key] === 'object') {
        traverse(node[key]);
      }
    }
  }
  
  nodes.forEach(traverse);
  return results;
}

async function generateComparisonReport(testFiles) {
  let report = \`# AST Comparison Report\n\n\`;
  report += \`Comparison of meld-ast 3.0.1 vs 3.3.0 for specific test cases\n\n\`;
  
  // Process each test case
  for (const testFile of testFiles) {
    const baseName = path.basename(testFile, '.meld');
    report += \`## \${baseName}\n\n\`;
    
    // Get ASTs for both versions
    const ast301Path = path.join(CASES_DIR, '3.0.1', \`\${baseName}-ast.json\`);
    const ast330Path = path.join(CASES_DIR, '3.3.0', \`\${baseName}-ast.json\`);
    
    if (!fs.existsSync(ast301Path) || !fs.existsSync(ast330Path)) {
      report += \`Could not compare ASTs - one or both files missing.\n\n\`;
      continue;
    }
    
    try {
      const ast301 = JSON.parse(await readFileAsync(ast301Path, 'utf8'));
      const ast330 = JSON.parse(await readFileAsync(ast330Path, 'utf8'));
      
      // Find key differences in the AST structure
      const differences = findKeyDifferences(ast301, ast330);
      
      if (differences.length > 0) {
        report += \`### Key Differences\n\n\`;
        differences.forEach(diff => {
          report += \`- \${diff}\n\`;
        });
      } else {
        report += \`No significant structural differences detected.\n\`;
      }
      
      // Specifically highlight array notation changes
      const arrayNotationChanges = findArrayNotationChanges(ast301, ast330);
      if (arrayNotationChanges.length > 0) {
        report += \`\n### Array Notation Changes\n\n\`;
        arrayNotationChanges.forEach(change => {
          report += \`- \${change}\n\`;
        });
      }
      
    } catch (error) {
      report += \`Error comparing ASTs: \${error.message}\n\`;
    }
    
    report += \`\n---\n\n\`;
  }
  
  await writeFileAsync(path.join(CASES_DIR, 'comparison-report.md'), report);
}

function findKeyDifferences(ast1, ast2) {
  const differences = [];
  
  // Compare top-level structure
  if (!ast1.ast || !ast2.ast) {
    differences.push('One or both ASTs is missing the ast field');
    return differences;
  }
  
  if (ast1.ast.length !== ast2.ast.length) {
    differences.push(\`Number of top-level nodes differs: \${ast1.ast.length} vs \${ast2.ast.length}\`);
  }
  
  // Compare node types
  const types1 = countNodeTypes(ast1.ast);
  const types2 = countNodeTypes(ast2.ast);
  
  const allTypes = new Set([...Object.keys(types1), ...Object.keys(types2)]);
  
  for (const type of allTypes) {
    const count1 = types1[type] || 0;
    const count2 = types2[type] || 0;
    
    if (count1 !== count2) {
      differences.push(\`Node type '\${type}' count differs: \${count1} vs \${count2}\`);
    }
  }
  
  // Compare key node structures based on node type
  const interpolations1 = findNodesOfType(ast1.ast, 'Interpolation');
  const interpolations2 = findNodesOfType(ast2.ast, 'Interpolation');
  
  if (interpolations1.length === interpolations2.length) {
    // Compare interpolation expressions
    for (let i = 0; i < interpolations1.length; i++) {
      const expr1 = interpolations1[i].expression;
      const expr2 = interpolations2[i].expression;
      
      if (expr1 && expr2 && expr1.type !== expr2.type) {
        differences.push(\`Interpolation #\${i+1} expression type changed: \${expr1.type} → \${expr2.type}\`);
      }
    }
  }
  
  return differences;
}

function findArrayNotationChanges(ast1, ast2) {
  const changes = [];
  
  // Find array accesses in both ASTs
  const arrayAccesses1 = findNodesByPredicate(ast1.ast, node => 
    node.type === 'ComputedMemberExpression' || 
    (node.type === 'MemberExpression' && node.computed === true)
  );
  
  const arrayAccesses2 = findNodesByPredicate(ast2.ast, node => 
    node.type === 'ComputedMemberExpression' || 
    (node.type === 'MemberExpression' && node.computed === true) ||
    (node.type === 'MemberExpression' && typeof node.property === 'object' && 
     node.property.type === 'Literal' && !isNaN(parseInt(node.property.value)))
  );
  
  // Check if there are different numbers of array accesses
  if (arrayAccesses1.length !== arrayAccesses2.length) {
    changes.push(\`Number of array access expressions differs: \${arrayAccesses1.length} vs \${arrayAccesses2.length}\`);
  }
  
  // Check for type changes in corresponding positions
  const minLength = Math.min(arrayAccesses1.length, arrayAccesses2.length);
  for (let i = 0; i < minLength; i++) {
    const access1 = arrayAccesses1[i];
    const access2 = arrayAccesses2[i];
    
    if (access1.type !== access2.type) {
      changes.push(\`Array access #\${i+1} changed from \${access1.type} to \${access2.type}\`);
    }
    
    // Check property access style
    if (access1.property && access2.property && access1.property.type !== access2.property.type) {
      changes.push(\`Array access #\${i+1} property type changed from \${access1.property.type} to \${access2.property.type}\`);
    }
  }
  
  return changes;
}

// Run the script
run().catch(console.error); 
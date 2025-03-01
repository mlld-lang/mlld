#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const CASES_DIR = path.join(process.cwd(), 'meld-ast-comparison', 'specific-cases');

// Get all test case files
const testFiles = fs.readdirSync(CASES_DIR)
  .filter(file => file.endsWith('.meld'))
  .map(file => path.basename(file, '.meld'));

// Generate a comparison report
let report = '# AST Comparison Report\n\n';
report += 'Comparison of meld-ast 3.0.1 vs 3.3.0 for specific test cases\n\n';

for (const testName of testFiles) {
  report += `## ${testName}\n\n`;
  
  const ast301Path = path.join(CASES_DIR, '3.0.1', `${testName}-ast.json`);
  const ast330Path = path.join(CASES_DIR, '3.3.0', `${testName}-ast.json`);
  
  if (!fs.existsSync(ast301Path) || !fs.existsSync(ast330Path)) {
    report += `Could not compare ASTs - one or both files missing.\n\n`;
    continue;
  }
  
  try {
    const ast301 = JSON.parse(fs.readFileSync(ast301Path, 'utf8'));
    const ast330 = JSON.parse(fs.readFileSync(ast330Path, 'utf8'));
    
    // Simple comparison focusing on array notation
    const arrayNotationDiffs = findArrayNotationDiffs(ast301, ast330);
    
    if (arrayNotationDiffs.length > 0) {
      report += `### Array Notation Differences\n\n`;
      arrayNotationDiffs.forEach(diff => {
        report += `- ${diff}\n`;
      });
    } else {
      report += `No significant array notation differences detected.\n`;
    }
    
  } catch (error) {
    report += `Error comparing ASTs: ${error.message}\n`;
  }
  
  report += `\n---\n\n`;
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
          node[key].forEach((child, i) => traverse(child, `${path}.${key}[${i}]`));
        } else if (node[key] && typeof node[key] === 'object') {
          traverse(node[key], `${path}.${key}`);
        }
      }
    }
    
    if (ast.ast) {
      ast.ast.forEach((node, i) => traverse(node, `ast[${i}]`));
    }
    
    return results;
  }
  
  const accesses1 = findArrayAccesses(ast1);
  const accesses2 = findArrayAccesses(ast2);
  
  // Compare counts
  if (accesses1.length !== accesses2.length) {
    diffs.push(`Number of array access expressions differs: ${accesses1.length} vs ${accesses2.length}`);
  }
  
  // Check for type differences in array accesses
  const minLength = Math.min(accesses1.length, accesses2.length);
  for (let i = 0; i < minLength; i++) {
    const access1 = accesses1[i].node;
    const access2 = accesses2[i].node;
    
    if (access1.type !== access2.type) {
      diffs.push(`Array access type changed from ${access1.type} to ${access2.type}`);
    }
    
    if (access1.property && access2.property && 
        access1.property.type !== access2.property.type) {
      diffs.push(`Array property type changed from ${access1.property.type} to ${access2.property.type}`);
    }
  }
  
  return diffs;
}

#!/usr/bin/env node

/**
 * This script identifies tests that are likely failing due to array notation changes
 * between meld-ast 3.0.1 and 3.3.0.
 * 
 * It scans test files for bracket notation usage and reports which tests might be affected.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const TESTS_DIR = path.join(__dirname, '..', 'tests');
const REPORT_FILE = path.join(__dirname, '..', 'meld-ast-comparison', 'array-notation-failures.md');

// Patterns to look for
const ARRAY_NOTATION_PATTERNS = [
  /\[\s*\d+\s*\]/g,                // [0], [1], etc.
  /\[\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\]/g, // [variable]
  /\{\{.*?\[.*?\].*?\}\}/g,        // {{something[index]}}
];

function scanFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Check if file contains array notation
    const matches = ARRAY_NOTATION_PATTERNS.map(pattern => {
      const found = content.match(pattern);
      return found ? found : [];
    }).flat();
    
    if (matches.length > 0) {
      return {
        file: filePath,
        matches: [...new Set(matches)], // Remove duplicates
        count: matches.length
      };
    }
    
    return null;
  } catch (error) {
    console.error(`Error scanning ${filePath}:`, error.message);
    return null;
  }
}

function scanDirectory(dir) {
  const results = [];
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        results.push(...scanDirectory(fullPath));
      } else if (entry.isFile() && 
                (entry.name.endsWith('.meld') || 
                 entry.name.endsWith('.test.js') || 
                 entry.name.endsWith('.test.ts'))) {
        // Scan test files and .meld files
        const result = scanFile(fullPath);
        if (result) {
          results.push(result);
        }
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${dir}:`, error.message);
  }
  
  return results;
}

function generateReport(results) {
  const reportContent = [
    '# Array Notation Usage Analysis',
    '',
    'This report identifies files that use array notation and may be affected by changes between meld-ast 3.0.1 and 3.3.0.',
    '',
    `Total files with array notation: ${results.length}`,
    '',
    '## Files with Array Notation',
    ''
  ];
  
  // Sort results by count (most matches first)
  results.sort((a, b) => b.count - a.count);
  
  for (const result of results) {
    const relativePath = path.relative(path.join(__dirname, '..'), result.file);
    
    reportContent.push(`### ${relativePath}`);
    reportContent.push(`- Occurrences: ${result.count}`);
    reportContent.push('- Examples:');
    
    // Show up to 5 examples
    const examples = result.matches.slice(0, 5);
    for (const example of examples) {
      reportContent.push(`  - \`${example}\``);
    }
    
    if (result.matches.length > 5) {
      reportContent.push(`  - ... and ${result.matches.length - 5} more`);
    }
    
    reportContent.push('');
  }
  
  return reportContent.join('\n');
}

// Main execution
console.log('Scanning for array notation usage...');
const results = scanDirectory(TESTS_DIR);
console.log(`Found ${results.length} files with array notation.`);

if (results.length > 0) {
  const report = generateReport(results);
  
  // Ensure directory exists
  const reportDir = path.dirname(REPORT_FILE);
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  
  fs.writeFileSync(REPORT_FILE, report);
  console.log(`Report generated at: ${REPORT_FILE}`);
} 
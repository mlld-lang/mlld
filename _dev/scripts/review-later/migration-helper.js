/**
 * Migration Helper Script
 * 
 * This script generates directives to help migrate from syntax-test-helpers to centralized syntax.
 * It analyzes test files and suggests replacements.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Map of directive types to their centralized import
const DIRECTIVE_IMPORTS = {
  'text': 'textDirectiveExamples',
  'data': 'dataDirectiveExamples',
  'import': 'importDirectiveExamples',
  'path': 'pathDirectiveExamples',
  'define': 'defineDirectiveExamples',
  'run': 'runDirectiveExamples',
  'embed': 'embedDirectiveExamples',
  'integration': 'integrationExamples',
  'codefence': 'codefenceExamples',
  'content': 'contentExamples',
  'comment': 'commentExamples'
};

// Function to find all files that import from syntax-test-helpers
function findUsages() {
  console.log('Finding files that import from syntax-test-helpers...');
  
  try {
    const output = execSync('grep -r "from.*syntax-test-helpers" --include="*.ts" --exclude-dir="node_modules" .').toString();
    const lines = output.split('\n').filter(Boolean);
    
    const files = new Set();
    
    lines.forEach(line => {
      const parts = line.split(':');
      const file = parts[0];
      
      if (file && !file.includes('archived') && !file.includes('_issues')) {
        files.add(file);
      }
    });
    
    return Array.from(files);
  } catch (error) {
    console.error('Error finding usages:', error);
    return [];
  }
}

// Function to analyze a file and suggest replacements
function analyzeFile(filePath) {
  console.log(`\nAnalyzing ${filePath}...`);
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    // Find imports
    const importLine = lines.find(line => line.includes('syntax-test-helpers'));
    if (!importLine) {
      console.log('No import from syntax-test-helpers found.');
      return;
    }
    
    console.log(`Import: ${importLine.trim()}`);
    
    // Check what functions are imported
    const importsFunctions = [];
    if (importLine.includes('getExample')) importsFunctions.push('getExample');
    if (importLine.includes('getInvalidExample')) importsFunctions.push('getInvalidExample');
    if (importLine.includes('createNodeFromExample')) importsFunctions.push('createNodeFromExample');
    if (importLine.includes('getBackwardCompatibleExample')) importsFunctions.push('getBackwardCompatibleExample');
    if (importLine.includes('getBackwardCompatibleInvalidExample')) importsFunctions.push('getBackwardCompatibleInvalidExample');
    
    console.log(`Imported functions: ${importsFunctions.join(', ')}`);
    
    // Find usages of getExample
    const getExampleMatches = [];
    const getInvalidExampleMatches = [];
    
    lines.forEach((line, index) => {
      if (line.includes('getExample(')) {
        const match = line.match(/getExample\(['"]([^'"]+)['"],\s*['"]([^'"]+)['"],\s*['"]([^'"]+)['"]\)/);
        if (match) {
          getExampleMatches.push({
            line: index,
            directiveType: match[1],
            category: match[2],
            example: match[3],
            text: line.trim()
          });
        }
      }
      
      if (line.includes('getInvalidExample(')) {
        const match = line.match(/getInvalidExample\(['"]([^'"]+)['"],\s*['"]([^'"]+)['"]\)/);
        if (match) {
          getInvalidExampleMatches.push({
            line: index,
            directiveType: match[1],
            example: match[2],
            text: line.trim()
          });
        }
      }
    });
    
    if (getExampleMatches.length > 0) {
      console.log('\ngetExample usages:');
      const uniqueDirectives = new Set();
      
      getExampleMatches.forEach(match => {
        console.log(`Line ${match.line + 1}: ${match.text}`);
        console.log(`  Replace with: ${DIRECTIVE_IMPORTS[match.directiveType]}.${match.category}.${match.example}`);
        uniqueDirectives.add(match.directiveType);
      });
      
      // Suggest imports
      console.log('\nSuggested imports:');
      const imports = Array.from(uniqueDirectives).map(type => DIRECTIVE_IMPORTS[type]);
      console.log(`import { ${imports.join(', ')} } from '@core/syntax';`);
    }
    
    if (getInvalidExampleMatches.length > 0) {
      console.log('\ngetInvalidExample usages:');
      
      getInvalidExampleMatches.forEach(match => {
        console.log(`Line ${match.line + 1}: ${match.text}`);
        console.log(`  Replace with: ${DIRECTIVE_IMPORTS[match.directiveType]}.invalid.${match.example}`);
      });
    }
    
    if (importsFunctions.includes('createNodeFromExample')) {
      console.log('\nNote: This file uses createNodeFromExample, which should be implemented locally.');
    }
    
    if (importsFunctions.includes('getBackwardCompatibleExample') || importsFunctions.includes('getBackwardCompatibleInvalidExample')) {
      console.log('\nWarning: This file uses backward compatibility functions which need special handling.');
    }
    
  } catch (error) {
    console.error(`Error analyzing ${filePath}:`, error);
  }
}

// Main function
function main() {
  console.log('Migration Helper for syntax-test-helpers');
  console.log('========================================');
  
  const files = findUsages();
  
  if (files.length === 0) {
    console.log('No files found that import from syntax-test-helpers.');
    return;
  }
  
  console.log(`Found ${files.length} files to analyze:`);
  files.forEach(file => console.log(`  ${file}`));
  
  // Analyze each file
  files.forEach(analyzeFile);
}

main(); 
#!/usr/bin/env node

/**
 * This script analyzes the test files that need to be updated due to
 * the array notation changes between meld-ast 3.0.1 and 3.3.0.
 * 
 * It provides guidance on how to update these tests to work with 3.3.0.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Files known to be affected by array notation changes
const AFFECTED_FILES = [
  'tests/utils/tests/TestContext.test.ts',
  'tests/meld-ast-nested-fences.test.ts',
  'tests/utils/debug/StateHistoryService/StateHistoryService.test.ts',
  'tests/cli/cli-error-handling.test.ts',
  'tests/utils/debug/StateDebuggerService/StateDebuggerService.test.ts',
  'tests/utils/debug/StateVisualizationService/StateVisualizationService.test.ts',
  'tests/utils/debug/StateTrackingService/StateTrackingService.test.ts'
];

// AST structure changes to look for in test assertions
const PATTERNS_TO_CHECK = {
  // Common patterns in test assertions that may need to be updated
  oldPatterns: [
    /expect\(.*?\)\.toThrow/,         // Expecting an error that no longer occurs
    /expect\(.*?type.*?\)\.toBe/,     // Type assertions that may have changed
    /expect\(.*?fields.*?\)\.toBe/,   // Field assertions that may have changed
    /expect\(.*?fields.*?\)\.toEqual/ // Field equality assertions that may have changed
  ],
  
  // Example of how AST has changed for array access
  astChanges: [
    {
      old: 'Expected to throw error on bracket notation',
      new: 'Now supports bracket notation with field type "index"'
    },
    {
      old: 'fields: [{ type: "identifier", value: "0" }]',
      new: 'fields: [{ type: "index", value: 0 }]'
    }
  ]
};

/**
 * Analyzes a test file and returns locations that likely need updates
 */
function analyzeTestFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const locations = [];
    
    // Look for patterns that may need updating
    PATTERNS_TO_CHECK.oldPatterns.forEach(pattern => {
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i]) && lines[i].includes('[')) {
          // Found a potential issue with array notation
          const startLine = Math.max(0, i - 2);
          const endLine = Math.min(lines.length - 1, i + 2);
          
          locations.push({
            line: i + 1,
            context: lines.slice(startLine, endLine + 1).join('\n'),
            suggestion: getSuggestionForPattern(pattern, lines[i])
          });
        }
      }
    });
    
    return {
      file: filePath,
      locations
    };
  } catch (error) {
    console.error(`Error analyzing ${filePath}:`, error.message);
    return { file: filePath, locations: [], error: error.message };
  }
}

/**
 * Provides a suggestion based on the pattern matched
 */
function getSuggestionForPattern(pattern, line) {
  if (pattern.toString().includes('toThrow')) {
    return 'This test expects bracket notation to throw an error, but in 3.3.0 it is supported. Update to test the new AST structure instead.';
  }
  
  if (pattern.toString().includes('type') && line.includes('"identifier"')) {
    return 'Check if this expects a field type "identifier" that should now be "index" for array access.';
  }
  
  if (pattern.toString().includes('fields')) {
    return 'Array access is now represented with field type "index" and numeric value. Update expected AST structure.';
  }
  
  return 'This line may need to be updated to account for the new array notation handling in meld-ast 3.3.0.';
}

/**
 * Generates a markdown report with update guidance
 */
function generateReport(results) {
  let report = '# Test Update Guide for meld-ast 3.3.0\n\n';
  report += 'This guide identifies specific locations in test files that likely need to be updated due to changes in array notation handling between meld-ast 3.0.1 and 3.3.0.\n\n';
  
  report += '## Key AST Changes\n\n';
  report += 'When updating tests, keep these changes in mind:\n\n';
  
  PATTERNS_TO_CHECK.astChanges.forEach(change => {
    report += `- **Old:** ${change.old}\n`;
    report += `- **New:** ${change.new}\n\n`;
  });
  
  report += '## Files Needing Updates\n\n';
  
  let totalLocations = 0;
  
  results.forEach(result => {
    if (result.locations.length > 0) {
      report += `### ${result.file}\n\n`;
      report += `Found ${result.locations.length} locations that likely need updates:\n\n`;
      
      result.locations.forEach((loc, index) => {
        report += `#### Location ${index + 1} (Line ${loc.line})\n\n`;
        report += '```javascript\n' + loc.context + '\n```\n\n';
        report += '**Suggestion:** ' + loc.suggestion + '\n\n';
      });
      
      totalLocations += result.locations.length;
    } else if (result.error) {
      report += `### ${result.file}\n\n`;
      report += `Error analyzing file: ${result.error}\n\n`;
    }
  });
  
  report += `## Summary\n\n`;
  report += `Total files to update: ${results.filter(r => r.locations.length > 0).length}\n`;
  report += `Total locations to modify: ${totalLocations}\n\n`;
  
  report += `## General Update Strategy\n\n`;
  report += `1. Update tests that expect array notation to fail to instead validate the new AST structure\n`;
  report += `2. Change field type expectations from "identifier" to "index" for array indices\n`;
  report += `3. Update expected values: numeric indices are now numbers, not strings (e.g., \`value: 0\` instead of \`value: "0"\`)\n`;
  
  return report;
}

/**
 * Main function
 */
function main() {
  const results = [];
  
  console.log('Analyzing test files that need updates...');
  
  // Analyze each affected file
  for (const file of AFFECTED_FILES) {
    const fullPath = path.join(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      console.log(`Analyzing ${file}...`);
      results.push(analyzeTestFile(fullPath));
    } else {
      console.warn(`File ${file} does not exist, skipping.`);
      results.push({ file, locations: [], error: 'File not found' });
    }
  }
  
  // Generate and save the report
  const report = generateReport(results);
  const reportPath = path.join(process.cwd(), '_issues', 'meld-ast-regression', 'test-update-guide.md');
  
  fs.writeFileSync(reportPath, report);
  console.log(`Report generated at: ${reportPath}`);
  
  // Create a stub JSON file with the affected files for easy reference
  const jsonData = {
    affectedFiles: AFFECTED_FILES,
    totalFiles: AFFECTED_FILES.length,
    updateRequired: true,
    astChanges: PATTERNS_TO_CHECK.astChanges
  };
  
  const jsonPath = path.join(process.cwd(), '_issues', 'meld-ast-regression', 'affected-files.json');
  fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));
  console.log(`JSON file created at: ${jsonPath}`);
}

// Run the script
main(); 
/**
 * Test Audit Script
 * 
 * This script assists in auditing test files for compliance with TESTS.md standards.
 * It helps identify tests that need to be updated for proper DI implementation.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import { execSync } from 'child_process';

// Configuration
const TEST_FILE_PATTERN = /\.test\.ts$/;
const EXCLUDE_PATTERNS = [
  /node_modules/,
  /\/utils\/di\// // Exclude di utility tests which are already compliant
];
const PRIORITY_PATTERNS = [
  /InterpreterService\.unit\.test\.ts$/,
  /ImportDirectiveHandler\.test\.ts$/,
  /EmbedDirectiveHandler\.test\.ts$/,
  /integration\.test\.ts$/
];

// Key patterns to check for
const patterns = {
  testContextDI: {
    pattern: /TestContextDI\.createIsolated\(\)/,
    description: 'Uses TestContextDI.createIsolated()'
  },
  contextCleanup: {
    pattern: /await context\?\.cleanup\(\)/,
    description: 'Properly cleans up resources'
  },
  asyncResolution: {
    pattern: /await context\.resolve/,
    description: 'Uses async resolution'
  },
  registerMock: {
    pattern: /context\.registerMock/,
    description: 'Uses context.registerMock()'
  },
  factoryMocking: {
    pattern: /ServiceClientFactory/,
    description: 'Uses factory patterns'
  },
  errorTesting: {
    pattern: /expectToThrowWithConfig/,
    description: 'Uses expectToThrowWithConfig'
  }
};

// Mock detection patterns
const mockPatterns = [
  /vi\.fn\(\)/,
  /vi\.mock\(/,
  /mock/i,
  /createMock/,
  /\.mock/,
  /beforeEach\(/
];

// Service-related patterns
const servicePatterns = [
  /Service/,
  /Handler/,
  /Factory/,
  /Provider/
];

// Results data structure
interface TestFileResult {
  filePath: string;
  category: '🟢' | '🟡' | '🟠' | '🔴';
  issues: string[];
  requiredChanges: string[];
  notes: string[];
  isPriority: boolean;
  serviceArea: string;
  usesMocks: boolean;
}

// Determine category based on issues
function determineCategory(issues: string[]): '🟢' | '🟡' | '🟠' | '🔴' {
  if (issues.length === 0) return '🟢';
  
  // Check for critical issues
  const hasCriticalIssues = issues.some(issue => 
    issue.includes('factory') || 
    issue.includes('circular') ||
    issue.includes('failing')
  );
  
  if (hasCriticalIssues) return '🔴';
  
  // Major issues include DI and async problems
  const hasMajorIssues = issues.some(issue => 
    issue.includes('TestContextDI') || 
    issue.includes('async') ||
    issue.includes('resolution')
  );
  
  if (hasMajorIssues) return '🟠';
  
  // Otherwise minor issues
  return '🟡';
}

// Detect service area from file path
function detectServiceArea(filePath: string): string {
  if (filePath.includes('InterpreterService')) return 'InterpreterService';
  if (filePath.includes('DirectiveService')) return 'DirectiveService';
  if (filePath.includes('StateService')) return 'StateService';
  if (filePath.includes('ResolutionService')) return 'ResolutionService';
  if (filePath.includes('FileSystemService')) return 'FileSystemService';
  if (filePath.includes('ValidationService')) return 'ValidationService';
  if (filePath.includes('Parser')) return 'ParserService';
  if (filePath.includes('SourceMap')) return 'SourceMapService';
  if (filePath.includes('/api/')) return 'API';
  if (filePath.includes('/cli/')) return 'CLI';
  if (filePath.includes('/tests/')) return 'Tests';
  return 'Other';
}

// Detect if a file uses mocks
function detectUsesMocks(content: string): boolean {
  return mockPatterns.some(pattern => pattern.test(content));
}

// Process a single test file
function processTestFile(filePath: string): TestFileResult {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const issues: string[] = [];
    const requiredChanges: string[] = [];
    const usesMocks = detectUsesMocks(content);
    
    // Only check for DI compliance if the file uses mocks
    if (usesMocks) {
      // Check for each pattern
      Object.entries(patterns).forEach(([key, { pattern, description }]) => {
        const matches = content.match(pattern);
        
        if (!matches) {
          issues.push(`Missing: ${description}`);
          requiredChanges.push(`Add ${description}`);
        }
      });
    }
    
    // Check for factory pattern if relevant
    const isPriority = PRIORITY_PATTERNS.some(pattern => pattern.test(filePath));
    const serviceArea = detectServiceArea(filePath);
    
    if (isPriority && !issues.includes('Missing: Uses factory patterns')) {
      // This is a priority file but doesn't mention factories - might need them
      issues.push('May need factory pattern implementation');
      requiredChanges.push('Verify and implement proper factory mocking');
    }
    
    // Additional checks for specific service areas
    if (serviceArea === 'InterpreterService' || serviceArea === 'DirectiveService') {
      if (!content.includes('ServiceClientFactory')) {
        issues.push('May need factory pattern for client factory');
        requiredChanges.push('Implement proper factory client mocking');
      }
    }
    
    return {
      filePath,
      category: determineCategory(issues),
      issues,
      requiredChanges,
      notes: [],
      isPriority,
      serviceArea,
      usesMocks
    };
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error);
    return {
      filePath,
      category: '🔴',
      issues: [`Error processing file: ${(error as Error).message}`],
      requiredChanges: ['Fix file processing error'],
      notes: [],
      isPriority: false,
      serviceArea: 'Unknown',
      usesMocks: false
    };
  }
}

// Recursively find all test files
function findTestFiles(dir: string, results: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    // Skip excluded directories
    if (EXCLUDE_PATTERNS.some(pattern => pattern.test(filePath))) {
      continue;
    }
    
    if (stat.isDirectory()) {
      findTestFiles(filePath, results);
    } else if (TEST_FILE_PATTERN.test(file)) {
      results.push(filePath);
    }
  }
  
  return results;
}

// Generate Markdown report
function generateReport(results: TestFileResult[]): string {
  let report = '# Test Audit Results\n\n';
  
  // Summary statistics
  const categories = {
    '🟢': results.filter(r => r.category === '🟢').length,
    '🟡': results.filter(r => r.category === '🟡').length,
    '🟠': results.filter(r => r.category === '🟠').length,
    '🔴': results.filter(r => r.category === '🔴').length
  };
  
  // Mocks statistics
  const mockFiles = results.filter(r => r.usesMocks);
  const mockFilesByCategory = {
    '🟢': mockFiles.filter(r => r.category === '🟢').length,
    '🟡': mockFiles.filter(r => r.category === '🟡').length,
    '🟠': mockFiles.filter(r => r.category === '🟠').length,
    '🔴': mockFiles.filter(r => r.category === '🔴').length
  };
  
  // Service area statistics
  const serviceAreas = [...new Set(results.map(r => r.serviceArea))];
  const serviceAreaStats = serviceAreas.map(area => {
    const areaFiles = results.filter(r => r.serviceArea === area);
    return {
      area,
      total: areaFiles.length,
      withMocks: areaFiles.filter(r => r.usesMocks).length,
      issues: areaFiles.filter(r => r.issues.length > 0).length
    };
  });
  
  report += '## Summary\n\n';
  report += `Total test files examined: ${results.length}\n`;
  report += `Files with mocks: ${mockFiles.length}\n\n`;
  
  report += '### Overall Status\n\n';
  report += `- 🟢 Compliant: ${categories['🟢']}\n`;
  report += `- 🟡 Minor Issues: ${categories['🟡']}\n`;
  report += `- 🟠 Major Issues: ${categories['🟠']}\n`;
  report += `- 🔴 Critical Failures: ${categories['🔴']}\n\n`;
  
  report += '### Mock Files Status\n\n';
  report += `- 🟢 Compliant: ${mockFilesByCategory['🟢']}\n`;
  report += `- 🟡 Minor Issues: ${mockFilesByCategory['🟡']}\n`;
  report += `- 🟠 Major Issues: ${mockFilesByCategory['🟠']}\n`;
  report += `- 🔴 Critical Failures: ${mockFilesByCategory['🔴']}\n\n`;
  
  report += '### Service Area Analysis\n\n';
  report += '| Service Area | Total Files | Files With Mocks | Files With Issues |\n';
  report += '|--------------|-------------|------------------|-------------------|\n';
  
  serviceAreaStats.forEach(stat => {
    report += `| ${stat.area} | ${stat.total} | ${stat.withMocks} | ${stat.issues} |\n`;
  });
  report += '\n';
  
  // Priority files
  const priorityResults = results.filter(r => r.isPriority);
  report += '## Priority Files\n\n';
  
  for (const result of priorityResults) {
    report += `### ${result.filePath}\n\n`;
    report += `**Category**: ${result.category}\n`;
    report += `**Service Area**: ${result.serviceArea}\n`;
    report += `**Uses Mocks**: ${result.usesMocks ? 'Yes' : 'No'}\n\n`;
    
    if (result.issues.length > 0) {
      report += '**Issues**:\n';
      for (const issue of result.issues) {
        report += `- ${issue}\n`;
      }
      report += '\n';
    }
    
    if (result.requiredChanges.length > 0) {
      report += '**Required Changes**:\n';
      for (const change of result.requiredChanges) {
        report += `- ${change}\n`;
      }
      report += '\n';
    }
    
    if (result.notes.length > 0) {
      report += '**Notes**:\n';
      for (const note of result.notes) {
        report += `- ${note}\n`;
      }
      report += '\n';
    }
  }
  
  // Group by service area
  for (const area of serviceAreas) {
    const areaResults = results.filter(r => !r.isPriority && r.serviceArea === area && r.usesMocks);
    
    if (areaResults.length > 0) {
      report += `## ${area} Tests\n\n`;
      
      // Group by category within service area
      ['🔴', '🟠', '🟡', '🟢'].forEach(category => {
        const categoryResults = areaResults.filter(r => r.category === category);
        
        if (categoryResults.length > 0) {
          report += `### ${category} Category\n\n`;
          
          for (const result of categoryResults) {
            report += `#### ${result.filePath}\n\n`;
            
            if (result.issues.length > 0) {
              report += '**Issues**:\n';
              for (const issue of result.issues) {
                report += `- ${issue}\n`;
              }
              report += '\n';
            }
            
            if (result.requiredChanges.length > 0) {
              report += '**Required Changes**:\n';
              for (const change of result.requiredChanges) {
                report += `- ${change}\n`;
              }
              report += '\n';
            }
            
            if (result.notes.length > 0) {
              report += '**Notes**:\n';
              for (const note of result.notes) {
                report += `- ${note}\n`;
              }
              report += '\n';
            }
          }
        }
      });
    }
  }
  
  return report;
}

// Main function
async function main() {
  // Find all test files
  console.log('Finding test files...');
  const testFiles = findTestFiles('.');
  console.log(`Found ${testFiles.length} test files.`);
  
  // Process each file
  console.log('Auditing test files...');
  const results: TestFileResult[] = [];
  
  for (const filePath of testFiles) {
    console.log(`Processing: ${filePath}`);
    const result = processTestFile(filePath);
    results.push(result);
  }
  
  // Generate and save report
  console.log('Generating report...');
  const report = generateReport(results);
  fs.writeFileSync('test-audit-results.md', report);
  
  // Generate summary of mock files that need updates
  const mockFilesNeedingUpdates = results.filter(r => r.usesMocks && r.category !== '🟢');
  console.log(`Found ${mockFilesNeedingUpdates.length} test files with mocks that need updates.`);
  
  // Save list of files needing updates
  const updateList = mockFilesNeedingUpdates.map(r => `${r.filePath} (${r.category})`).join('\n');
  fs.writeFileSync('test-files-to-update.txt', updateList);
  
  console.log('Audit complete. Results saved to test-audit-results.md');
  console.log('Files needing updates saved to test-files-to-update.txt');
}

// Run the script
main().catch(error => {
  console.error('Error running test audit:', error);
  process.exit(1);
}); 
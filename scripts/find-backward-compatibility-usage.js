#!/usr/bin/env node

/**
 * This script identifies tests that are using the backward compatibility helper functions.
 * It temporarily instruments the helper functions to log their usage, runs the tests,
 * and reports which tests are still relying on the old syntax.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

// Path to the helper file that needs to be instrumented
const helperFilePath = path.resolve(process.cwd(), 'tests/utils/syntax-test-helpers.ts');

// Save log file to the project root instead of temp directory
const logFilePath = path.resolve(process.cwd(), 'backward-compatibility-usage.log');

/**
 * Instruments the helper functions in the syntax-test-helpers.ts file to log their usage
 */
function instrumentHelperFunctions() {
  console.log('Instrumenting helper functions...');
  
  // Read the original file
  const originalContent = fs.readFileSync(helperFilePath, 'utf8');
  console.log(`Original file length: ${originalContent.length} characters`);
  
  // Back up the original file
  const backupFilePath = `${helperFilePath}.backup`;
  fs.writeFileSync(backupFilePath, originalContent);

  // Verify we can write to the log file
  fs.writeFileSync(logFilePath, 'Initializing log file. If you see only this, no backward compatibility functions were called.\n');

  // Directly replace the entire function implementations with our instrumented versions
  let modifiedContent = originalContent;

  // Replace getBackwardCompatibleExample function
  const exampleFunctionStart = 'export function getBackwardCompatibleExample(';
  const exampleFunctionEnd = 'return convertedExample;';
  const instrumentedExampleFunction = `
export function getBackwardCompatibleExample(
  directiveType: DirectiveType,
  category: 'atomic' | 'combinations',
  exampleKey: string
): SyntaxExample {
  const example = directiveExamples[directiveType][category][exampleKey];
  if (!example) return example;
  
  // Log the usage of this function
  try {
    console.log("getBackwardCompatibleExample called:", directiveType, category, exampleKey);
    const error = new Error();
    const stackLines = error.stack.split("\\n");
    let callerInfo = "Unknown";
    
    for (let i = 1; i < stackLines.length; i++) {
      const line = stackLines[i].trim();
      if (!line.includes("syntax-test-helpers.ts")) {
        callerInfo = line.replace(/^at /, "");
        break;
      }
    }
    
    const fs = require('fs');
    const message = "getBackwardCompatibleExample: " + directiveType + "." + category + "." + exampleKey + " - Called from: " + callerInfo + "\\n";
    console.log("Writing to log:", message);
    fs.appendFileSync("${logFilePath}", message);
  } catch (e) {
    console.error("Error logging backward compatibility usage:", e);
  }
  
  const convertedExample = { ...example };
  
  // Convert new syntax with brackets to old format
  if (directiveType === 'import') {
    // Convert @import [path] to @import path
    convertedExample.code = convertedExample.code.replace(/@import \\[(.*?)\\]/g, '@import $1');
  } else if (directiveType === 'run') {
    // Convert @run [command] to @run command
    convertedExample.code = convertedExample.code.replace(/@run \\[(.*?)\\]/g, '@run $1');
  } else if (directiveType === 'embed') {
    // Convert @embed [path] to @embed path
    convertedExample.code = convertedExample.code.replace(/@embed \\[(.*?)\\]/g, '@embed $1');
  } else if (directiveType === 'define') {
    // Convert @define name = @run [command] to @define name = @run command
    convertedExample.code = convertedExample.code.replace(/@run \\[(.*?)\\]/g, '@run $1');
    // Convert @run [$command] to @run $command
    convertedExample.code = convertedExample.code.replace(/@run \\[\\$(.*?)\\]/g, '@run $$1');
    // Convert @run [$command(params)] to @run $command(params)
    convertedExample.code = convertedExample.code.replace(/@run \\[\\$(.*?\\(.*?\\))\\]/g, '@run $$1');
  }
  
  return convertedExample;
}`;

  // Replace getBackwardCompatibleInvalidExample function
  const invalidExampleFunctionStart = 'export function getBackwardCompatibleInvalidExample(';
  const invalidExampleFunctionEnd = 'return convertedExample;';
  const instrumentedInvalidExampleFunction = `
export function getBackwardCompatibleInvalidExample(
  directiveType: DirectiveType,
  exampleKey: string
): InvalidSyntaxExample {
  const example = directiveExamples[directiveType].invalid[exampleKey];
  if (!example) return example;
  
  // Log the usage of this function
  try {
    console.log("getBackwardCompatibleInvalidExample called:", directiveType, exampleKey);
    const error = new Error();
    const stackLines = error.stack.split("\\n");
    let callerInfo = "Unknown";
    
    for (let i = 1; i < stackLines.length; i++) {
      const line = stackLines[i].trim();
      if (!line.includes("syntax-test-helpers.ts")) {
        callerInfo = line.replace(/^at /, "");
        break;
      }
    }
    
    const fs = require('fs');
    const message = "getBackwardCompatibleInvalidExample: " + directiveType + "." + exampleKey + " - Called from: " + callerInfo + "\\n";
    console.log("Writing to log:", message);
    fs.appendFileSync("${logFilePath}", message);
  } catch (e) {
    console.error("Error logging backward compatibility usage:", e);
  }
  
  const convertedExample = { ...example };
  
  // Convert new syntax with brackets to old format
  if (directiveType === 'import') {
    // Convert @import [path] to @import path
    convertedExample.code = convertedExample.code.replace(/@import \\[(.*?)\\]/g, '@import $1');
  } else if (directiveType === 'run') {
    // Convert @run [command] to @run command
    convertedExample.code = convertedExample.code.replace(/@run \\[(.*?)\\]/g, '@run $1');
  } else if (directiveType === 'embed') {
    // Convert @embed [path] to @embed path
    convertedExample.code = convertedExample.code.replace(/@embed \\[(.*?)\\]/g, '@embed $1');
  } else if (directiveType === 'define') {
    // Convert @define name = @run [command] to @define name = @run command
    convertedExample.code = convertedExample.code.replace(/@run \\[(.*?)\\]/g, '@run $1');
    // Convert @run [$command] to @run $command
    convertedExample.code = convertedExample.code.replace(/@run \\[\\$(.*?)\\]/g, '@run $$1');
    // Convert @run [$command(params)] to @run $command(params)
    convertedExample.code = convertedExample.code.replace(/@run \\[\\$(.*?\\(.*?\\))\\]/g, '@run $$1');
  }
  
  return convertedExample;
}`;

  // Find the start and end indices of each function
  const exampleFunctionStartIndex = modifiedContent.indexOf(exampleFunctionStart);
  const invalidExampleFunctionStartIndex = modifiedContent.indexOf(invalidExampleFunctionStart);
  
  if (exampleFunctionStartIndex === -1) {
    console.error('Could not find getBackwardCompatibleExample function in the file');
  } else {
    // Find the end of the function (the line after the return statement)
    const exampleFunctionSearchStart = exampleFunctionStartIndex + exampleFunctionStart.length;
    const exampleFunctionEndIndex = modifiedContent.indexOf(exampleFunctionEnd, exampleFunctionSearchStart);
    
    if (exampleFunctionEndIndex === -1) {
      console.error('Could not find the end of getBackwardCompatibleExample function');
    } else {
      // Find the end of the function (including the closing brace)
      let closingBraceIndex = modifiedContent.indexOf('}', exampleFunctionEndIndex);
      if (closingBraceIndex === -1) {
        console.error('Could not find closing brace of getBackwardCompatibleExample function');
      } else {
        closingBraceIndex++; // Include the closing brace
        
        // Replace the function with our instrumented version
        modifiedContent = 
          modifiedContent.substring(0, exampleFunctionStartIndex) + 
          instrumentedExampleFunction + 
          modifiedContent.substring(closingBraceIndex);
          
        console.log('Instrumented getBackwardCompatibleExample function');
      }
    }
  }
  
  if (invalidExampleFunctionStartIndex === -1) {
    console.error('Could not find getBackwardCompatibleInvalidExample function in the file');
  } else {
    // Find the end of the function (the line after the return statement)
    const invalidExampleFunctionSearchStart = invalidExampleFunctionStartIndex + invalidExampleFunctionStart.length;
    const invalidExampleFunctionEndIndex = modifiedContent.indexOf(invalidExampleFunctionEnd, invalidExampleFunctionSearchStart);
    
    if (invalidExampleFunctionEndIndex === -1) {
      console.error('Could not find the end of getBackwardCompatibleInvalidExample function');
    } else {
      // Find the end of the function (including the closing brace)
      let closingBraceIndex = modifiedContent.indexOf('}', invalidExampleFunctionEndIndex);
      if (closingBraceIndex === -1) {
        console.error('Could not find closing brace of getBackwardCompatibleInvalidExample function');
      } else {
        closingBraceIndex++; // Include the closing brace
        
        // Replace the function with our instrumented version
        modifiedContent = 
          modifiedContent.substring(0, invalidExampleFunctionStartIndex) + 
          instrumentedInvalidExampleFunction + 
          modifiedContent.substring(closingBraceIndex);
          
        console.log('Instrumented getBackwardCompatibleInvalidExample function');
      }
    }
  }
  
  // Write the instrumented file
  fs.writeFileSync(helperFilePath, modifiedContent);
  console.log(`Modified file length: ${modifiedContent.length} characters`);
  console.log(`Difference in length: ${modifiedContent.length - originalContent.length} characters`);
  
  console.log('Helper functions instrumented successfully.');
}

/**
 * Restores the original helper file from backup
 */
function restoreHelperFunctions() {
  console.log('Restoring original helper functions...');
  
  const backupFilePath = `${helperFilePath}.backup`;
  
  if (fs.existsSync(backupFilePath)) {
    const originalContent = fs.readFileSync(backupFilePath, 'utf8');
    fs.writeFileSync(helperFilePath, originalContent);
    fs.unlinkSync(backupFilePath);
    console.log('Helper functions restored successfully.');
  } else {
    console.error('Backup file not found. Helper functions could not be restored.');
  }
}

/**
 * Runs all tests and captures logs
 */
function runTests() {
  console.log('Running tests...');
  
  try {
    // Run a specific test file that is known to use the backward compatibility functions
    // You can adjust this to run a specific file that's more likely to use these functions
    const testCommand = 'npm test -- api/integration.test.ts';
    console.log(`Executing command: ${testCommand}`);
    
    execSync(testCommand, { stdio: 'inherit' });
    
    console.log('Tests completed.');
  } catch (error) {
    console.error('Error running tests:', error.message);
    // Continue to analysis even if tests fail
  }
}

/**
 * Analyzes the logs and generates a report
 */
function analyzeResults() {
  console.log('\nAnalyzing results...');
  
  if (!fs.existsSync(logFilePath)) {
    console.error('Log file not found. No results to analyze.');
    return;
  }
  
  const logContent = fs.readFileSync(logFilePath, 'utf8');
  const logLines = logContent.split('\n').filter(line => line.trim() !== '' && !line.startsWith('Initializing'));
  
  if (logLines.length === 0) {
    console.log('No usage of backward compatibility functions detected.');
    return;
  }
  
  // Parse log lines and group by example type instead of by file
  const exampleMap = new Map();
  
  logLines.forEach(line => {
    // Parse the line to extract useful information
    const match = line.match(/^(getBackwardCompatibleExample|getBackwardCompatibleInvalidExample): ([^.]+)\.([^.]+)\.?([^ ]*) - Called from: (.+)$/);
    
    if (!match) return;
    
    const [, functionName, directiveType, category, exampleKey, callerInfo] = match;
    
    // Extract file path from caller info
    const fileMatch = callerInfo.match(/\(([^:]+)/);
    let filePath = fileMatch ? fileMatch[1] : 'Unknown file';
    
    // For filenames without path, try to extract from the beginning
    if (filePath === 'Unknown file') {
      const altMatch = callerInfo.match(/([^ ]+):/);
      filePath = altMatch ? altMatch[1] : 'Unknown file';
    }
    
    // Normalize the filePath
    filePath = filePath.replace(process.cwd(), '').replace(/^\//, '');
    
    // Create the example identifier based on function type
    let exampleId;
    if (functionName === 'getBackwardCompatibleExample') {
      exampleId = `${directiveType}.${category}.${exampleKey}`;
    } else {
      exampleId = `${directiveType}.invalid.${exampleKey}`;
    }
    
    // Create or update the entry for this example type
    if (!exampleMap.has(exampleId)) {
      exampleMap.set(exampleId, new Set());
    }
    
    // Add the file to the list of files using this example
    exampleMap.get(exampleId).add(filePath);
  });
  
  // Generate the report
  console.log('\n==== BACKWARD COMPATIBILITY USAGE REPORT ====\n');
  
  let totalExamples = 0;
  let totalFiles = new Set();
  
  // Group examples by directive type for better organization
  const directiveGroups = new Map();
  
  for (const [exampleId, fileSet] of exampleMap.entries()) {
    const directiveType = exampleId.split('.')[0];
    
    if (!directiveGroups.has(directiveType)) {
      directiveGroups.set(directiveType, []);
    }
    
    directiveGroups.get(directiveType).push({
      exampleId,
      files: Array.from(fileSet).sort()
    });
    
    totalExamples++;
    
    // Add files to the total unique files set
    fileSet.forEach(file => totalFiles.add(file));
  }
  
  // Sort directive types alphabetically
  const sortedDirectives = Array.from(directiveGroups.keys()).sort();
  
  for (const directiveType of sortedDirectives) {
    console.log(`\n# ${directiveType.toUpperCase()} DIRECTIVES:`);
    
    // Sort examples within each directive type
    const examples = directiveGroups.get(directiveType).sort((a, b) => 
      a.exampleId.localeCompare(b.exampleId)
    );
    
    for (const { exampleId, files } of examples) {
      console.log(`\n## ${exampleId}`);
      
      for (const file of files) {
        console.log(file);
      }
    }
  }
  
  console.log('\n==== SUMMARY ====');
  console.log(`Total backward compatibility examples used: ${totalExamples}`);
  console.log(`Total files affected: ${totalFiles.size}`);
  console.log('\nDetailed log saved to:', logFilePath);
}

/**
 * Main function
 */
async function main() {
  try {
    // Instrument the helper functions
    instrumentHelperFunctions();
    
    // Run tests and capture logs
    runTests();
    
    // Analyze results
    analyzeResults();
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Always restore the original helper functions
    restoreHelperFunctions();
  }
}

// Execute the main function
main(); 
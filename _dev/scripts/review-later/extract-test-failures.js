#!/usr/bin/env node

/**
 * Script to extract and analyze test failures between meld-ast versions
 * This script parses test output files to identify specific test failures
 * and provide more detailed comparison information
 */

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);

const COMPARISON_DIR = path.join(process.cwd(), 'meld-ast-comparison');

async function run() {
  try {
    console.log('Analyzing test failures...');
    
    // Check if test output files exist
    const v301OutputPath = path.join(COMPARISON_DIR, '3.0.1', 'test-output.log');
    const v330OutputPath = path.join(COMPARISON_DIR, '3.3.0', 'test-output.log');
    
    if (!fs.existsSync(v301OutputPath) || !fs.existsSync(v330OutputPath)) {
      console.error('Test output files not found. Please run the comparison script first.');
      process.exit(1);
    }
    
    // Read test outputs
    const v301Output = await readFileAsync(v301OutputPath, 'utf8');
    const v330Output = await readFileAsync(v330OutputPath, 'utf8');
    
    // Extract test failures
    const v301Failures = extractTestFailures(v301Output);
    const v330Failures = extractTestFailures(v330Output);
    
    // Generate detailed report
    const report = generateDetailedReport(v301Failures, v330Failures);
    
    // Save the report
    await writeFileAsync(path.join(COMPARISON_DIR, 'detailed-failure-analysis.md'), report);
    
    console.log('Detailed failure analysis completed. Check meld-ast-comparison/detailed-failure-analysis.md');
  } catch (error) {
    console.error('Error analyzing test failures:', error);
    process.exit(1);
  }
}

function extractTestFailures(testOutput) {
  const failures = [];
  
  // Split output by test suites
  const testSuites = testOutput.split(/FAIL|PASS/).filter(Boolean);
  
  for (const suiteText of testSuites) {
    // Extract suite name
    const suiteName = suiteText.match(/^\s*(.+?)\s*\n/)?.[1]?.trim();
    if (!suiteName) continue;
    
    // Extract individual test failures
    const failureMatches = suiteText.matchAll(/● (.*?)\n([\s\S]*?)(?=\n● |\n\n|$)/g);
    
    for (const match of failureMatches) {
      const testName = match[1].trim();
      const failureDetails = match[2].trim();
      
      // Extract expected vs received
      const expectedMatch = failureDetails.match(/Expected:([\s\S]*?)(?=\n\s*Received:|$)/);
      const receivedMatch = failureDetails.match(/Received:([\s\S]*?)(?=\n\n|$)/);
      
      const expected = expectedMatch ? expectedMatch[1].trim() : null;
      const received = receivedMatch ? receivedMatch[1].trim() : null;
      
      failures.push({
        suite: suiteName,
        test: testName,
        details: failureDetails,
        expected,
        received
      });
    }
  }
  
  return failures;
}

function generateDetailedReport(v301Failures, v330Failures) {
  let report = `# Detailed Test Failure Analysis\n\n`;
  
  report += `## Summary\n\n`;
  report += `- Version 3.0.1: ${v301Failures.length} test failures\n`;
  report += `- Version 3.3.0: ${v330Failures.length} test failures\n\n`;
  
  // Find tests that fail only in 3.3.0 but pass in 3.0.1
  const newFailuresIn330 = v330Failures.filter(failure330 => 
    !v301Failures.some(failure301 => 
      failure301.suite === failure330.suite && 
      failure301.test === failure330.test
    )
  );
  
  report += `## New Failures in Version 3.3.0\n\n`;
  report += `There are ${newFailuresIn330.length} tests that pass in 3.0.1 but fail in 3.3.0:\n\n`;
  
  // Group failures by test suite
  const failuresByTestSuite = {};
  for (const failure of newFailuresIn330) {
    if (!failuresByTestSuite[failure.suite]) {
      failuresByTestSuite[failure.suite] = [];
    }
    failuresByTestSuite[failure.suite].push(failure);
  }
  
  // Add detailed failure information by test suite
  for (const suite in failuresByTestSuite) {
    report += `### Suite: ${suite}\n\n`;
    
    for (const failure of failuresByTestSuite[suite]) {
      report += `#### Test: ${failure.test}\n\n`;
      
      if (failure.expected && failure.received) {
        report += "**Expected:**\n```\n" + failure.expected + "\n```\n\n";
        report += "**Received:**\n```\n" + failure.received + "\n```\n\n";
        
        // Try to analyze the specific differences
        const analysis = analyzeFailureDifference(failure.expected, failure.received);
        if (analysis) {
          report += "**Analysis:**\n" + analysis + "\n\n";
        }
      } else {
        report += "**Failure Details:**\n```\n" + failure.details + "\n```\n\n";
      }
      
      report += "---\n\n";
    }
  }
  
  report += `## Common Patterns in Failures\n\n`;
  
  // Analyze common patterns in failures
  const patterns = analyzeCommonPatterns(newFailuresIn330);
  
  for (const pattern of patterns) {
    report += `### ${pattern.name}\n\n`;
    report += pattern.description + "\n\n";
    
    if (pattern.examples && pattern.examples.length > 0) {
      report += "**Examples:**\n\n";
      for (const example of pattern.examples) {
        report += `- ${example}\n`;
      }
      report += "\n";
    }
  }
  
  return report;
}

function analyzeFailureDifference(expected, received) {
  if (!expected || !received) return null;
  
  let analysis = "";
  
  // Check for array notation changes (brackets vs dot notation)
  if (expected.includes('[') && received.includes('.')) {
    analysis += "• Array notation has changed from bracket notation `[index]` to dot notation `.index`.\n";
  }
  
  // Check for structural changes in the AST
  if ((expected.includes('"type":') || received.includes('"type":')) && 
      (expected.includes('"value":') || received.includes('"value":'))) {
    
    try {
      // Try to parse as JSON if it looks like JSON
      const cleanExpected = expected.replace(/'/g, '"').replace(/(\w+):/g, '"$1":');
      const cleanReceived = received.replace(/'/g, '"').replace(/(\w+):/g, '"$1":');
      
      let expectedObj, receivedObj;
      
      try { expectedObj = JSON.parse(cleanExpected); } catch (e) { /* ignore */ }
      try { receivedObj = JSON.parse(cleanReceived); } catch (e) { /* ignore */ }
      
      if (expectedObj && receivedObj) {
        // Check for type changes
        if (expectedObj.type !== receivedObj.type) {
          analysis += `• Node type has changed from '${expectedObj.type}' to '${receivedObj.type}'.\n`;
        }
        
        // Check for added/removed properties
        const expectedKeys = Object.keys(expectedObj);
        const receivedKeys = Object.keys(receivedObj);
        
        const newKeys = receivedKeys.filter(k => !expectedKeys.includes(k));
        const removedKeys = expectedKeys.filter(k => !receivedKeys.includes(k));
        
        if (newKeys.length > 0) {
          analysis += `• New properties in 3.3.0: ${newKeys.join(', ')}.\n`;
        }
        
        if (removedKeys.length > 0) {
          analysis += `• Properties removed in 3.3.0: ${removedKeys.join(', ')}.\n`;
        }
      }
    } catch (error) {
      // If JSON parsing fails, just continue
    }
  }
  
  // Check for string escaping differences
  if (expected.includes('\\') !== received.includes('\\')) {
    analysis += "• String escaping behavior may have changed.\n";
  }
  
  return analysis || "No specific pattern identified in this difference.";
}

function analyzeCommonPatterns(failures) {
  const patterns = [];
  
  // Check for array notation changes
  const arrayNotationFailures = failures.filter(f => 
    (f.expected && f.expected.includes('[') && f.received && f.received.includes('.')) ||
    (f.details && f.details.includes('[') && f.details.includes('.'))
  );
  
  if (arrayNotationFailures.length > 0) {
    patterns.push({
      name: "Array Notation Change",
      description: `${arrayNotationFailures.length} failures appear to be related to a change in array notation, from bracket notation [index] to dot notation .index.`,
      examples: arrayNotationFailures.slice(0, 3).map(f => f.test)
    });
  }
  
  // Check for AST structure changes
  const structureFailures = failures.filter(f => 
    (f.expected && f.received && 
     ((f.expected.includes('"type":') && f.received.includes('"type":')) ||
      (f.expected.includes('"value":') && f.received.includes('"value":'))))
  );
  
  if (structureFailures.length > 0) {
    patterns.push({
      name: "AST Structure Changes",
      description: `${structureFailures.length} failures appear to be related to changes in the AST structure, possibly affecting node types or properties.`,
      examples: structureFailures.slice(0, 3).map(f => f.test)
    });
  }
  
  return patterns;
}

// Run the script
run().catch(console.error); 
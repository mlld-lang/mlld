#!/usr/bin/env node
const path = require('path');

/**
 * This script helps diagnose path format issues in a simpler way
 */

// Simple path variable structure
const makePath = (pathString) => {
  let structured;
  
  // Handle $PROJECTPATH
  if (pathString.startsWith('$PROJECTPATH/')) {
    const segments = pathString.substring(13).split('/').filter(Boolean);
    structured = {
      segments,
      variables: {
        special: ['PROJECTPATH'],
        path: []
      }
    };
  }
  // Handle $.
  else if (pathString.startsWith('$./')) {
    const segments = pathString.substring(3).split('/').filter(Boolean);
    structured = {
      segments,
      variables: {
        special: ['PROJECTPATH'],
        path: []
      }
    };
  }
  // Handle $HOMEPATH
  else if (pathString.startsWith('$HOMEPATH/')) {
    const segments = pathString.substring(10).split('/').filter(Boolean);
    structured = {
      segments,
      variables: {
        special: ['HOMEPATH'],
        path: []
      }
    };
  }
  // Handle $~
  else if (pathString.startsWith('$~/')) {
    const segments = pathString.substring(3).split('/').filter(Boolean);
    structured = {
      segments,
      variables: {
        special: ['HOMEPATH'],
        path: []
      }
    };
  }
  // Handle simple path (no slashes)
  else if (!pathString.includes('/')) {
    structured = {
      segments: [pathString],
      cwd: true
    };
  }
  // Invalid path format
  else {
    throw new Error(`Invalid path format: ${pathString}`);
  }
  
  return {
    raw: pathString,
    structured
  };
};

// Extract segments and special variable names
const analyzePath = (pathObj) => {
  const { raw, structured } = pathObj;
  
  console.log(`\nAnalyzing path: "${raw}"`);
  console.log('-------------------');
  console.log('Segments:', structured.segments);
  
  if (structured.variables?.special) {
    console.log('Special variables:', structured.variables.special);
  } else {
    console.log('Special variables: None');
  }
  
  if (structured.cwd) {
    console.log('Current directory: true');
  }
  
  return structured;
};

// Test paths
const testPaths = [
  '$PROJECTPATH/my/docs',
  '$./my/docs',
  '$HOMEPATH/my/docs',
  '$~/my/docs',
  'simple-file.txt'
];

// Test them all
console.log('===== PATH FORMAT TESTS =====');
testPaths.forEach(pathStr => {
  try {
    const pathObj = makePath(pathStr);
    analyzePath(pathObj);
    console.log('✅ Valid path format');
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  }
});

// Test building the directive syntax
console.log('\n===== PATH DIRECTIVE TESTS =====');
testPaths.forEach(pathStr => {
  try {
    const directiveStr = `@path mypath = "${pathStr}"`;
    console.log(`\nDirective: ${directiveStr}`);
    
    // Parse the directive manually
    const match = directiveStr.match(/@path\s+(\w+)\s+=\s+"([^"]+)"/);
    if (!match) {
      throw new Error('Invalid directive syntax');
    }
    
    const [_, identifier, value] = match;
    console.log('Identifier:', identifier);
    console.log('Value:', value);
    
    // Create structured path
    const pathObj = makePath(value);
    analyzePath(pathObj);
    console.log('✅ Valid directive');
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  }
});

// Print paths with slashes but no variable
console.log('\n===== INVALID PATH TESTS =====');
['dir/file.txt', '/absolute/path', '../parent/file'].forEach(badPath => {
  console.log(`\nTesting invalid path: "${badPath}"`);
  try {
    makePath(badPath);
    console.log('❌ Should have failed but didn\'t');
  } catch (error) {
    console.log('✅ Correctly rejected:', error.message);
  }
});

console.log('\nPath testing complete!'); 
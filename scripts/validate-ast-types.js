#!/usr/bin/env node
/**
 * AST Type Validation Script
 * 
 * This script validates the output of the AST Explorer against our expected type structure.
 * It ensures we have the proper consolidated types rather than individual instance files.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory where this script is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const DEFAULT_TYPES_DIR = path.resolve(__dirname, '../core/ast/types');

// Define the expected type structure
const EXPECTED_TYPES = {
  // Base node types
  baseNode: {
    unionTypes: ['BaseNode'],
    subtypes: ['CommentNode', 'CodeFenceNode', 'TextBlockNode', 'NewlineNode']
  },
  
  // Variable nodes
  variable: {
    unionTypes: ['BaseVariableNode'],
    subtypes: ['VariableReferenceNode', 'VariableInterpolationNode']
  },
  
  // Directive nodes
  directive: {
    unionTypes: ['BaseDirectiveNode', 'DirectiveNodeUnion'],
    subtypes: []
  },
  
  // Text directives
  text: {
    unionTypes: ['TextDirectiveNode'],
    subtypes: ['TextAssignmentDirectiveNode', 'TextTemplateDirectiveNode']
  },
  
  // Run directives
  run: {
    unionTypes: ['RunDirectiveNode'],
    subtypes: ['RunCommandDirectiveNode', 'RunCodeDirectiveNode', 'RunExecDirectiveNode']
  },
  
  // Import directives
  import: {
    unionTypes: ['ImportDirectiveNode'],
    subtypes: ['ImportSelectedDirectiveNode', 'ImportAllDirectiveNode']
  },
  
  // Add directives
  add: {
    unionTypes: ['AddDirectiveNode'],
    subtypes: ['AddTemplateDirectiveNode', 'AddVariableDirectiveNode', 'AddPathDirectiveNode']
  },
  
  // Exec directives
  exec: {
    unionTypes: ['ExecDirectiveNode'],
    subtypes: ['ExecCommandDirectiveNode', 'ExecCodeDirectiveNode']
  },
  
  // Data directives
  data: {
    unionTypes: ['DataDirectiveNode'],
    subtypes: []
  },
  
  // Path directives
  path: {
    unionTypes: ['PathDirectiveNode'],
    subtypes: ['PathAssignmentDirectiveNode']
  }
};

// Helper function to check if a file matches an expected type name pattern
function matchesExpectedType(filename, typeNames) {
  // Remove .ts extension and convert to lowercase for comparison
  const basename = path.basename(filename, '.ts').toLowerCase();
  
  return typeNames.some(typeName => {
    // Convert the type name to kebab-case for comparison
    const kebabTypeName = typeName
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .toLowerCase()
      .replace(/directive-?node$/i, ''); // Remove DirectiveNode suffix
      
    return basename === kebabTypeName || 
           basename.startsWith(kebabTypeName + '-');
  });
}

// Parse the content of a file to check for expected type definitions
function hasTypeDefinition(filePath, expectedTypes) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Check for expected interface or type definitions
    return expectedTypes.some(typeName => {
      return (
        content.includes(`interface ${typeName}`) || 
        content.includes(`type ${typeName}`)
      );
    });
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error.message);
    return false;
  }
}

// Main validation function
function validateAstTypes(typesDir = DEFAULT_TYPES_DIR) {
  console.log(`Validating AST types in ${typesDir}...`);
  
  const issues = [];
  const warnings = [];
  
  // Check if the directory exists
  if (!fs.existsSync(typesDir)) {
    console.error(`❌ Types directory not found: ${typesDir}`);
    process.exit(1);
  }
  
  // Get all TypeScript files in the directory
  const files = fs.readdirSync(typesDir)
    .filter(file => file.endsWith('.ts'))
    .map(file => ({
      path: path.join(typesDir, file),
      name: file
    }));
    
  console.log(`Found ${files.length} type files`);
  
  // Check for expected union types
  const expectedUnionTypes = Object.values(EXPECTED_TYPES)
    .flatMap(category => category.unionTypes);
    
  const expectedSubtypes = Object.values(EXPECTED_TYPES)
    .flatMap(category => category.subtypes);
    
  // Track which expected types we've found
  const foundUnionTypes = [];
  const foundSubtypes = [];
  
  // Check each file
  for (const file of files) {
    const { name, path: filePath } = file;
    
    // Check for numbered directive types (which should be consolidated)
    const hasNumberedSuffix = /.*-\d+\.ts$/.test(name);
    if (hasNumberedSuffix) {
      warnings.push(`⚠️ Found numbered type file: ${name} - This should be consolidated`);
    }
    
    // Check if the file matches any expected type
    let matchedUnion = false;
    let matchedSubtype = false;
    
    // Check union types
    if (matchesExpectedType(name, expectedUnionTypes)) {
      // Check the file content for the actual type definition
      if (hasTypeDefinition(filePath, expectedUnionTypes)) {
        const matchedType = expectedUnionTypes.find(type => 
          hasTypeDefinition(filePath, [type])
        );
        
        if (matchedType) {
          foundUnionTypes.push(matchedType);
          matchedUnion = true;
        }
      }
    }
    
    // Check subtype interfaces
    if (matchesExpectedType(name, expectedSubtypes)) {
      // Check the file content for the actual interface definition
      if (hasTypeDefinition(filePath, expectedSubtypes)) {
        const matchedType = expectedSubtypes.find(type => 
          hasTypeDefinition(filePath, [type])
        );
        
        if (matchedType) {
          foundSubtypes.push(matchedType);
          matchedSubtype = true;
        }
      }
    }
    
    // If the file doesn't match any expected type
    if (!matchedUnion && !matchedSubtype && name !== 'index.ts') {
      issues.push(`❌ Unexpected type file: ${name}`);
    }
  }
  
  // Check for missing union types
  const missingUnionTypes = expectedUnionTypes.filter(type => !foundUnionTypes.includes(type));
  for (const typeName of missingUnionTypes) {
    issues.push(`❌ Missing union type: ${typeName}`);
  }
  
  // Check for missing subtypes
  const missingSubtypes = expectedSubtypes.filter(type => !foundSubtypes.includes(type));
  for (const typeName of missingSubtypes) {
    warnings.push(`⚠️ Missing subtype: ${typeName}`);
  }
  
  // Display results
  if (issues.length === 0 && warnings.length === 0) {
    console.log('✅ All AST types are valid!');
    return true;
  }
  
  // Show issues
  if (issues.length > 0) {
    console.log('\nIssues:');
    issues.forEach(issue => console.log(issue));
  }
  
  // Show warnings
  if (warnings.length > 0) {
    console.log('\nWarnings:');
    warnings.forEach(warning => console.log(warning));
  }
  
  // Print summary
  console.log(`\nSummary: ${issues.length} issues, ${warnings.length} warnings`);
  console.log('✨ Suggestion: Run "npm run ast:process-all" to regenerate types');
  
  return issues.length === 0; // Return true if no critical issues
}

// Parse command-line arguments
const args = process.argv.slice(2);
const typesDir = args.length > 0 ? args[0] : DEFAULT_TYPES_DIR;

// Run the validation
const success = validateAstTypes(typesDir);

// Exit with appropriate code
process.exit(success ? 0 : 1);
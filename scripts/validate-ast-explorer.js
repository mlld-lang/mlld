#!/usr/bin/env node
/**
 * AST Explorer Type Validation Script
 *
 * This script validates that the AST Explorer is generating type files
 * with the expected structure and includes all required discriminated unions.
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
const EXPECTED_STRUCTURE = {
  // Base types that should be present
  baseTypes: [
    'BaseNode',
    'BaseDirectiveNode', 
    'BaseVariableNode',
    'VariableReferenceNode',
    'TextBlockNode'
  ],
  
  // Expected directive kinds and their discriminated union types
  directiveKinds: [
    'text',
    'run',
    'import',
    'embed',
    'define',
    'path',
    'data'
  ],
  
  // Expected directive subtypes for each kind
  directiveSubtypes: {
    text: ['Assignment', 'Template'],
    run: ['Command', 'Code', 'Exec'],
    import: ['Selected', 'All'],
    embed: ['Content'],
    define: ['Handler'],
    path: ['Assignment'],
    data: []
  },
  
  // Required union files that must exist
  requiredUnionFiles: ['directives.ts', 'index.ts']
};

/**
 * Check if a file contains a specific type definition or interface
 */
function hasTypeDefinition(filePath, type) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Check for interface or type definition
    return (
      content.includes(`interface ${type}`) || 
      content.includes(`type ${type}`) ||
      // Also check for export statements that include the type
      content.includes(`export { ${type} }`) ||
      content.includes(`export type ${type}`)
    );
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error.message);
    return false;
  }
}

/**
 * Check if a file contains a proper discriminated union
 */
function hasDiscriminatedUnion(filePath, kindName, subtypes) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // The union type name pattern
    const unionTypeName = `${capitalize(kindName)}DirectiveNode`;
    
    // Check if the file contains a union type definition
    if (!content.includes(`export type ${unionTypeName}`)) {
      return false;
    }
    
    // Check if all subtypes are included in the union
    for (const subtype of subtypes) {
      const subtypeName = `${capitalize(kindName)}${capitalize(subtype)}DirectiveNode`;
      if (!content.includes(`| ${subtypeName}`)) {
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error(`Error checking union in ${filePath}:`, error.message);
    return false;
  }
}

/**
 * Check if a file exports all expected types
 */
function exportsAllTypes(filePath, expectedExports) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    for (const typeName of expectedExports) {
      // Check for direct export or re-export
      if (!content.includes(`export * from './${typeName}'`) &&
          !content.includes(`export { ${typeName} }`) &&
          !content.includes(`export type ${typeName}`)) {
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error(`Error checking exports in ${filePath}:`, error.message);
    return false;
  }
}

/**
 * Check if a discriminated union type has the right structure
 */
function validateDiscriminatorField(filePath, discriminatorField = 'kind') {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Find interface definitions
    const interfaceMatches = content.match(/interface\s+(\w+)\s+(\{[\s\S]*?\})/g);
    if (!interfaceMatches) return true; // Skip if no interfaces
    
    // Check each interface definition
    for (const interfaceMatch of interfaceMatches) {
      // Check if it has the discriminator field
      if (!interfaceMatch.includes(`${discriminatorField}:`)) {
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error(`Error validating discriminator field in ${filePath}:`, error.message);
    return false;
  }
}

/**
 * Helper function to capitalize a string
 */
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Validate the structure of the AST Explorer output
 */
function validateAstExplorer(typesDir = DEFAULT_TYPES_DIR) {
  console.log(`Validating AST Explorer types in ${typesDir}...`);
  
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
  
  // Check for base types
  for (const baseType of EXPECTED_STRUCTURE.baseTypes) {
    // Look for the base type in all files
    let found = false;
    for (const file of files) {
      if (hasTypeDefinition(file.path, baseType)) {
        found = true;
        break;
      }
    }
    
    if (!found) {
      issues.push(`❌ Missing base type: ${baseType}`);
    }
  }
  
  // Check for directive kind union files
  for (const kind of EXPECTED_STRUCTURE.directiveKinds) {
    const unionFileName = `${kind}.ts`;
    const unionFilePath = path.join(typesDir, unionFileName);
    
    if (!fs.existsSync(unionFilePath)) {
      issues.push(`❌ Missing directive kind union file: ${unionFileName}`);
      continue;
    }
    
    // Check if the union file contains all expected subtypes
    const subtypes = EXPECTED_STRUCTURE.directiveSubtypes[kind] || [];
    if (!hasDiscriminatedUnion(unionFilePath, kind, subtypes)) {
      issues.push(`❌ Incorrect discriminated union in ${unionFileName}`);
    }
  }
  
  // Check for directive subtype files
  for (const [kind, subtypes] of Object.entries(EXPECTED_STRUCTURE.directiveSubtypes)) {
    for (const subtype of subtypes) {
      // Convert to file naming convention (kebab-case)
      const fileName = `${kind}-${subtype.toLowerCase()}.ts`;
      const filePath = path.join(typesDir, fileName);
      
      if (!fs.existsSync(filePath)) {
        warnings.push(`⚠️ Missing directive subtype file: ${fileName}`);
        continue;
      }
      
      // Check if the file has the right interface
      const typeName = `${capitalize(kind)}${capitalize(subtype)}DirectiveNode`;
      if (!hasTypeDefinition(filePath, typeName)) {
        issues.push(`❌ Missing interface for ${typeName} in ${fileName}`);
      }
      
      // Check discriminator field
      if (!validateDiscriminatorField(filePath)) {
        issues.push(`❌ Missing discriminator field in ${fileName}`);
      }
    }
  }
  
  // Check for main directive union file
  const directivesFilePath = path.join(typesDir, 'directives.ts');
  if (!fs.existsSync(directivesFilePath)) {
    issues.push('❌ Missing main directives.ts union file');
  } else {
    // Check if it includes all directive kinds
    for (const kind of EXPECTED_STRUCTURE.directiveKinds) {
      const unionTypeName = `${capitalize(kind)}DirectiveNode`;
      if (!hasTypeDefinition(directivesFilePath, unionTypeName)) {
        issues.push(`❌ directives.ts is missing import or reference to ${unionTypeName}`);
      }
    }
    
    // Check if it defines the main union type
    if (!hasTypeDefinition(directivesFilePath, 'DirectiveNodeUnion')) {
      issues.push('❌ directives.ts is missing the DirectiveNodeUnion type');
    }
  }
  
  // Check for index.ts exports
  const indexFilePath = path.join(typesDir, 'index.ts');
  if (!fs.existsSync(indexFilePath)) {
    issues.push('❌ Missing index.ts file');
  } else {
    // Check if it exports all directive kinds
    for (const kind of EXPECTED_STRUCTURE.directiveKinds) {
      if (!exportsAllTypes(indexFilePath, [kind])) {
        issues.push(`❌ index.ts is missing export for ${kind}`);
      }
    }
    
    // Check if it exports the main directive union
    if (!exportsAllTypes(indexFilePath, ['directives'])) {
      issues.push('❌ index.ts is missing export for directives');
    }
  }
  
  // Display results
  if (issues.length === 0 && warnings.length === 0) {
    console.log('✅ All enhanced AST Explorer types are valid!');
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
  
  // Suggest remediation
  console.log('\nSuggested remediation:');
  console.log('1. Run "npm run ast:process-all" to regenerate all types');
  console.log('2. Check if all examples directories contain required directive types');
  console.log('3. Fix any type definition files that have incorrect structure');

  return issues.length === 0; // Return true if no critical issues
}

// Parse command-line arguments
const args = process.argv.slice(2);
const typesDir = args.length > 0 ? args[0] : DEFAULT_TYPES_DIR;

// Run the validation
const success = validateAstExplorer(typesDir);

// Exit with appropriate code
process.exit(success ? 0 : 1);
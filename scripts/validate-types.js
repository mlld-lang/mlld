#!/usr/bin/env node
/**
 * Script to validate AST type generation output
 *
 * This script checks that the AST type generation has produced
 * properly structured types with correct discriminated unions.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const config = {
  outputDir: './core/ast',
  baseDir: './core/examples',
  requiredBaseTypes: ['base-node.ts', 'base-directive.ts', 'base-variable.ts'],
  requiredUnionFiles: ['directives.ts'],
  directiveKinds: []
};

/**
 * Main validation function
 */
function validateTypes() {
  console.log('Validating AST type generation output...');

  // Check if output directory exists
  if (!fs.existsSync(config.outputDir)) {
    console.error(`❌ Output directory not found: ${config.outputDir}`);
    console.log('Run npm run ast:process-all to generate types');
    process.exit(1);
  }

  // Get directive kinds by scanning the base directory
  if (fs.existsSync(config.baseDir)) {
    config.directiveKinds = fs.readdirSync(config.baseDir)
      .filter(name => fs.statSync(path.join(config.baseDir, name)).isDirectory());
  }
  
  // If we found directive kinds, add them to required union files
  if (config.directiveKinds.length > 0) {
    console.log(`Found directive kinds: ${config.directiveKinds.join(', ')}`);
    config.directiveKinds.forEach(kind => {
      config.requiredUnionFiles.push(`${kind}.ts`);
    });
  }
  
  // Check for required base types
  const missingBaseTypes = config.requiredBaseTypes.filter(
    file => !fs.existsSync(path.join(config.outputDir, 'types', file))
  );

  if (missingBaseTypes.length > 0) {
    console.error(`❌ Missing base type files: ${missingBaseTypes.join(', ')}`);
    console.log('Type generation may have failed or is incomplete');
    process.exit(1);
  }

  // Check for required union files
  const missingUnionFiles = config.requiredUnionFiles.filter(
    file => !fs.existsSync(path.join(config.outputDir, 'types', file))
  );
  
  if (missingUnionFiles.length > 0) {
    console.error(`❌ Missing union type files: ${missingUnionFiles.join(', ')}`);
    console.log('Union type generation may have failed');
    process.exit(1);
  }
  
  // Validate directive.ts content
  try {
    const directivesContent = fs.readFileSync(
      path.join(config.outputDir, 'types', 'directives.ts'),
      'utf8'
    );
    
    // Check that each directive kind is in the union
    const missingInUnion = config.directiveKinds.filter(kind => {
      const capitalizedKind = kind.charAt(0).toUpperCase() + kind.slice(1);
      return !directivesContent.includes(`| ${capitalizedKind}DirectiveNode`);
    });
    
    if (missingInUnion.length > 0) {
      console.error(`❌ Directive kinds missing from main union: ${missingInUnion.join(', ')}`);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error validating directives.ts:', error.message);
    process.exit(1);
  }
  
  // Validate index.ts exports
  try {
    const indexContent = fs.readFileSync(
      path.join(config.outputDir, 'types', 'index.ts'),
      'utf8'
    );
    
    // Check that index exports base types
    const missingBaseExports = config.requiredBaseTypes.filter(file => {
      const moduleName = file.replace('.ts', '');
      return !indexContent.includes(`from './${moduleName}`);
    });
    
    if (missingBaseExports.length > 0) {
      console.error(`❌ Base types not exported in index.ts: ${missingBaseExports.join(', ')}`);
      process.exit(1);
    }
    
    // Check that index exports union types
    const missingUnionExports = config.requiredUnionFiles.filter(file => {
      const moduleName = file.replace('.ts', '');
      return !indexContent.includes(`from './${moduleName}`);
    });
    
    if (missingUnionExports.length > 0) {
      console.error(`❌ Union types not exported in index.ts: ${missingUnionExports.join(', ')}`);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error validating index.ts:', error.message);
    process.exit(1);
  }
  
  console.log('✅ Type generation validation completed successfully!');
}

// Run validation if called directly
if (require.main === module) {
  validateTypes();
}

module.exports = { validateTypes };
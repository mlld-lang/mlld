import { parse } from 'meld-ast';
import * as fs from 'fs';

// Async function to run path diagnostics
async function runPathDiagnostics() {
  // Test with samples of different path formats
  const pathSamples = {
    // Simple path (no slashes)
    simplePath: '@path file = "file.meld"',
    
    // Project-relative paths
    projectPathStandard: '@path docs = "$PROJECTPATH/docs"',
    projectPathShorthand: '@path config = "$./config"',
    
    // Home-relative paths
    homePathStandard: '@path home = "$HOMEPATH/meld"',
    homePathShorthand: '@path data = "$~/data"',
    
    // Special path variables used alone
    projectPathRoot: '@path root = "$PROJECTPATH"',
    projectPathDotRoot: '@path root = "$./"',
    homePathRoot: '@path homedir = "$HOMEPATH"',
    homePathTildeRoot: '@path homedir = "$~"',
    
    // Problematic path formats
    rawAbsolutePath: '@path bad = "/absolute/path"',
    traversalPath: '@path bad = "../path/with/dot"',
    dotSegmentPath: '@path bad = "./relative/path"',
    
    // Path in a directive
    embedWithPath: '@embed ["$./templates/header.md"]',
    importWithPath: '@import ["$PROJECTPATH/other.meld"]'
  };

  // Options for the parser
  const options = {
    trackLocations: true,
    validateNodes: true,
    structuredPaths: true
  };

  console.log('\n\n========= PATH AST ANALYSIS =========\n');
  for (const [type, sample] of Object.entries(pathSamples)) {
    console.log(`\n===== ${type.toUpperCase()} =====`);
    console.log(`Sample: ${sample}`);
    try {
      const result = await parse(sample, options);
      
      // Look for path-related nodes
      const pathNode = result.ast.find(node => 
        node.type === 'PathVar' || 
        (node.type === 'Directive' && node.directive && 
         (node.directive.kind === 'path' || node.directive.kind === 'embed' || node.directive.kind === 'import'))
      );
      
      if (pathNode) {
        console.log('Path Node Found:');
        console.log(JSON.stringify(pathNode, null, 2));
        
        // Extract structured path if available
        if (pathNode.type === 'Directive' && pathNode.directive.kind === 'path') {
          const pathValue = pathNode.directive.value || (pathNode.directive.path && pathNode.directive.path.raw);
          console.log(`\nPath Value: ${pathValue}`);
          
          // If there's a structured path representation
          if (pathNode.directive.path && pathNode.directive.path.structured) {
            console.log('\nStructured Path:');
            console.log(JSON.stringify(pathNode.directive.path.structured, null, 2));
          }
        } else if (pathNode.type === 'PathVar') {
          console.log('\nPath Variable:');
          console.log(JSON.stringify(pathNode.value, null, 2));
        }
      } else {
        console.log('No path-related node found in AST');
        // Print the full AST for debugging
        console.log('Full AST:');
        console.log(JSON.stringify(result.ast, null, 2));
      }
    } catch (error) {
      console.error(`Error parsing ${type}:`, error.message);
      if (error.stack) {
        console.error(error.stack);
      }
    }
    console.log('\n' + '-'.repeat(50) + '\n');
  }

  // Save results to file for analysis
  const outputFile = '_issues/path-ast-diagnostics-results.json';
  console.log(`\nRunning full AST parse on all samples and saving to ${outputFile}...`);
  
  const fullResults = {};
  for (const [type, sample] of Object.entries(pathSamples)) {
    try {
      const result = await parse(sample, options);
      fullResults[type] = result.ast;
    } catch (error) {
      fullResults[type] = { error: error.message };
    }
  }
  
  fs.writeFileSync(outputFile, JSON.stringify(fullResults, null, 2));
  console.log(`Results saved to ${outputFile}`);
}

// Run the async function
runPathDiagnostics().catch(error => {
  console.error('Unhandled error:', error);
}); 
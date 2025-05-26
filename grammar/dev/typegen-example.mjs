#!/usr/bin/env node

/**
 * This script is a prototype for testing how peggy-to-ts type generation could work
 * with our Mlld grammar files.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Clone peggy-to-ts if not already present
const REPO_URL = 'https://github.com/siefkenj/peggy-to-ts.git';
const REPO_DIR = path.resolve(process.cwd(), 'peggy-to-ts-repo');

// Paths to Mlld grammar files
const MLLD_DIR = path.resolve(process.cwd(), '..'); 
const GRAMMAR_DIR = path.resolve(MLLD_DIR, 'directives');
const TEXT_GRAMMAR = path.resolve(GRAMMAR_DIR, 'text.peggy');

function cloneRepo() {
  if (!fs.existsSync(REPO_DIR)) {
    console.log('Cloning peggy-to-ts repository...');
    execSync(`git clone ${REPO_URL} ${REPO_DIR}`, { stdio: 'inherit' });
  }
}

function readGrammarFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    console.error(`Error reading grammar file ${filePath}:`, error);
    return null;
  }
}

/**
 * Using a manual approach until we can integrate peggy-to-ts properly.
 * This function uses knowledge of the peggy grammar structure to
 * extract rule names and basic patterns.
 */
function manualExtractRules(grammarContent) {
  const rules = {};
  const ruleLines = grammarContent.split('\n');
  
  let currentRule = null;
  let inRule = false;
  
  for (const line of ruleLines) {
    // Simple rule detection - looks for lines like "RuleName =" 
    const ruleMatch = line.match(/^([A-Za-z][A-Za-z0-9_]*)\s*=\s*(.*)/);
    
    if (ruleMatch) {
      currentRule = ruleMatch[1];
      inRule = true;
      rules[currentRule] = {
        name: currentRule,
        content: ruleMatch[2],
        actions: []
      };
    } 
    else if (inRule && line.includes('return') && line.includes('{')) {
      // Very basic action detection
      const actionMatch = line.match(/\{\s*.*return\s+(.*?);?\s*\}/);
      if (actionMatch && rules[currentRule]) {
        rules[currentRule].actions.push(actionMatch[1].trim());
      }
    }
  }
  
  return rules;
}

/**
 * Generate a simple TypeScript interface based on extracted rules
 */
function generateSimpleTypes(rules) {
  let tsContent = '';
  
  // Add imports
  tsContent += '// Auto-generated types from peggy grammar\n';
  tsContent += 'import { DirectiveNode, TypedDirectiveNode } from \'./base\';\n';
  tsContent += 'import { ContentNodeArray, VariableNodeArray } from \'./values\';\n\n';
  
  // Generate interfaces for each rule
  Object.values(rules).forEach(rule => {
    // Convert rule name to PascalCase interface name
    const interfaceName = rule.name.charAt(0).toUpperCase() + rule.name.slice(1) + 'Node';
    
    tsContent += `/**\n * ${rule.name} rule\n */\n`;
    tsContent += `export interface ${interfaceName} {\n`;
    tsContent += '  kind: string;\n';
    
    // Add additional properties based on action returns if they exist
    if (rule.actions.length > 0) {
      tsContent += '  values: {\n';
      
      // This is extremely simplistic and would need to be enhanced
      rule.actions.forEach(action => {
        if (action.includes('identifier')) {
          tsContent += '    identifier: VariableNodeArray;\n';
        }
        if (action.includes('content')) {
          tsContent += '    content: ContentNodeArray;\n';
        }
      });
      
      tsContent += '  };\n';
    }
    
    tsContent += '}\n\n';
  });
  
  return tsContent;
}

function main() {
  try {
    // Clone the repository if needed
    cloneRepo();
    
    // Read a grammar file
    console.log(`Reading grammar file: ${TEXT_GRAMMAR}`);
    const grammarContent = readGrammarFile(TEXT_GRAMMAR);
    
    if (!grammarContent) {
      console.error('Failed to read grammar content. Exiting.');
      process.exit(1);
    }
    
    // Extract rules and generate types
    console.log('Extracting rules...');
    const rules = manualExtractRules(grammarContent);
    console.log(`Extracted ${Object.keys(rules).length} rules.`);
    
    // Generate types
    const types = generateSimpleTypes(rules);
    
    // Output to a file
    const outputPath = path.resolve(process.cwd(), 'generated-text-types.ts');
    fs.writeFileSync(outputPath, types);
    console.log(`Generated types written to: ${outputPath}`);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
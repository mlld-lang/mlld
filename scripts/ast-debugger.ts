/**
 * AST Debugger
 * 
 * This utility script parses Meld content and displays the AST structure
 * for debugging parser/validator mismatches.
 * 
 * Usage:
 * npx ts-node scripts/ast-debugger.ts <directive-type>
 * 
 * Examples:
 * npx ts-node scripts/ast-debugger.ts path
 * npx ts-node scripts/ast-debugger.ts import
 * npx ts-node scripts/ast-debugger.ts define
 * npx ts-node scripts/ast-debugger.ts embed
 * npx ts-node scripts/ast-debugger.ts textvar
 * npx ts-node scripts/ast-debugger.ts codefence
 * npx ts-node scripts/ast-debugger.ts custom "your custom meld content here"
 */

import { ParserService } from '../services/pipeline/ParserService/ParserService';
import type { MeldNode, DirectiveNode, CodeFenceNode, TextNode } from 'meld-spec';

interface TextVarNode extends MeldNode {
  type: 'TextVar';
  content?: string;
  reference?: string;
}

// Sample Meld content for different directive types
const samples = {
  path: `
@path docs = "$PROJECTPATH/docs"
@path home = "$HOMEPATH/meld"
@path tmp = "$~/tmp"
@path custom = "/custom/path"

Reference: \${docs}/README.md
`,

  import: `
@import [imported.meld]
@import "$PROJECTPATH/samples/nested.meld"
@import "$~/examples/basic.meld"
`,

  define: `
@define hello = "echo 'Hello, World!'"
@define greet(name) = "echo 'Hello, $name!'"
@define complex = { "command": "find", "args": ["-name", "*.js"] }

@run hello
@run greet("User")
`,

  embed: `
@embed [file.txt]
@embed "$PROJECTPATH/README.md"
@embed "$PROJECTPATH/README.md#section"
`,

  textvar: `
@text greeting = "Hello"
@text name = "World"

\${greeting}, \${name}!
`,

  codefence: `
Here's some code:

\`\`\`javascript
function hello() {
  return "Hello, World!";
}
\`\`\`

And here's some nested code:

\`\`\`markdown
## Example

\`\`\`javascript
console.log("Nested!");
\`\`\`
\`\`\`
`
};

async function debugAST(type: string, customContent?: string) {
  try {
    const parser = new ParserService();
    
    // Use provided custom content or get sample content for the specified type
    const content = customContent || samples[type as keyof typeof samples];
    
    if (!content) {
      console.error(`Unknown directive type: ${type}`);
      console.log('Available types: path, import, define, embed, textvar, codefence, custom');
      return;
    }

    console.log(`\n--- Parsing ${type.toUpperCase()} directive ---\n`);
    console.log('Input content:');
    console.log(content);
    console.log('\n--- AST Output ---\n');
    
    // Parse the content
    const ast = await parser.parseWithLocations(content);
    
    // Print the entire AST with readable formatting
    console.log('Full AST:');
    console.log(JSON.stringify(ast, null, 2));
    
    // If it's a directive, focus on that specific directive type
    if (type !== 'custom' && type !== 'codefence' && type !== 'textvar') {
      // Find directives of the specified type
      const directives = ast.filter(node => 
        node.type === 'Directive' && 
        (node as DirectiveNode).directive?.kind?.toLowerCase() === type.toLowerCase()
      );
      
      if (directives.length > 0) {
        console.log(`\n--- ${type.toUpperCase()} Directive Details ---\n`);
        
        directives.forEach((node, index) => {
          const directiveNode = node as DirectiveNode;
          console.log(`${type.toUpperCase()} Directive #${index + 1}:`);
          console.log(JSON.stringify(directiveNode.directive, null, 2));
          console.log('\nFull Properties:');
          
          // List all properties for debugging
          for (const key in directiveNode.directive) {
            console.log(`- ${key}: ${JSON.stringify(directiveNode.directive[key])}`);
          }
          
          console.log('\n---\n');
        });
      }
    }
    
    // Special handling for TextVar (not directives but references)
    if (type === 'textvar') {
      // Find variable references
      const varRefs = ast.filter(node => 
        node.type === 'TextVar' || 
        (node.type === 'Text' && (node as TextNode).content?.includes('${'))
      );
      
      if (varRefs.length > 0) {
        console.log('\n--- TextVar References ---\n');
        
        varRefs.forEach((node, index) => {
          console.log(`TextVar Reference #${index + 1}:`);
          console.log(JSON.stringify(node, null, 2));
          console.log('\nFull Properties:');
          
          // List all properties for debugging
          for (const key in node) {
            console.log(`- ${key}: ${JSON.stringify(node[key])}`);
          }
          
          console.log('\n---\n');
        });
      }
    }

    // Special handling for CodeFence nodes
    if (type === 'codefence') {
      // Find code fence nodes
      const codeFences = ast.filter(node => node.type === 'CodeFence');
      
      if (codeFences.length > 0) {
        console.log('\n--- CodeFence Details ---\n');
        
        codeFences.forEach((node, index) => {
          console.log(`CodeFence #${index + 1}:`);
          console.log(JSON.stringify(node, null, 2));
          console.log('\nFull Properties:');
          
          // List all properties for debugging
          for (const key in node) {
            console.log(`- ${key}: ${JSON.stringify(node[key])}`);
          }
          
          console.log('\n---\n');
        });
      }
    }

  } catch (error) {
    console.error('Error parsing content:');
    console.error(error);
  }
}

// Get the directive type from command line arguments
const args = process.argv.slice(2);
const directiveType = args[0] || 'path';
const customContent = args[1];

// Run the debugger
debugAST(directiveType, customContent).catch(error => {
  console.error('Fatal error:');
  console.error(error);
  process.exit(1);
}); 
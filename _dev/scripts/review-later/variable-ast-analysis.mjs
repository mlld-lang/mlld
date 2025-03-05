// variable-ast-analysis.mjs
import { parse } from 'meld-ast';

// This script specifically focuses on analyzing variable references in the AST
// to understand how they're represented and how to handle both formats

async function analyzeVariables() {
  console.log("===== VARIABLE REFERENCE AST STRUCTURE ANALYSIS =====\n");

  // Set up examples that highlight the differences
  const examples = [
    {
      name: "Simple Text Variable",
      code: "{{greeting}}",
      description: "A simple text variable reference"
    },
    {
      name: "Data Variable With Field",
      code: "{{config.value}}",
      description: "A data variable accessing a field"
    },
    {
      name: "Array Access with Brackets",
      code: "{{items[0]}}",
      description: "Array access using bracket notation"
    },
    {
      name: "Array Access with Dot Notation",
      code: "{{items.0}}",
      description: "Array access using dot notation"
    },
    {
      name: "Nested Object Access",
      code: "{{config.nested.key}}",
      description: "Accessing a nested object property"
    },
    {
      name: "Variables in Text",
      code: "Hello, {{name}}!",
      description: "Variables embedded in text content"
    },
    {
      name: "Multiple Variables",
      code: "{{greeting}}, {{name}}!",
      description: "Multiple variables in a single line"
    },
    {
      name: "Variable in Directive",
      code: "@text test = \"{{greeting}}\"",
      description: "Variable inside a directive value"
    },
    {
      name: "Variable in Embed",
      code: "@embed [{{filename}}]",
      description: "Variable in an embed directive"
    }
  ];

  // Parse options
  const options = {
    trackLocations: true,
    validateNodes: true,
    structuredPaths: true
  };

  // Analyze each example
  for (const example of examples) {
    console.log(`\n--- ${example.name} ---`);
    console.log(`Description: ${example.description}`);
    console.log(`Input: ${example.code}`);
    
    try {
      const result = await parse(example.code, options);
      console.log("AST Structure:");
      console.log(JSON.stringify(result.ast, null, 2));
      
      // Extract information about variable nodes
      const varNodes = findVariableNodes(result.ast);
      if (varNodes.length > 0) {
        console.log("\nVariable Nodes Analysis:");
        varNodes.forEach((node, i) => {
          console.log(`\nVariable #${i+1}:`);
          console.log(`  Type: ${node.type}`);
          
          if (node.type === 'DataVar' || node.type === 'TextVar') {
            // Old format
            console.log(`  Identifier: ${node.identifier}`);
            console.log(`  VarType: ${node.varType || 'N/A'}`);
            if (node.fields && node.fields.length > 0) {
              console.log(`  Fields: ${JSON.stringify(node.fields)}`);
            }
          } else if (node.type === 'Directive') {
            // New format
            console.log(`  Directive Kind: ${node.directive.kind}`);
            console.log(`  Identifier: ${node.directive.identifier || 'N/A'}`);
            if (node.directive.value) {
              console.log(`  Value: ${JSON.stringify(node.directive.value)}`);
            }
          }
        });
      } else {
        console.log("\nNo variable nodes found.");
      }
    } catch (error) {
      console.error(`Error parsing: ${error.message}`);
    }
    console.log("\n" + "=".repeat(50));
  }

  console.log("\n===== TRANSFORMATION HANDLING RECOMMENDATIONS =====");
  console.log(`
1. Node Type Check: Check both 'TextVar'/'DataVar' and 'Directive' node types
   if (node.type === 'TextVar' || node.type === 'DataVar') {
     // Handle legacy format
   } else if (node.type === 'Directive' && 
             (node.directive.kind === 'text' || node.directive.kind === 'data')) {
     // Handle new format
   }

2. Identifier Access: Extract identifier differently based on node type
   const identifier = node.type === 'Directive' 
     ? node.directive.identifier 
     : node.identifier;

3. Fields/Properties Access: Extract fields differently
   const fields = node.type === 'Directive'
     ? extractFieldsFromDirective(node.directive)
     : node.fields;

4. Normalized Variable Reference Pattern:
   function normalizeVarNode(node) {
     return {
       identifier: node.type === 'Directive' ? node.directive.identifier : node.identifier,
       varType: node.type === 'Directive' ? node.directive.kind : node.varType,
       fields: node.type === 'Directive' 
         ? extractFieldsFromDirective(node.directive) 
         : node.fields || []
     };
   }
`);
}

// Function to find variable reference nodes in the AST
function findVariableNodes(ast) {
  const varNodes = [];
  
  // Handle if ast is an array of nodes
  const nodes = Array.isArray(ast) ? ast : [ast];
  
  // Recursive function to search for variable nodes
  function searchNodes(nodeArray) {
    for (const node of nodeArray) {
      if (!node) continue;
      
      // Check if this is a variable node (old format)
      if (node.type === 'TextVar' || node.type === 'DataVar') {
        varNodes.push(node);
      } 
      // Check if this is a variable node (new format)
      else if (node.type === 'Directive' && 
              (node.directive?.kind === 'text' || node.directive?.kind === 'data')) {
        varNodes.push(node);
      }
      
      // Search in nested nodes/arrays
      if (Array.isArray(node.children)) {
        searchNodes(node.children);
      }
      if (Array.isArray(node.content)) {
        searchNodes(node.content);
      }
      if (node.directive?.variable) {
        searchNodes([node.directive.variable]);
      }
      if (node.directive?.path?.variable) {
        searchNodes([node.directive.path.variable]);
      }
    }
  }
  
  searchNodes(nodes);
  return varNodes;
}

// Run the analysis
analyzeVariables().catch(error => {
  console.error('Unhandled error:', error);
}); 
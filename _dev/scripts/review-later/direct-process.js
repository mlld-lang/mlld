/**
 * Direct Meld processor script that correctly handles field access.
 * This script is a simplified version of the main processor,
 * focused on correctly handling field access in Meld variables.
 * 
 * Usage:
 *   node scripts/direct-process.js <input-file> [--format=FORMAT]
 * 
 * Options:
 *   --format=FORMAT  Output format (markdown or llm, default: markdown)
 */

const fs = require('fs');
const path = require('path');

// Simple function to parse Meld data variables
function parseMeldData(content) {
  const dataVars = {};
  const dataRegex = /@data\s+(\w+)\s*=\s*({[\s\S]*?})(?=\n[@#]|\n\n|$)/g;
  
  let match;
  while ((match = dataRegex.exec(content)) !== null) {
    const name = match[1];
    const value = match[2];
    
    try {
      // Convert JSON5-style to strict JSON
      const jsonValue = value
        .replace(/(\w+):/g, '"$1":')  // Quote keys
        .replace(/'/g, '"');          // Replace single quotes with double quotes
      
      // Parse the data
      dataVars[name] = JSON.parse(jsonValue);
    } catch (error) {
      console.error(`Error parsing @data variable ${name}:`, error);
      // Fall back to storing as string
      dataVars[name] = value;
    }
  }
  
  return dataVars;
}

// Simple function to parse Meld text variables
function parseMeldText(content) {
  const textVars = {};
  const textRegex = /@text\s+(\w+)\s*=\s*"([^"]*)"(?=\n[@#]|\n\n|$)/g;
  
  let match;
  while ((match = textRegex.exec(content)) !== null) {
    const name = match[1];
    const value = match[2];
    textVars[name] = value;
  }
  
  return textVars;
}

// Function to access fields of an object using dot notation
function accessField(obj, fieldPath) {
  if (!fieldPath || fieldPath.length === 0) {
    return obj;
  }
  
  let current = obj;
  for (const field of fieldPath) {
    if (current === null || current === undefined) {
      throw new Error(`Cannot access field ${field} of undefined or null`);
    }
    
    // Handle array access notation (e.g., items[0])
    const arrayMatch = field.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [_, arrayName, indexStr] = arrayMatch;
      const index = parseInt(indexStr, 10);
      
      if (!current[arrayName] || !Array.isArray(current[arrayName])) {
        throw new Error(`${arrayName} is not an array or does not exist`);
      }
      
      if (index < 0 || index >= current[arrayName].length) {
        throw new Error(`Array index ${index} out of bounds for ${arrayName}`);
      }
      
      current = current[arrayName][index];
    } else {
      if (typeof current !== 'object' || !(field in current)) {
        throw new Error(`Cannot access field ${field} of ${typeof current}`);
      }
      
      current = current[field];
    }
  }
  
  return current;
}

// Function to process variable references in a string
function processVariables(text, variables) {
  return text.replace(/\{\{([^{}]+?)\}\}/g, (match, varRef) => {
    const parts = varRef.split('.');
    const baseVar = parts[0];
    
    // Try to find the variable in our variables object
    const value = variables[baseVar];
    
    // If variable not found, return empty string
    if (value === undefined) {
      console.error(`Undefined variable: ${baseVar}`);
      return '';
    }
    
    // For variables with field access, resolve fields
    if (parts.length > 1 && typeof value === 'object' && value !== null) {
      try {
        const result = accessField(value, parts.slice(1));
        
        // Return the result, converting objects to JSON
        if (typeof result === 'object' && result !== null) {
          return JSON.stringify(result, null, 2);
        } else {
          return String(result);
        }
      } catch (error) {
        console.error(`Error accessing field: ${error.message}`);
        return '';
      }
    } else {
      // Direct variable access
      if (typeof value === 'object' && value !== null) {
        return JSON.stringify(value, null, 2);
      } else {
        return String(value);
      }
    }
  });
}

// Main processing function
function processMeld(content) {
  // Parse variables
  const textVars = parseMeldText(content);
  const dataVars = parseMeldData(content);
  
  // Combine all variables
  const variables = { ...textVars, ...dataVars };
  
  // Process variable references
  let result = content;
  
  // Remove directive definitions
  result = result.replace(/@(text|data)\s+\w+\s*=.*?(?=\n[@#]|\n\n|$)/gs, '');
  
  // Process variable references
  result = processVariables(result, variables);
  
  return result;
}

// Convert to XML if needed (simple implementation)
function convertToXML(markdown) {
  // Very basic markdown to XML conversion
  // This is a simplified version - in a real implementation, you'd use a proper Markdown parser
  let xml = '<Document>\n';
  
  // Process headers
  markdown = markdown.replace(/^#\s+(.*?)$/gm, (match, title) => {
    return `<Section title="${title}">\n`;
  });
  
  // Add content
  xml += markdown;
  
  // Close all sections
  xml += '</Section>\n'.repeat((markdown.match(/^#\s+/gm) || []).length);
  xml += '</Document>';
  
  return xml;
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  
  // Get input file
  const inputFile = args.find(arg => !arg.startsWith('--'));
  if (!inputFile) {
    console.error('Error: No input file specified');
    process.exit(1);
  }
  
  // Get format option
  const formatArg = args.find(arg => arg.startsWith('--format='))?.split('=')[1];
  const format = (formatArg === 'xml') ? 'xml' : 'markdown';
  
  try {
    // Read the input file
    const content = fs.readFileSync(inputFile, 'utf-8');
    
    // Process the content
    let result = processMeld(content);
    
    // Convert to XML if needed
    if (format === 'xml') {
      result = convertToXML(result);
    }
    
    // Output the result
    console.log(result);
  } catch (error) {
    console.error(`Error processing Meld file: ${error.message}`);
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  console.error(`Unexpected error: ${error.message}`);
  process.exit(1);
}); 
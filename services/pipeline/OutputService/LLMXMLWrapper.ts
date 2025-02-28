/**
 * Wrapper for the llmxml package to prevent HTML entity encoding for JSON data
 * 
 * TODO: Remove this wrapper when llmxml is updated to handle JSON content properly without HTML entity encoding.
 * This wrapper is specifically needed to prevent quotes and brackets in JSON from being converted to HTML entities,
 * which makes the JSON unusable.
 */
import { createLLMXML, LLMXMLOptions } from 'llmxml';

// JSON pattern to identify JSON structures
const JSON_PATTERN = /{.*}|\\[.*\\]/;

export interface LLMXMLWrapperOptions extends LLMXMLOptions {
  // Extra options can be added here
}

/**
 * Creates a wrapped version of llmxml that preserves JSON content
 */
export function createLLMXMLWrapper(options: LLMXMLWrapperOptions) {
  const llmxml = createLLMXML(options);
  const originalToXML = llmxml.toXML;
  
  // Store JSON fragments and their placeholders
  const jsonFragments = new Map<string, string>();
  let placeholderCounter = 0;
  
  /**
   * Generate a unique placeholder for a JSON fragment
   */
  const createPlaceholder = () => {
    const placeholder = `__JSON_PLACEHOLDER_${placeholderCounter++}__`;
    return placeholder;
  };
  
  /**
   * Find and replace JSON objects in the content with placeholders
   */
  const processJsonObjects = (content: string): string => {
    // Reset for each new conversion
    jsonFragments.clear();
    placeholderCounter = 0;
    
    // Log the processing
    if (options.verbose) {
      console.log('Processing content for JSON preservation:', content);
    }
    
    // Simple approach: look for content that looks like JSON objects/arrays
    // This is not foolproof but works for basic cases
    return content.replace(/({[\s\S]*?}|\[[\s\S]*?\])/g, (match) => {
      try {
        // Verify it's actually valid JSON by parsing
        JSON.parse(match);
        const placeholder = createPlaceholder();
        jsonFragments.set(placeholder, match);
        
        if (options.verbose) {
          console.log(`Replaced JSON: ${match} with placeholder: ${placeholder}`);
        }
        
        return placeholder;
      } catch (e) {
        // If not valid JSON, return the original string
        return match;
      }
    });
  };
  
  /**
   * Restore JSON placeholders in the XML content
   */
  const restoreJsonObjects = (content: string): string => {
    let result = content;
    
    // Replace each placeholder with its original JSON
    for (const [placeholder, json] of jsonFragments.entries()) {
      if (options.verbose) {
        console.log(`Restoring placeholder: ${placeholder} with JSON: ${json}`);
      }
      
      // Simple string replacement
      result = result.replace(placeholder, json);
    }
    
    return result;
  };
  
  // Create a wrapped version of the toXML method
  const wrappedToXML = (markdown: string): string => {
    try {
      // Process the markdown to find and replace JSON objects
      const processedMarkdown = processJsonObjects(markdown);
      
      // Call the original toXML method
      const xml = originalToXML(processedMarkdown);
      
      // Restore the JSON objects in the XML
      const resultXml = restoreJsonObjects(xml);
      
      return resultXml;
    } catch (error) {
      console.error('Error in LLMXML wrapper:', error);
      // Fall back to the original method if our wrapper fails
      return originalToXML(markdown);
    }
  };
  
  // Return a modified llmxml instance with our wrapped method
  return {
    ...llmxml,
    toXML: wrappedToXML
  };
} 
/**
 * Meld API Usage Examples
 * 
 * This file demonstrates how to use the Meld API for processing Meld files.
 */

import { main } from '../api/index.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Simple example of processing a Meld file
 */
async function basicExample() {
  try {
    console.log('Basic example:');
    
    // Create a simple Meld file
    const meldContent = `
      @text greeting = "Hello"
      @text name = "World"
      
      ${greeting}, ${name}!
    `;
    
    // Write to a temporary file
    const filePath = path.join(process.cwd(), 'temp.meld');
    fs.writeFileSync(filePath, meldContent);
    
    // Process with default options
    const output = await main(filePath);
    console.log('Output:', output);
    
    // Clean up
    fs.unlinkSync(filePath);
  } catch (error) {
    console.error('Error in basic example:', error);
  }
}

/**
 * Example with markdown output format
 */
async function markdownExample() {
  try {
    console.log('\nMarkdown example:');
    
    // Create a Meld file with markdown
    const meldContent = `
      @text title = "Meld Example"
      
      # ${title}
      
      This is a **markdown** example.
      
      - List item 1
      - List item 2
    `;
    
    // Write to a temporary file
    const filePath = path.join(process.cwd(), 'temp.meld');
    fs.writeFileSync(filePath, meldContent);
    
    // Process with markdown format
    const output = await main(filePath, { 
      format: 'md',
      transformation: true 
    });
    console.log('Markdown output:', output);
    
    // Clean up
    fs.unlinkSync(filePath);
  } catch (error) {
    console.error('Error in markdown example:', error);
  }
}

/**
 * Example with transformation mode
 */
async function transformationExample() {
  try {
    console.log('\nTransformation example:');
    
    // Create a Meld file with a command
    const meldContent = `
      @text greeting = "Hello from command:"
      @run [echo "Meld API"]
      
      ${greeting}
    `;
    
    // Write to a temporary file
    const filePath = path.join(process.cwd(), 'temp.meld');
    fs.writeFileSync(filePath, meldContent);
    
    // Process with transformation enabled
    const output = await main(filePath, { 
      transformation: true,
      format: 'md' 
    });
    console.log('Transformed output:', output);
    
    // Clean up
    fs.unlinkSync(filePath);
  } catch (error) {
    console.error('Error in transformation example:', error);
  }
}

/**
 * Example with error handling
 */
async function errorHandlingExample() {
  try {
    console.log('\nError handling example:');
    
    // Create a Meld file with an error
    const meldContent = `
      @text = "Missing identifier"
    `;
    
    // Write to a temporary file
    const filePath = path.join(process.cwd(), 'temp.meld');
    fs.writeFileSync(filePath, meldContent);
    
    // Try to process the file (should throw an error)
    const output = await main(filePath);
    console.log('This should not be reached');
  } catch (error) {
    console.log('Caught expected error:', error.message);
    
    // Clean up
    fs.unlinkSync(path.join(process.cwd(), 'temp.meld'));
  }
}

/**
 * Run all examples
 */
async function runExamples() {
  await basicExample();
  await markdownExample();
  await transformationExample();
  await errorHandlingExample();
  
  console.log('\nAll examples completed');
}

// Run the examples
runExamples().catch(error => {
  console.error('Error running examples:', error);
});
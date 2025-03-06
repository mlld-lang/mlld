/**
 * Simple example of using the runMeld API
 * 
 * This example demonstrates how to use the simple runMeld function
 * to process meld content directly from a string.
 */

// Import the runMeld function 
import runMeld from '../../api/index.js';

async function main() {
  // Example meld content
  const meldContent = `
    @text greeting = "Hello"
    @text name = "World"
    
    ${greeting}, ${name}!
  `;

  try {
    // Process the content
    const result = await runMeld(meldContent);
    console.log('Result:');
    console.log(result);
    
    // Use with options
    const xmlResult = await runMeld(meldContent, { 
      format: 'xml',
      transformation: false
    });
    console.log('\nXML Result:');
    console.log(xmlResult);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run the example
main().catch(error => {
  console.error('Unhandled error:', error);
}); 
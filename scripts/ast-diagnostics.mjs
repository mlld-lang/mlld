// ast-diagnostics.ts
import { parse } from 'meld-ast';
import * as fs from 'fs';

// Async function to run all diagnostics
async function runDiagnostics() {
  // Test with samples of each directive type (with corrected syntax)
  const backtickFence = '```';

  const samples = {
    path: '@path docs = "$PROJECTPATH/docs"\n',
    text: '@text greeting = "Hello"\n',
    text: '@text name = "Bob"\n',
    data: '@data config = { "value": 123, "other": "test", "nested": { "key": "value" } }\n',
    import: '@import [$PROJECTPATH/other.meld]\n',
    define: '@define command = @run [echo hello]\n',
    embed: '@embed [$PROJECTPATH/docs/somefile.md]\n',
    embed: '@text test = "test" \n\n @embed [${test}]\n',
    define: `@define greet(name, message) = @run [echo "Hello {{name}}, {{message}}"]`,
    codefence: `${backtickFence}javascript\nsomecode() {\n  console.log("Hello, world!")\n}\n}\n${backtickFence}\n`,
    textcontent: `this is just a regular line of content text\n\nand another\n\nand another just for good measure!`
  };

  // Options for the parser
  const options = {
    trackLocations: true,
    validateNodes: true,
    structuredPaths: true
  };

  // Run diagnostics
  for (const [type, sample] of Object.entries(samples)) {
    console.log(`\n===== ${type.toUpperCase()} DIRECTIVE =====`);
    try {
      // Parse with await and access ast property
      const result = await parse(sample, options);
      console.log(JSON.stringify(result.ast, null, 2));
    } catch (error) {
      console.error(`Error parsing ${type}:`, error.message);
    }
  }
}

// Run the async function
runDiagnostics().catch(error => {
  console.error('Unhandled error:', error);
});
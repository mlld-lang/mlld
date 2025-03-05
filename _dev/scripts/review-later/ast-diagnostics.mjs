// ast-diagnostics.ts
import { parse } from 'meld-ast';
import * as fs from 'fs';

// Async function to run all diagnostics
async function runDiagnostics() {
  // Test with samples of each directive type (with corrected syntax)
  const backtickFence = '```';

  // Creating separate collections to focus our analysis
  const variableSamples = {
    simpleTextVar: '{{greeting}}',
    simpleDataVar: '{{config.value}}',
    dataArrayVar: '{{list[0]}}',
    dataNestedArrayVar: '{{list[0].object1}}',
    dotNotationArray: '{{list.0.object1}}',
    nestedObjectAccess: '{{config.nested.key}}',
    mixedContent: 'Hello {{name}}, welcome to {{config.value}}!',
    multilinesWithVars: 'Line 1\nThis is {{name}}\nLine 3 with {{config.nested.key}}'
  };

  const directiveSamples = {
    path: '@path docs = "$PROJECTPATH/docs"\n',
    text: '@text greeting = "Hello"\n',
    text2: '@text name = "Bob"\n',
    data: '@data config = { "value": 123, "other": "test", "nested": { "key": "value" } }\n',
    list: '@data list = [{ "object1": "value" }, { "another": "value"}, { "third": "value" }]\n',
    homeimport: '@import [$HOMEPATH/other.meld]\n',
    pathvarimport: '@import [$mypath/other.meld]\n',
    projimport: '@import [$./some/path/other.meld]\n',
    define: '@define command = @run [echo hello]\n',
    embed: '@embed [$PROJECTPATH/docs/somefile.md]\n',
    embedVar: '@embed [${test}]\n',
    embedList: '@embed {{list.0}}'
  };

  // Options for the parser
  const options = {
    trackLocations: true,
    validateNodes: true,
    structuredPaths: true
  };

  // First run diagnostics on variable references (our main focus)
  console.log("\n\n========= VARIABLE REFERENCE AST ANALYSIS =========\n");
  for (const [type, sample] of Object.entries(variableSamples)) {
    console.log(`\n===== ${type.toUpperCase()} =====`);
    try {
      const result = await parse(sample, options);
      // Simplify output for better readability
      console.log(JSON.stringify(result.ast, null, 2));
    } catch (error) {
      console.error(`Error parsing ${type}:`, error.message);
    }
  }

  // Then run diagnostics on directives for comparison
  console.log("\n\n========= DIRECTIVE AST ANALYSIS =========\n");
  for (const [type, sample] of Object.entries(directiveSamples)) {
    console.log(`\n===== ${type.toUpperCase()} =====`);
    try {
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
// analyze-imports.mjs
import { parse } from 'meld-ast';

async function analyzeImports() {
  const testCases = [
    { name: 'HOME_PATH', code: '@import [$~/dev/meld/examples/example-import.meld]' },
    { name: 'PROJECT_PATH', code: '@import [$./examples/example-import.meld]' },
    { name: 'SIMPLE_PATH', code: '@import [example-import.meld]' },
    { name: 'PATH_VAR_REF', code: '@path mypath = "$PROJECTPATH/examples/example-import.meld"\n@import [${mypath}]' },
    { name: 'PATH_VAR_DIRECT', code: '@path mypath = "$PROJECTPATH/examples/example-import.meld"\n@import [$mypath]' }
  ];

  const options = { trackLocations: true, validateNodes: true, structuredPaths: true };

  for (const testCase of testCases) {
    console.log(`\n===== ${testCase.name} =====`);
    try {
      const result = await parse(testCase.code, options);
      const directive = result.ast.find(node => 
        node.type === 'Directive' && node.directive?.kind === 'import'
      );
      if (directive) {
        console.log(JSON.stringify(directive.directive.path, null, 2));
      } else {
        console.log('No import directive found');
      }
    } catch (error) {
      console.error(`Error parsing ${testCase.name}:`, error.message);
    }
  }
}

// Run the analysis
analyzeImports().catch(console.error); 
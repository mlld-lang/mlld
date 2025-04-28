// Test cases for text directive with embed section
const testCases = [
  {
    name: 'project-path-variable',
    input: '@text instructions = @embed [$./embed-content.md # Instructions]',
    expected: {
      directive: {
        kind: 'text',
        identifier: 'instructions',
        source: 'embed',
        embed: {
          kind: 'embed',
          path: {
            raw: '$./embed-content.md',
            // normalized path is no longer used
            structured: {
              base: '$.',
              segments: ['embed-content.md'],
              variables: { special: ['PROJECTPATH'] }
            }
          },
          section: 'Instructions'
        }
      }
    }
  },
  {
    name: 'home-path-variable',
    input: '@text profile = @embed [$~/user-profile.md # Bio]',
    expected: {
      directive: {
        kind: 'text',
        identifier: 'profile',
        source: 'embed',
        embed: {
          kind: 'embed',
          path: {
            raw: '$~/user-profile.md',
            // normalized path is no longer used
            structured: {
              base: '$~',
              segments: ['user-profile.md'],
              variables: { special: ['HOMEPATH'] }
            }
          },
          section: 'Bio'
        }
      }
    }
  },
  {
    name: 'regular-path',
    input: '@text chapter = @embed [document.md # Chapter 1]',
    expected: {
      directive: {
        kind: 'text',
        identifier: 'chapter',
        source: 'embed',
        embed: {
          kind: 'embed',
          path: {
            raw: 'document.md',
            // normalized path is no longer used
            structured: {
              base: '.',
              segments: ['document.md'],
              variables: {}
            }
          },
          section: 'Chapter 1'
        }
      }
    }
  },
  {
    name: 'text-variable-in-path',
    input: '@text content = @embed [{{file_name}}.md # Content]',
    expected: {
      directive: {
        kind: 'text',
        identifier: 'content',
        source: 'embed',
        embed: {
          kind: 'embed',
          path: {
            raw: '{{file_name}}.md',
            structured: {
              variables: { text: ['file_name'] }
            },
            variable_warning: true
          },
          section: 'Content'
        }
      }
    }
  }
];

// Use require for CommonJS
const parser = require('@core/ast/grammar/parser.cjs');
const { parse } = parser;

// Run each test case
testCases.forEach(testCase => {
  console.log(`\n====== TEST CASE: ${testCase.name} ======`);
  console.log('Input:', testCase.input);
  
  try {
    const result = parse(testCase.input);
    console.log('Actual:', JSON.stringify(result[0], null, 2));
    
    // Compare actual vs expected
    console.log('\nANALYSIS:');
    if (result[0]?.directive?.kind === 'text' && 
        result[0]?.directive?.source === 'embed') {
      console.log('✓ Basic directive structure is correct');
      
      const section = result[0]?.directive?.embed?.section;
      const expectedSection = testCase.expected.directive.embed.section;
      if (section === expectedSection) {
        console.log(`✓ Section is correctly preserved: "${section}"`);
      } else {
        console.log(`✗ Section is missing or incorrect. Expected: "${expectedSection}", Got: "${section}"`);
      }
      
      const path = result[0]?.directive?.embed?.path?.raw;
      const expectedPath = testCase.expected.directive.embed.path.raw;
      if (path === expectedPath) {
        console.log(`✓ Path is correctly preserved: "${path}"`);
      } else {
        console.log(`✗ Path is incorrect. Expected: "${expectedPath}", Got: "${path}"`);
      }
      
      // Check special variables if expected
      const specialVars = testCase.expected.directive.embed.path.structured?.variables?.special;
      if (specialVars) {
        const actualSpecialVars = result[0]?.directive?.embed?.path?.structured?.variables?.special;
        if (actualSpecialVars && JSON.stringify(actualSpecialVars) === JSON.stringify(specialVars)) {
          console.log(`✓ Special variables detected correctly: ${JSON.stringify(specialVars)}`);
        } else {
          console.log(`✗ Special variables incorrect. Expected: ${JSON.stringify(specialVars)}, Got: ${JSON.stringify(actualSpecialVars)}`);
        }
      }
      
      // Check text variables if expected
      const textVars = testCase.expected.directive.embed.path.structured?.variables?.text;
      if (textVars) {
        const actualTextVars = result[0]?.directive?.embed?.path?.structured?.variables?.text;
        if (actualTextVars && JSON.stringify(actualTextVars) === JSON.stringify(textVars)) {
          console.log(`✓ Text variables detected correctly: ${JSON.stringify(textVars)}`);
        } else {
          console.log(`✗ Text variables incorrect. Expected: ${JSON.stringify(textVars)}, Got: ${JSON.stringify(actualTextVars)}`);
        }
      }
    } else {
      console.log('✗ Basic directive structure is incorrect');
    }
  } catch (error) {
    console.error('Error parsing input:', error.message);
  }
});
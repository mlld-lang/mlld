import 'reflect-metadata';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

// Resolve parser and types paths
// Get project root directory
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, '../../..');

const parserUrl = pathToFileURL(
  path.resolve(projectRoot, 'core/ast/grammar/parser.cjs')
).href;

const typesUrl = pathToFileURL(
  path.resolve(projectRoot, 'core/syntax/types/index.js')
).href;

// Add our failing import test case with text variables
const importTest = {
  input: '@import [./{{text_var}}/file.md]\n',
  expected: {
    kind: 'import',
    subtype: 'importStandard',
    imports: [{ name: '*', alias: null }],
    path: {
      raw: './{{text_var}}/file.md',
      values: [
        { type: 'Text', content: '.' },
        { type: 'PathSeparator', value: '/' },
        { type: 'VariableReference', identifier: 'text_var', valueType: 'text' },
        { type: 'PathSeparator', value: '/' },
        { type: 'Text', content: 'file' },
        { type: 'PathSeparator', value: '.' },
        { type: 'Text', content: 'md' }
      ],
      isAbsolute: false,
      isRelativeToCwd: true,
      hasVariables: true,
      hasTextVariables: true,
      hasPathVariables: false,
      variable_warning: false
    }
  }
};

// Import both modules
const parser = (await import(parserUrl)).default;
const pkg = await import(typesUrl);
const { parse } = parser;
const { dataTests, embedTests } = pkg;

// Run our import test first
console.log('IMPORT DIRECTIVE TEST:');
console.log('Input:', importTest.input);
console.log('Expected:', JSON.stringify(importTest.expected, null, 2));
try {
  const importTestResult = parse(importTest.input);
  console.log('Actual:', JSON.stringify(importTestResult[0], null, 2));
} catch (err) {
  console.error('Parse error:', err.message);
  console.error('Location:', err.location);
}

// Find the failing tests
    const dataEmbedSource = dataTests.find(t => t.name === 'embed-source');
    const dataEmbedWithSchema = dataTests.find(t => t.name === 'embed-with-schema');
    const embedHeaderLevel = embedTests.find(t => t.name === 'header-level');
    const embedSectionWithHeader = embedTests.find(t => t.name === 'section-with-header');
    const embedPathWithBrackets = embedTests.find(t => t.name === 'path-with-brackets');

    // Parse the inputs
    console.log('DATA EMBED SOURCE TEST:');
    console.log('Input:', dataEmbedSource.input);
    console.log('Expected:', JSON.stringify(dataEmbedSource.expected, null, 2));
    try {
      const dataEmbedSourceResult = parse(dataEmbedSource.input);
      console.log('Actual:', JSON.stringify(dataEmbedSourceResult[0], null, 2));
    } catch (err) {
      console.error('Parse error:', err.message);
      console.error('Location:', err.location);
    }

    console.log('\nDATA EMBED WITH SCHEMA TEST:');
    console.log('Input:', dataEmbedWithSchema.input);
    console.log('Expected:', JSON.stringify(dataEmbedWithSchema.expected, null, 2));
    try {
      const dataEmbedWithSchemaResult = parse(dataEmbedWithSchema.input);
      console.log('Actual:', JSON.stringify(dataEmbedWithSchemaResult[0], null, 2));
    } catch (err) {
      console.error('Parse error:', err.message);
      console.error('Location:', err.location);
    }

    console.log('\nEMBED HEADER LEVEL TEST:');
    console.log('Input:', embedHeaderLevel.input);
    console.log('Expected:', JSON.stringify(embedHeaderLevel.expected, null, 2));
    try {
      const embedHeaderLevelResult = parse(embedHeaderLevel.input);
      console.log('Actual:', JSON.stringify(embedHeaderLevelResult[0], null, 2));
    } catch (err) {
      console.error('Parse error:', err.message);
      console.error('Location:', err.location);
    }

    console.log('\nEMBED SECTION WITH HEADER TEST:');
    console.log('Input:', embedSectionWithHeader.input);
    console.log('Expected:', JSON.stringify(embedSectionWithHeader.expected, null, 2));
    try {
      const embedSectionWithHeaderResult = parse(embedSectionWithHeader.input);
      console.log('Actual:', JSON.stringify(embedSectionWithHeaderResult[0], null, 2));
    } catch (err) {
      console.error('Parse error:', err.message);
      console.error('Location:', err.location);
    }

    console.log('\nEMBED PATH WITH BRACKETS TEST:');
    console.log('Input:', embedPathWithBrackets.input);
    console.log('Expected:', JSON.stringify(embedPathWithBrackets.expected, null, 2));
    try {
      const embedPathWithBracketsResult = parse(embedPathWithBrackets.input);
      console.log('Actual:', JSON.stringify(embedPathWithBracketsResult[0], null, 2));
    } catch (err) {
      console.error('Parse error:', err.message);
      console.error('Location:', err.location);
    }
import { createLLMXML } from 'llmxml';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const llmxml = createLLMXML();

async function generateXMLFixtures() {
  const fixturesDir = join(__dirname, '../src/__fixtures__');
  const xmlOutputDir = join(fixturesDir, 'xml/expected');
  const realWorldDir = join(xmlOutputDir, 'real-world');

  // Ensure output directories exist
  mkdirSync(xmlOutputDir, { recursive: true });
  mkdirSync(realWorldDir, { recursive: true });

  // Process basic.md
  const basicMd = readFileSync(join(fixturesDir, 'markdown/basic.md'), 'utf-8');
  const basicXml = await llmxml.toXML(basicMd);
  writeFileSync(join(xmlOutputDir, 'basic.xml'), basicXml, 'utf-8');
  console.log('Generated basic.xml');

  // Process complex.md
  const complexMd = readFileSync(join(fixturesDir, 'markdown/complex.md'), 'utf-8');
  const complexXml = await llmxml.toXML(complexMd);
  writeFileSync(join(xmlOutputDir, 'complex.xml'), complexXml, 'utf-8');
  console.log('Generated complex.xml');

  // Process real-world examples
  const archMd = readFileSync(join(fixturesDir, 'real-world/architecture.md'), 'utf-8');
  const archXml = await llmxml.toXML(archMd);
  writeFileSync(join(realWorldDir, 'architecture.xml'), archXml, 'utf-8');
  console.log('Generated architecture.xml');

  // Try some section extractions
  console.log('\nExample section extractions:');

  // From complex document
  const codeSection = await llmxml.getSection(complexMd, 'Code Blocks');
  console.log('\nCode Blocks section:');
  console.log(codeSection);

  // From architecture document
  const converterSection = await llmxml.getSection(archMd, 'Converter');
  console.log('\nConverter section:');
  console.log(converterSection);

  // Try fuzzy matching
  const errorSection = await llmxml.getSection(archMd, 'Error Handling', {
    fuzzyThreshold: 0.7
  });
  console.log('\nError Handling section (fuzzy match):');
  console.log(errorSection);
}

generateXMLFixtures().catch(console.error); 
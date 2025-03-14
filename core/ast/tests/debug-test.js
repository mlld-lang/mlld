// Use dynamic import for ESM
import('@core/ast/grammar/parser').then(({ parse }) => {
  import('@core/syntax/types').then((pkg) => {
    const { dataTests, embedTests } = pkg;

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
    const dataEmbedSourceResult = parse(dataEmbedSource.input);
    console.log('Actual:', JSON.stringify(dataEmbedSourceResult[0], null, 2));

    console.log('\nDATA EMBED WITH SCHEMA TEST:');
    console.log('Input:', dataEmbedWithSchema.input);
    console.log('Expected:', JSON.stringify(dataEmbedWithSchema.expected, null, 2));
    const dataEmbedWithSchemaResult = parse(dataEmbedWithSchema.input);
    console.log('Actual:', JSON.stringify(dataEmbedWithSchemaResult[0], null, 2));

    console.log('\nEMBED HEADER LEVEL TEST:');
    console.log('Input:', embedHeaderLevel.input);
    console.log('Expected:', JSON.stringify(embedHeaderLevel.expected, null, 2));
    const embedHeaderLevelResult = parse(embedHeaderLevel.input);
    console.log('Actual:', JSON.stringify(embedHeaderLevelResult[0], null, 2));

    console.log('\nEMBED SECTION WITH HEADER TEST:');
    console.log('Input:', embedSectionWithHeader.input);
    console.log('Expected:', JSON.stringify(embedSectionWithHeader.expected, null, 2));
    const embedSectionWithHeaderResult = parse(embedSectionWithHeader.input);
    console.log('Actual:', JSON.stringify(embedSectionWithHeaderResult[0], null, 2));

    console.log('\nEMBED PATH WITH BRACKETS TEST:');
    console.log('Input:', embedPathWithBrackets.input);
    console.log('Expected:', JSON.stringify(embedPathWithBrackets.expected, null, 2));
    const embedPathWithBracketsResult = parse(embedPathWithBrackets.input);
    console.log('Actual:', JSON.stringify(embedPathWithBracketsResult[0], null, 2));
  });
});
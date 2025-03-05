const { ParserService } = require('../dist/services/parser/ParserService/ParserService.js');

async function main() {
    // Create parser
    const parser = new ParserService();
    await parser.initialize();
    
    // Create test content with path directive
    const content = `
@path config = "$./config"
@text configPath = \`Config is at \${config}\`
\${configPath}
    `;
    
    // Parse and log the AST
    const ast = await parser.parse(content, 'test.meld');
    console.log(JSON.stringify(ast, null, 2));
}

main().catch(console.error);

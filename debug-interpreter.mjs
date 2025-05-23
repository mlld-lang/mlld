import { parse } from './dist/core/ast/parser.js';
import { interpret } from './dist/interpreter/index.js';
import { NodeFileSystem } from './dist/services/fs/FileSystemService/NodeFileSystem.js';
import { FileSystemService } from './dist/services/fs/FileSystemService/FileSystemService.js';
import { PathService } from './dist/services/fs/PathService/PathService.js';

const source = `@text message = "Hello from Meld!"
@add @message`;

// Parse
console.log('=== Parsing ===');
const parseResult = await parse(source);
console.log('AST nodes:', parseResult.ast.length);

// Create services
const nodeFS = new NodeFileSystem();
const fsService = new FileSystemService(nodeFS, undefined, undefined);
const pathService = new PathService(fsService);

// Interpret
console.log('\n=== Interpreting ===');
const result = await interpret(source, {
  basePath: process.cwd(),
  format: 'markdown',
  fileSystem: fsService,
  pathService: pathService,
  strict: false
});

console.log('\n=== Result ===');
console.log('Length:', result.length);
console.log('Content:', JSON.stringify(result));
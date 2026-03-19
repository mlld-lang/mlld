import type { Definition } from './types';

let tsModule: typeof import('typescript') | undefined;

async function loadTs(): Promise<typeof import('typescript')> {
  if (tsModule) return tsModule;
  try {
    tsModule = (await import('typescript')).default ?? await import('typescript');
  } catch {
    throw new Error(
      'TypeScript AST extraction requires the "typescript" package.\n' +
      'Install it with: npm install -g typescript'
    );
  }
  return tsModule;
}

function createTsDefinition(
  ts: typeof import('typescript'),
  name: string,
  type: string,
  node: import('typescript').Node,
  sourceFile: import('typescript').SourceFile,
  content: string
): Definition {
  const start = node.getStart();
  const end = node.getEnd();
  const line = sourceFile.getLineAndCharacterOfPosition(start).line + 1;
  const code = content.slice(start, end);
  const body = (node as import('typescript').Node & { body?: import('typescript').Node }).body;
  const search = body ? body.getText(sourceFile) : code;
  return { name, type, start, end, line, code, search };
}

function collectTsDefinitionFromStatement(
  ts: typeof import('typescript'),
  defs: Definition[],
  statement: import('typescript').Statement,
  sourceFile: import('typescript').SourceFile,
  content: string
): void {
  if (ts.isFunctionDeclaration(statement) && statement.name) {
    defs.push(createTsDefinition(ts, statement.name.text, 'function', statement, sourceFile, content));
    return;
  }

  if (ts.isClassDeclaration(statement) && statement.name) {
    defs.push(createTsDefinition(ts, statement.name.text, 'class', statement, sourceFile, content));
    for (const member of statement.members) {
      if (ts.isMethodDeclaration(member) && member.name && ts.isIdentifier(member.name)) {
        defs.push(createTsDefinition(ts, member.name.text, 'method', member, sourceFile, content));
      }
    }
    return;
  }

  if (ts.isInterfaceDeclaration(statement) && statement.name) {
    defs.push(createTsDefinition(ts, statement.name.text, 'interface', statement, sourceFile, content));
    return;
  }

  if (ts.isEnumDeclaration(statement) && statement.name) {
    defs.push(createTsDefinition(ts, statement.name.text, 'enum', statement, sourceFile, content));
    return;
  }

  if (ts.isTypeAliasDeclaration(statement) && ts.isIdentifier(statement.name)) {
    defs.push(createTsDefinition(ts, statement.name.text, 'type-alias', statement, sourceFile, content));
    return;
  }

  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) {
        defs.push(createTsDefinition(ts, declaration.name.text, 'variable', statement, sourceFile, content));
      }
    }
  }
}

export async function extractTsDefinitions(content: string, filePath: string): Promise<Definition[]> {
  const ts = await loadTs();
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
  const defs: Definition[] = [];

  for (const statement of sourceFile.statements) {
    collectTsDefinitionFromStatement(ts, defs, statement, sourceFile, content);
  }

  return defs;
}

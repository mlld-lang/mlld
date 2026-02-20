import ts from 'typescript';
import type { Definition } from './types';

interface TsNodeWithBody extends ts.Node {
  body?: ts.Node;
}

function createTsDefinition(
  name: string,
  type: string,
  node: ts.Node,
  sourceFile: ts.SourceFile,
  content: string
): Definition {
  const start = node.getStart();
  const end = node.getEnd();
  const line = sourceFile.getLineAndCharacterOfPosition(start).line + 1;
  const code = content.slice(start, end);
  const body = (node as TsNodeWithBody).body;
  const search = body ? body.getText(sourceFile) : code;
  return { name, type, start, end, line, code, search };
}

function collectTsDefinitionFromStatement(
  defs: Definition[],
  statement: ts.Statement,
  sourceFile: ts.SourceFile,
  content: string
): void {
  if (ts.isFunctionDeclaration(statement) && statement.name) {
    defs.push(createTsDefinition(statement.name.text, 'function', statement, sourceFile, content));
    return;
  }

  if (ts.isClassDeclaration(statement) && statement.name) {
    defs.push(createTsDefinition(statement.name.text, 'class', statement, sourceFile, content));
    for (const member of statement.members) {
      if (ts.isMethodDeclaration(member) && member.name && ts.isIdentifier(member.name)) {
        defs.push(createTsDefinition(member.name.text, 'method', member, sourceFile, content));
      }
    }
    return;
  }

  if (ts.isInterfaceDeclaration(statement) && statement.name) {
    defs.push(createTsDefinition(statement.name.text, 'interface', statement, sourceFile, content));
    return;
  }

  if (ts.isEnumDeclaration(statement) && statement.name) {
    defs.push(createTsDefinition(statement.name.text, 'enum', statement, sourceFile, content));
    return;
  }

  if (ts.isTypeAliasDeclaration(statement) && ts.isIdentifier(statement.name)) {
    defs.push(createTsDefinition(statement.name.text, 'type-alias', statement, sourceFile, content));
    return;
  }

  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) {
        defs.push(createTsDefinition(declaration.name.text, 'variable', statement, sourceFile, content));
      }
    }
  }
}

export function extractTsDefinitions(content: string, filePath: string): Definition[] {
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
  const defs: Definition[] = [];

  for (const statement of sourceFile.statements) {
    collectTsDefinitionFromStatement(defs, statement, sourceFile, content);
  }

  return defs;
}

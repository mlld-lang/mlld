export interface LspAstPosition {
  line: number;
  column: number;
  offset: number;
}

export interface LspAstLocation {
  start: LspAstPosition;
  end: LspAstPosition;
}

/**
 * Flexible AST shape used by LSP visitors when parser output contains
 * directive-specific dynamic fields not yet covered by strict core node types.
 */
export interface LspAstNode {
  type?: string;
  nodeId?: string;
  kind?: string;
  subtype?: string;
  source?: unknown;
  identifier?: string;
  name?: string;
  content?: unknown;
  valueType?: string;
  wrapperType?: string;
  templateType?: string;
  delimiter?: string;
  operator?: string | string[];
  command?: string;
  text?: string;
  value?: unknown;
  values?: Record<string, unknown>;
  raw?: Record<string, string>;
  meta?: Record<string, unknown>;
  args?: unknown[];
  fields?: unknown[];
  pipes?: unknown[];
  body?: unknown[] | unknown;
  children?: unknown[];
  nodes?: unknown[];
  elements?: unknown[];
  items?: unknown[];
  properties?: Record<string, unknown>;
  entries?: unknown[];
  keyVariable?: unknown;
  variable?: unknown;
  expression?: unknown[];
  section?: string;
  closeDelimiterLocation?: LspAstLocation;
  openDelimiterLocation?: LspAstLocation;
  closeLocation?: LspAstLocation;
  closeParenLocation?: LspAstLocation;
  closeBracketLocation?: LspAstLocation;
  closeBraceLocation?: LspAstLocation;
  startParenLocation?: LspAstLocation;
  endParenLocation?: LspAstLocation;
  optional?: boolean;
  implicit?: boolean;
  hasRun?: boolean;
  hasRunKeyword?: boolean;
  location?: LspAstLocation;
  sectionLocation?: LspAstLocation;
  keywordLocation?: LspAstLocation;
  languageLocation?: LspAstLocation;
  codeLocation?: LspAstLocation;
  code?: string;
  [key: string]: unknown;
}

export function asLspAstNode(value: unknown): LspAstNode {
  return value as LspAstNode;
}

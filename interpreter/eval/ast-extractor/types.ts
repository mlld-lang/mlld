export interface AstPatternDefinition {
  type: 'definition';
  name: string;
  usage?: boolean;
}

export interface AstPatternTypeFilter {
  type: 'type-filter';
  filter: string;
  usage?: boolean;
}

export interface AstPatternTypeFilterAll {
  type: 'type-filter-all';
  usage?: boolean;
}

export interface AstPatternTypeFilterVar {
  type: 'type-filter-var';
  identifier: string;
  fields?: any[];
  usage?: boolean;
}

export interface AstPatternNameList {
  type: 'name-list';
  filter: string;
  usage?: boolean;
}

export interface AstPatternNameListAll {
  type: 'name-list-all';
  usage?: boolean;
}

export interface AstPatternNameListVar {
  type: 'name-list-var';
  identifier: string;
  fields?: any[];
  usage?: boolean;
}

export interface AstPatternLegacy {
  type: 'definition' | 'usage';
  name: string;
}

export type AstPattern =
  | AstPatternDefinition
  | AstPatternTypeFilter
  | AstPatternTypeFilterAll
  | AstPatternTypeFilterVar
  | AstPatternNameList
  | AstPatternNameListAll
  | AstPatternNameListVar
  | AstPatternLegacy;

export interface AstResult {
  name: string;
  code: string;
  type: string;
  line: number;
  file?: string;
}

export interface Definition {
  name: string;
  type: string;
  start: number;
  end: number;
  line: number;
  code: string;
  search: string;
}

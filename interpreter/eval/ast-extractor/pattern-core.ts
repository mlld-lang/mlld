import type { AstPattern, AstPatternLegacy, AstResult, Definition } from './types';

type SequenceEntry = { kind: 'definition'; key: string } | { kind: 'null' };

export const TYPE_FILTER_MAP: Record<string, string[]> = {
  fn: ['function', 'method'],
  var: ['variable', 'constant'],
  class: ['class'],
  interface: ['interface'],
  type: ['type-alias'],
  enum: ['enum'],
  struct: ['struct'],
  trait: ['trait'],
  module: ['module']
};

function isWildcardPattern(name: string): boolean {
  return name.includes('*') || name.includes('?');
}

function createSymbolMatcher(pattern: string): (name: string) => boolean {
  if (!isWildcardPattern(pattern)) {
    return (name: string) => name === pattern;
  }
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  const regex = new RegExp(`^${regexPattern}$`);
  return (name: string) => regex.test(name);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function contains(container: Definition, child: Definition): boolean {
  return (
    container.start <= child.start &&
    container.end >= child.end &&
    (container.start < child.start || container.end > child.end)
  );
}

function usageMatches(definitions: Definition[], targets: Definition[]): Definition[] {
  const matches = definitions.filter(def => {
    if (def.type === 'variable') {
      return false;
    }
    return targets.some(target => {
      const regex = new RegExp(`\\b${escapeRegExp(target.name)}\\b`);
      return regex.test(def.search);
    });
  });
  return matches.filter(def => !matches.some(other => other !== def && contains(def, other)));
}

export function matchesTypeFilter(defType: string, filter: string): boolean {
  const allowedTypes = TYPE_FILTER_MAP[filter];
  return allowedTypes ? allowedTypes.includes(defType) : false;
}

export function hasNameListPattern(patterns: AstPattern[]): boolean {
  return patterns.some(pattern =>
    pattern.type === 'name-list' || pattern.type === 'name-list-all' || pattern.type === 'name-list-var'
  );
}

export function hasContentPattern(patterns: AstPattern[]): boolean {
  return patterns.some(pattern =>
    pattern.type === 'definition' || pattern.type === 'usage' ||
    pattern.type === 'type-filter' || pattern.type === 'type-filter-all' || pattern.type === 'type-filter-var'
  );
}

export function evaluatePatternResults(definitions: Definition[], patterns: AstPattern[]): Array<AstResult | null> {
  const definitionMap = new Map<string, Definition>();
  const sequence: SequenceEntry[] = [];

  function keyOf(definition: Definition): string {
    return `${definition.start}:${definition.end}:${definition.name}`;
  }

  function pushDefinition(definition: Definition): void {
    const key = keyOf(definition);
    if (definitionMap.has(key)) {
      return;
    }

    for (const existing of definitionMap.values()) {
      if (contains(existing, definition)) {
        return;
      }
    }

    for (const [existingKey, existing] of definitionMap) {
      if (contains(definition, existing)) {
        definitionMap.delete(existingKey);
        const index = sequence.findIndex(entry => entry.kind === 'definition' && entry.key === existingKey);
        if (index !== -1) {
          sequence.splice(index, 1);
        }
      }
    }

    definitionMap.set(key, definition);
    sequence.push({ kind: 'definition', key });
  }

  function pushMatches(matches: Definition[]): void {
    if (matches.length === 0) {
      sequence.push({ kind: 'null' });
      return;
    }
    for (const match of matches) {
      pushDefinition(match);
    }
  }

  for (const pattern of patterns) {
    if (pattern.type === 'type-filter-all') {
      if (pattern.usage) {
        pushMatches(definitions.filter(definition => definition.type !== 'variable'));
      } else {
        pushMatches(definitions);
      }
      continue;
    }

    if (pattern.type === 'type-filter') {
      const matches = definitions.filter(definition => matchesTypeFilter(definition.type, pattern.filter));
      if (pattern.usage) {
        pushMatches(usageMatches(definitions, matches));
      } else {
        pushMatches(matches);
      }
      continue;
    }

    if (pattern.type === 'definition') {
      const patternName = pattern.name;
      if (isWildcardPattern(patternName)) {
        const matcher = createSymbolMatcher(patternName);
        const matches = definitions.filter(definition => matcher(definition.name));
        if (pattern.usage) {
          pushMatches(usageMatches(definitions, matches));
        } else {
          pushMatches(matches);
        }
        continue;
      }

      if (pattern.usage) {
        const regex = new RegExp(`\\b${escapeRegExp(patternName)}\\b`);
        const matches = definitions.filter(definition => definition.type !== 'variable' && regex.test(definition.search));
        pushMatches(matches.filter(definition => !matches.some(other => other !== definition && contains(definition, other))));
        continue;
      }

      const exact = definitions.find(definition => definition.name === patternName);
      if (exact) {
        pushDefinition(exact);
      } else {
        sequence.push({ kind: 'null' });
      }
      continue;
    }

    if (pattern.type === 'usage') {
      const legacyPattern = pattern as AstPatternLegacy;
      const regex = new RegExp(`\\b${escapeRegExp(legacyPattern.name)}\\b`);
      const matches = definitions.filter(definition => definition.type !== 'variable' && regex.test(definition.search));
      pushMatches(matches.filter(definition => !matches.some(other => other !== definition && contains(definition, other))));
      continue;
    }
  }

  return sequence.map(entry => {
    if (entry.kind === 'null') {
      return null;
    }
    const definition = definitionMap.get(entry.key);
    if (!definition) {
      return null;
    }
    return {
      name: definition.name,
      code: definition.code,
      type: definition.type,
      line: definition.line
    };
  });
}

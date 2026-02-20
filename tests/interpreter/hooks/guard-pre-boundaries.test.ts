import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const HOOKS_DIR = path.join(process.cwd(), 'interpreter', 'hooks');

const GUARD_PRE_MODULES = [
  'guard-pre-hook.ts',
  'guard-pre-runtime.ts',
  'guard-pre-aggregation.ts',
  'guard-pre-logging.ts',
  'guard-candidate-selection.ts',
  'guard-override-utils.ts',
  'guard-operation-keys.ts',
  'guard-materialization.ts',
  'guard-runtime-evaluator.ts',
  'guard-helper-injection.ts',
  'guard-block-evaluator.ts',
  'guard-action-evaluator.ts',
  'guard-decision-reducer.ts',
  'guard-retry-state.ts',
  'guard-context-snapshot.ts',
  'guard-shared-history.ts'
] as const;

type Graph = Map<string, string[]>;

function toModuleName(importPath: string): string {
  const normalized = importPath.replace(/^\.\/+/, '');
  return normalized.endsWith('.ts') ? normalized : `${normalized}.ts`;
}

function buildGraph(): Graph {
  const moduleSet = new Set(GUARD_PRE_MODULES);
  const graph: Graph = new Map();

  for (const moduleFile of GUARD_PRE_MODULES) {
    const source = readFileSync(path.join(HOOKS_DIR, moduleFile), 'utf8');
    const imports = Array.from(source.matchAll(/from ['"](\.\/guard-[^'"]+)['"]/g))
      .map(match => toModuleName(match[1]))
      .filter(imported => moduleSet.has(imported));
    graph.set(moduleFile, imports);
  }

  return graph;
}

function findCycles(graph: Graph): string[][] {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];

  const visit = (node: string) => {
    if (visited.has(node)) {
      return;
    }
    if (visiting.has(node)) {
      const cycleStart = stack.indexOf(node);
      if (cycleStart >= 0) {
        cycles.push([...stack.slice(cycleStart), node]);
      }
      return;
    }

    visiting.add(node);
    stack.push(node);
    for (const neighbor of graph.get(node) ?? []) {
      visit(neighbor);
    }
    stack.pop();
    visiting.delete(node);
    visited.add(node);
  };

  for (const node of graph.keys()) {
    visit(node);
  }

  return cycles;
}

describe('guard-pre module boundaries', () => {
  it('keeps the guard-pre module graph acyclic', () => {
    const graph = buildGraph();
    const cycles = findCycles(graph);
    expect(cycles).toEqual([]);
  });

  it('keeps guard-pre-hook as the entrypoint without reverse dependencies', () => {
    const graph = buildGraph();
    const reverseDependents = GUARD_PRE_MODULES
      .filter(moduleFile => moduleFile !== 'guard-pre-hook.ts')
      .filter(moduleFile => (graph.get(moduleFile) ?? []).includes('guard-pre-hook.ts'));

    expect(reverseDependents).toEqual([]);
  });
});

import type { SourceLocation } from '@core/types';
import type {
  ShelfDefinition,
  ShelfScopeSlotBinding
} from '@core/types/shelf';
import type { StaticValidationIssue } from './issues';

export interface ValidatableShelfScopeBinding extends ShelfScopeSlotBinding {
  location?: SourceLocation;
}

function issue(
  code: string,
  message: string,
  location?: SourceLocation
): StaticValidationIssue {
  return { code, message, location };
}

function normalizeScopeBindingRef(binding: ShelfScopeSlotBinding): string {
  return `${binding.ref.shelfName}.${binding.ref.slotName}`;
}

export function validateShelfScopeBindingTargets(
  bindings: readonly ValidatableShelfScopeBinding[],
  shelves: ReadonlyMap<string, ShelfDefinition>
): StaticValidationIssue[] {
  const issues: StaticValidationIssue[] = [];

  for (const binding of bindings) {
    const shelf = shelves.get(binding.ref.shelfName);
    const slot = shelf?.slots[binding.ref.slotName];
    if (!shelf || !slot) {
      issues.push(issue(
        'INVALID_SHELF_SCOPE',
        `Unknown shelf slot '@${binding.ref.shelfName}.${binding.ref.slotName}'`,
        binding.location
      ));
    }
  }

  return issues;
}

export function validateShelfScopeBindingConflicts(
  readBindings: readonly ValidatableShelfScopeBinding[],
  writeBindings: readonly ValidatableShelfScopeBinding[],
  readAliases: Readonly<Record<string, unknown>>
): StaticValidationIssue[] {
  const issues: StaticValidationIssue[] = [];
  const bindingByRef = new Map<string, ValidatableShelfScopeBinding>();
  const aliasRefs = new Map<string, string>();
  const namespaceNames = new Set<string>();

  for (const binding of [...readBindings, ...writeBindings]) {
    const refKey = normalizeScopeBindingRef(binding);
    const existing = bindingByRef.get(refKey);
    if (existing) {
      if ((existing.alias ?? null) !== (binding.alias ?? null)) {
        issues.push(issue(
          'INVALID_SHELF_SCOPE',
          `Shelf slot '@${binding.ref.shelfName}.${binding.ref.slotName}' cannot be exposed under multiple agent names`,
          binding.location ?? existing.location
        ));
        continue;
      }
    } else {
      bindingByRef.set(refKey, binding);
    }

    if (binding.alias) {
      const existingAliasRef = aliasRefs.get(binding.alias);
      if (existingAliasRef && existingAliasRef !== refKey) {
        issues.push(issue(
          'INVALID_SHELF_SCOPE',
          `Shelf alias '${binding.alias}' is already bound to a different slot`,
          binding.location
        ));
        continue;
      }
      aliasRefs.set(binding.alias, refKey);
    } else {
      namespaceNames.add(binding.ref.shelfName);
    }
  }

  for (const alias of Object.keys(readAliases)) {
    if (aliasRefs.has(alias)) {
      issues.push(issue(
        'INVALID_SHELF_SCOPE',
        `Shelf alias '${alias}' is already bound to a slot`
      ));
    }
  }

  for (const alias of [...aliasRefs.keys(), ...Object.keys(readAliases)]) {
    if (namespaceNames.has(alias)) {
      issues.push(issue(
        'INVALID_SHELF_SCOPE',
        `Shelf alias '${alias}' conflicts with an exposed shelf namespace`
      ));
    }
  }

  return issues;
}

import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { StateNode } from '@services/state/StateService/types.js';
import { StateFactory } from '@services/state/StateService/StateFactory.js';
import { stateLogger as logger } from '@core/utils/logger.js';
import type { CommandVariable } from '@core/types/variables.js';
import { createCommandVariable } from '@core/types/variables.js';
import type { ICommandDefinition } from '@core/types/define.js';

/**
 * Options for migrating state
 */
export interface MigrationOptions {
  /**
   * Whether to preserve immutability status
   * @default true
   */
  preserveImmutability?: boolean;

  /**
   * Whether to validate the migrated state
   * @default true
   */
  validate?: boolean;

  /**
   * Whether to throw on validation errors
   * @default false
   */
  strict?: boolean;
}

/**
 * Result of state migration
 */
export interface MigrationResult {
  /**
   * The migrated state node
   */
  state: StateNode;

  /**
   * Any validation warnings that occurred during migration
   */
  warnings: string[];

  /**
   * Whether the migration was successful
   */
  success: boolean;
}

/**
 * Migrates an old state service instance to a new immutable state node
 */
export function migrateState(oldState: IStateService, options: MigrationOptions = {}): MigrationResult {
  const {
    preserveImmutability = true,
    validate = true,
    strict = false
  } = options;

  const warnings: string[] = [];
  const factory = new StateFactory();

  try {
    // Create base state
    const state = factory.createState({
      source: 'migration',
      filePath: oldState.getCurrentFilePath() ?? undefined
    });

    // Migrate variables
    const text = new Map(oldState.getAllTextVars());
    const data = new Map(oldState.getAllDataVars());
    const path = new Map(oldState.getAllPathVars());

    // Migrate commands CORRECTLY
    const commands = new Map<string, CommandVariable>(); // Expect CommandVariable values
    for (const [name, commandDef] of oldState.getAllCommands()) {
      // Use the factory to create the CommandVariable object
      // Assuming the map from oldState contains ICommandDefinition as value
      commands.set(name, createCommandVariable(name, commandDef as ICommandDefinition)); 
    }

    // Migrate imports
    const imports = oldState.getImports();

    // Migrate nodes
    const nodes = oldState.getNodes();

    // Create migrated state
    const migrated = factory.updateState(state, {
      variables: { text, data, path },
      commands, // Pass the correctly structured map
      imports,
      nodes
    });

    // Validate migrated state
    if (validate) {
      validateMigration(oldState, migrated, warnings);
      if (strict && warnings.length > 0) {
        throw new Error('Migration validation failed:\n' + warnings.join('\n'));
      }
    }

    logger.debug('Migrated state', {
      textVars: text.size,
      dataVars: data.size,
      pathVars: path.size,
      commands: commands.size,
      imports: imports.size,
      nodes: nodes.length,
      warnings: warnings.length
    });

    return {
      state: migrated,
      warnings,
      success: true
    };
  } catch (error) {
    logger.error('State migration failed', { error });
    return {
      state: factory.createState(),
      warnings: [...warnings, String(error)],
      success: false
    };
  }
}

/**
 * Validates that the migrated state matches the original
 */
export function validateMigration(oldState: IStateService, newState: StateNode, warnings: string[]): void {
  // Validate text variables
  for (const [key, value] of oldState.getAllTextVars()) {
    const newValue = newState.variables.text.get(key);
    if (newValue?.value !== value) {
      warnings.push(`Text variable mismatch: ${key}`);
    }
  }

  // Validate data variables
  for (const [key, value] of oldState.getAllDataVars()) {
    const newValue = newState.variables.data.get(key);
    if (JSON.stringify(newValue?.value) !== JSON.stringify(value)) {
      warnings.push(`Data variable mismatch: ${key}`);
    }
  }

  // Validate path variables
  for (const [key, value] of oldState.getAllPathVars()) {
    const newValue = newState.variables.path.get(key);
    if (JSON.stringify(newValue?.value) !== JSON.stringify(value)) {
      warnings.push(`Path variable mismatch: ${key}`);
    }
  }

  // Validate commands
  for (const [key, oldCommandDef] of oldState.getAllCommands()) { // oldState map has ICommandDefinition
    const newCommandVar = newState.commands.get(key); // newState map has CommandVariable
    // Check if newCommandVar exists and its value property matches the old definition
    if (!newCommandVar || JSON.stringify(newCommandVar.value) !== JSON.stringify(oldCommandDef)) {
      warnings.push(`Command mismatch: ${key}`);
    }
  }

  // Validate imports
  for (const importPath of oldState.getImports()) {
    if (!newState.imports.has(importPath)) {
      warnings.push(`Missing import: ${importPath}`);
    }
  }

  // Validate nodes
  const oldNodes = oldState.getNodes();
  if (oldNodes.length !== newState.nodes.length) {
    warnings.push(`Node count mismatch: ${oldNodes.length} vs ${newState.nodes.length}`);
  } else {
    for (let i = 0; i < oldNodes.length; i++) {
      if (JSON.stringify(oldNodes[i]) !== JSON.stringify(newState.nodes[i])) {
        warnings.push(`Node mismatch at index ${i}`);
      }
    }
  }

  // Validate file path
  const oldPath = oldState.getCurrentFilePath();
  const newPath = newState.filePath;
  if (oldPath !== (newPath ?? null)) {
    warnings.push(`File path mismatch: ${oldPath} vs ${newPath}`);
  }
} 
import type { Environment } from '@interpreter/env/Environment';
import type { SourceLocation } from '@core/types';
import type { Variable } from '@core/types/variable';
import { MlldImportError } from '@core/errors';

export class ImportBindingGuards {
  ensureImportBindingAvailable(
    targetEnv: Environment,
    name: string,
    importSource: string,
    location?: SourceLocation
  ): void {
    if (!name || name.trim().length === 0) {
      return;
    }

    const existingBinding = targetEnv.getImportBinding(name);
    if (!existingBinding) {
      return;
    }

    throw new MlldImportError(
      `Import collision - '${name}' already imported from ${existingBinding.source}. Alias one of the imports.`,
      {
        code: 'IMPORT_NAME_CONFLICT',
        context: {
          name,
          existingSource: existingBinding.source,
          attemptedSource: importSource,
          existingLocation: existingBinding.location,
          newLocation: location,
          suggestion: "Use 'as' to alias one of the imports"
        },
        details: {
          filePath: location?.filePath || existingBinding.location?.filePath,
          variableName: name
        }
      }
    );
  }

  setVariableWithImportBinding(
    targetEnv: Environment,
    alias: string,
    variable: Variable,
    binding: { source: string; location?: SourceLocation }
  ): void {
    let shouldPersistBinding = false;
    try {
      targetEnv.setVariable(alias, variable);
      shouldPersistBinding = true;
    } finally {
      if (shouldPersistBinding) {
        targetEnv.setImportBinding(alias, binding);
      }
    }
  }
}

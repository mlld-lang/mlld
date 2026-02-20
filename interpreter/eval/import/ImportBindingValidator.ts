import type { DirectiveNode } from '@core/types';
import { MlldImportError } from '@core/errors';
import type { SerializedGuardDefinition } from '../../guards';

export class ImportBindingValidator {
  validateExportBindings(
    moduleObject: Record<string, any>,
    directive: DirectiveNode,
    source?: string,
    guardDefinitions: readonly SerializedGuardDefinition[] = []
  ): void {
    if (!directive.values) {
      return;
    }

    const exportKeySet = new Set(
      Object.keys(moduleObject || {}).filter(key => !key.startsWith('__'))
    );
    for (const guardDefinition of guardDefinitions) {
      if (typeof guardDefinition?.name === 'string' && guardDefinition.name.length > 0) {
        exportKeySet.add(guardDefinition.name);
      }
    }

    if (directive.subtype !== 'importSelected') {
      return;
    }

    // @payload and @state are dynamic modules where fields are optional CLI arguments.
    // Missing fields should default to null rather than throwing an error.
    if (source === '@payload' || source === '@state') {
      return;
    }

    const imports = directive.values?.imports ?? [];
    for (const importItem of imports) {
      const name = (importItem as any)?.identifier;
      if (typeof name !== 'string') {
        continue;
      }
      if (!exportKeySet.has(name)) {
        throw new MlldImportError(`Import '${name}' not found in module '${source ?? 'import'}'`, {
          code: 'IMPORT_EXPORT_MISSING',
          details: { source, missing: name }
        });
      }
    }
  }
}

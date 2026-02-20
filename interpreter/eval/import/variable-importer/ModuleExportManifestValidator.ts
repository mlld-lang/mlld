import { MlldImportError } from '@core/errors';
import type { Variable } from '@core/types/variable';
import type { ExportManifest } from '../ExportManifest';

export interface ModuleExportPlan {
  explicitExports: Set<string> | null;
  guardNames: string[];
}

export class ModuleExportManifestValidator {
  resolveExportPlan(
    childVars: Map<string, Variable>,
    manifest?: ExportManifest | null
  ): ModuleExportPlan {
    const manifestEntries = manifest?.hasEntries() ? manifest.getEntries() : [];
    const variableEntries = manifestEntries.filter(entry => entry.kind !== 'guard');
    const guardEntries = manifestEntries.filter(entry => entry.kind === 'guard');
    const explicitNames = variableEntries.length > 0 ? variableEntries.map(entry => entry.name) : null;

    if (explicitNames && explicitNames.length > 0) {
      for (const name of explicitNames) {
        if (!childVars.has(name)) {
          const location = manifest?.getLocation(name);
          throw new MlldImportError(
            `Exported name '${name}' is not defined in this module`,
            {
              code: 'EXPORTED_NAME_NOT_FOUND',
              context: {
                exportName: name,
                location
              },
              details: {
                filePath: location?.filePath,
                variableName: name
              }
            }
          );
        }
      }
    }

    return {
      explicitExports: explicitNames ? new Set(explicitNames) : null,
      guardNames: guardEntries.map(entry => entry.name)
    };
  }
}

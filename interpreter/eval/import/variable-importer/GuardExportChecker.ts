import { MlldImportError } from '@core/errors';
import type { Environment } from '@interpreter/env/Environment';
import type { SerializedGuardDefinition } from '@interpreter/guards';
import type { ExportManifest } from '../ExportManifest';

export class GuardExportChecker {
  validateGuardExports(
    guardNames: string[],
    childEnv?: Environment,
    manifest?: ExportManifest | null
  ): void {
    if (guardNames.length === 0) {
      return;
    }

    if (!childEnv) {
      throw new MlldImportError('Guard exports require a child environment', {
        code: 'GUARD_EXPORT_CONTEXT',
        details: { guards: guardNames }
      });
    }

    for (const guardName of guardNames) {
      const definition = childEnv.getGuardRegistry().getByName(guardName);
      if (definition) {
        continue;
      }
      const location = manifest?.getLocation(guardName);
      throw new MlldImportError(`Exported guard '${guardName}' is not defined in this module`, {
        code: 'EXPORTED_GUARD_NOT_FOUND',
        context: {
          guardName,
          location
        },
        details: {
          filePath: location?.filePath,
          variableName: guardName
        }
      });
    }
  }

  serializeGuardsByName(
    guardNames: string[],
    childEnv?: Environment
  ): SerializedGuardDefinition[] {
    if (guardNames.length === 0 || !childEnv) {
      return [];
    }
    const capturedModuleEnv = childEnv.captureModuleEnvironment();
    return childEnv
      .serializeGuardsByNames(guardNames)
      .map(definition => ({ ...definition, capturedModuleEnv }));
  }
}

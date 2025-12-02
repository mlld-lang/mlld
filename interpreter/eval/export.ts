import type { ExportDirectiveNode } from '@core/types';
import type { VariableReferenceNode } from '@core/types/variable';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { ExportManifest, type ExportManifestEntry } from './import/ExportManifest';
import { astLocationToSourceLocation } from '@core/types';

export async function evaluateExport(
  directive: ExportDirectiveNode,
  env: Environment
): Promise<EvalResult> {
  const exportNodes = (directive.values?.exports ?? []) as VariableReferenceNode[];

    const filePath = env.getCurrentFilePath();
    const entries: ExportManifestEntry[] = [];
    let hasWildcard = false;
    const guardRegistry = env.getGuardRegistry();

    for (const node of exportNodes) {
      const identifier = node?.identifier ?? '';
      if (!identifier) continue;

      if (identifier === '*') {
        hasWildcard = true;
        continue;
      }

      const location = astLocationToSourceLocation(node?.location, filePath);
      const isGuard = guardRegistry.getByName(identifier) !== undefined;
      const kind = isGuard ? 'guard' : 'variable';
      entries.push({ name: identifier, location, kind });
    }

    if (hasWildcard) {
      // Reset the manifest so downstream logic falls back to the auto-export path.
      env.setExportManifest(null);
      return { value: undefined, env };
    }

    if (entries.length === 0) {
      return { value: undefined, env };
    }

    let manifest = env.getExportManifest();
    if (!manifest) {
      // Lazily create the manifest the first time /export appears in the module.
      manifest = new ExportManifest();
      env.setExportManifest(manifest);
    }

  manifest.add(entries);

  const emitter = env as any;
  if (typeof emitter.emitSDKEvent === 'function') {
    for (const entry of entries) {
      emitter.emitSDKEvent({
        type: 'debug:export:registered',
        name: entry.name,
        timestamp: Date.now()
      });
    }
  }

  return { value: undefined, env };
}

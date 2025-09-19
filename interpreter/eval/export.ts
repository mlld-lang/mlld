import type { ExportDirectiveNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { ExportManifest } from './import/ExportManifest';

export async function evaluateExport(
  directive: ExportDirectiveNode,
  env: Environment
): Promise<EvalResult> {
  const exportNodes = directive.values?.exports ?? [];

  const names = exportNodes
    .map((node) => node?.identifier)
    .filter((identifier): identifier is string => typeof identifier === 'string' && identifier.length > 0);

  if (names.length === 0) {
    return { value: undefined, env };
  }

  const hasWildcard = names.includes('*');

  if (hasWildcard) {
    env.setExportManifest(null);
    return { value: undefined, env };
  }

  let manifest = env.getExportManifest();
  if (!manifest) {
    manifest = new ExportManifest();
    env.setExportManifest(manifest);
  }

  manifest.add(names);

  return { value: undefined, env };
}

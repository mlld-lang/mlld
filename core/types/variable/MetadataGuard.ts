import type { Variable, VariableMetadata } from './VariableTypes';

const LEGACY_METADATA_SYMBOL = Symbol('mlld.VariableLegacyMetadata');
const METADATA_WARNED_SYMBOL = Symbol('mlld.VariableMetadataWarned');

const METADATA_DEPRECATION_MESSAGE =
  'Variable.metadata has been replaced with .ctx (user-facing) and .internal (implementation). ' +
  'Update your code:\n' +
  '  - .metadata.security.labels → .ctx.labels\n' +
  '  - .metadata.loadResult.filename → .ctx.filename\n' +
  '  - .metadata.executableDef → .internal.executableDef';

function getGuardMode(): 'off' | 'warn' | 'error' {
  const raw = process.env.MLLD_METADATA_GUARD?.toLowerCase();
  if (raw === 'error') return 'error';
  if (raw === 'warn') return 'warn';
  return 'off';
}

function handleLegacyAccess(variable: Variable): void {
  const mode = getGuardMode();
  if (mode === 'off') {
    return;
  }
  if (mode === 'error') {
    throw new Error(METADATA_DEPRECATION_MESSAGE);
  }
  if ((variable as Record<string, unknown>)[METADATA_WARNED_SYMBOL]) {
    return;
  }
  (variable as Record<string, unknown>)[METADATA_WARNED_SYMBOL] = true;
  // eslint-disable-next-line no-console
  console.warn(METADATA_DEPRECATION_MESSAGE);
}

export function attachMetadataGuard(variable: Variable): void {
  if ((variable as Record<string, unknown>)[LEGACY_METADATA_SYMBOL]) {
    return;
  }

  let legacyStore: VariableMetadata = variable.metadata ?? {};
  Object.defineProperty(variable, 'metadata', {
    configurable: true,
    enumerable: false,
    get() {
      handleLegacyAccess(variable);
      return legacyStore;
    },
    set(value: VariableMetadata | undefined) {
      handleLegacyAccess(variable);
      legacyStore = value ?? {};
    }
  });
  (variable as Record<string, unknown>)[LEGACY_METADATA_SYMBOL] = () => legacyStore;
}

export function readLegacyMetadata(variable: Variable): VariableMetadata | undefined {
  const accessor = (variable as Record<string, unknown>)[LEGACY_METADATA_SYMBOL];
  if (typeof accessor === 'function') {
    return (accessor as () => VariableMetadata)();
  }
  return undefined;
}


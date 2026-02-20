import { describe, expect, it, vi } from 'vitest';
import type { DirectiveNode } from '@core/types';
import type { SerializedGuardDefinition } from '@interpreter/guards';
import { ImportTypeRouter } from './ImportTypeRouter';

function createDirective(subtype: DirectiveNode['subtype']): DirectiveNode {
  return {
    type: 'Directive',
    nodeId: 'import',
    kind: 'import',
    subtype,
    source: undefined,
    values: {},
    raw: {},
    location: {
      start: { offset: 0, line: 1, column: 1 },
      end: { offset: 6, line: 1, column: 7 }
    },
    meta: {}
  };
}

describe('ImportTypeRouter', () => {
  it('keeps namespace and policy dispatch behavior stable', async () => {
    const router = new ImportTypeRouter();
    const handleNamespaceImport = vi.fn().mockResolvedValue(undefined);
    const handleSelectedImport = vi.fn().mockResolvedValue(undefined);
    const registerSerializedGuards = vi.fn();

    await router.route(createDirective('importPolicy'), [], {
      handleNamespaceImport,
      handleSelectedImport,
      registerSerializedGuards
    });
    await router.route(createDirective('importNamespace'), [], {
      handleNamespaceImport,
      handleSelectedImport,
      registerSerializedGuards
    });

    expect(handleNamespaceImport).toHaveBeenCalledTimes(2);
    expect(handleSelectedImport).not.toHaveBeenCalled();
    expect(registerSerializedGuards).not.toHaveBeenCalled();
  });

  it('keeps selected import dispatch and guard registration wiring stable', async () => {
    const router = new ImportTypeRouter();
    const handleNamespaceImport = vi.fn().mockResolvedValue(undefined);
    const handleSelectedImport = vi.fn().mockResolvedValue(undefined);
    const registerSerializedGuards = vi.fn();
    const guardDefinitions = [{ name: 'moduleGuard' }] as unknown as SerializedGuardDefinition[];

    await router.route(createDirective('importSelected'), guardDefinitions, {
      handleNamespaceImport,
      handleSelectedImport,
      registerSerializedGuards
    });

    expect(handleNamespaceImport).not.toHaveBeenCalled();
    expect(handleSelectedImport).toHaveBeenCalledTimes(1);
    expect(registerSerializedGuards).toHaveBeenCalledWith(guardDefinitions);
  });

  it('keeps wildcard import error semantics stable', async () => {
    const router = new ImportTypeRouter();
    const handleNamespaceImport = vi.fn().mockResolvedValue(undefined);
    const handleSelectedImport = vi.fn().mockResolvedValue(undefined);
    const registerSerializedGuards = vi.fn();

    await expect(
      router.route(createDirective('importAll'), undefined, {
        handleNamespaceImport,
        handleSelectedImport,
        registerSerializedGuards
      })
    ).rejects.toThrow(/Wildcard imports .* no longer supported/i);
  });

  it('keeps unknown subtype error semantics stable', async () => {
    const router = new ImportTypeRouter();
    const handleNamespaceImport = vi.fn().mockResolvedValue(undefined);
    const handleSelectedImport = vi.fn().mockResolvedValue(undefined);
    const registerSerializedGuards = vi.fn();
    const directive = createDirective('importNamespace');
    (directive as { subtype: string }).subtype = 'importCustom';

    await expect(
      router.route(directive, undefined, {
        handleNamespaceImport,
        handleSelectedImport,
        registerSerializedGuards
      })
    ).rejects.toThrow('Unknown import subtype: importCustom');
  });
});

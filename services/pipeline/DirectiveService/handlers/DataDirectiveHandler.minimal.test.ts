import { describe, it, expect, beforeEach } from 'vitest';
import { DataDirectiveHandler } from './DataDirectiveHandler.minimal';
import { StateService } from '@services/state/StateService/StateService';
import type { DirectiveNode } from '@core/ast/types';

describe('DataDirectiveHandler (Minimal)', () => {
  let handler: DataDirectiveHandler;
  let state: StateService;

  beforeEach(() => {
    state = new StateService();
    handler = new DataDirectiveHandler();
  });

  it('should handle simple data value', async () => {
    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'data',
      raw: {
        identifier: 'port'
      },
      values: {
        value: 3000
      }
    } as any;

    const result = await handler.handle(directive, state, {
      strict: false
    });

    expect(result.stateChanges?.variables?.port).toMatchObject({
      name: 'port',
      value: 3000,
      type: 'data'
    });
  });

  it('should handle object data', async () => {
    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'data',
      raw: {
        identifier: 'config'
      },
      values: {
        value: {
          host: 'localhost',
          port: 8080,
          ssl: true
        }
      }
    } as any;

    const result = await handler.handle(directive, state, {
      strict: false
    });

    expect(result.stateChanges?.variables?.config?.value).toEqual({
      host: 'localhost',
      port: 8080,
      ssl: true
    });
  });

  it('should handle array data', async () => {
    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'data',
      raw: {
        identifier: 'items'
      },
      values: {
        value: ['apple', 'banana', 'orange']
      }
    } as any;

    const result = await handler.handle(directive, state, {
      strict: false
    });

    expect(result.stateChanges?.variables?.items?.value).toEqual([
      'apple', 'banana', 'orange'
    ]);
  });

  it('should handle null and boolean values', async () => {
    const nullDirective: DirectiveNode = {
      type: 'directive',
      kind: 'data',
      raw: {
        identifier: 'nullValue'
      },
      values: {
        value: null
      }
    } as any;

    const boolDirective: DirectiveNode = {
      type: 'directive',
      kind: 'data',
      raw: {
        identifier: 'isEnabled'
      },
      values: {
        value: true
      }
    } as any;

    const nullResult = await handler.handle(nullDirective, state, { strict: false });
    const boolResult = await handler.handle(boolDirective, state, { strict: false });

    expect(nullResult.stateChanges?.variables?.nullValue?.value).toBeNull();
    expect(boolResult.stateChanges?.variables?.isEnabled?.value).toBe(true);
  });

  it('should throw error for missing identifier', async () => {
    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'data',
      raw: {},
      values: {
        value: 123
      }
    } as any;

    await expect(
      handler.handle(directive, state, { strict: false })
    ).rejects.toThrow('Data directive missing identifier');
  });

  it('should throw error for missing value', async () => {
    const directive: DirectiveNode = {
      type: 'directive',
      kind: 'data',
      raw: {
        identifier: 'test'
      },
      values: {}
    } as any;

    await expect(
      handler.handle(directive, state, { strict: false })
    ).rejects.toThrow('Data directive missing data value');
  });
});
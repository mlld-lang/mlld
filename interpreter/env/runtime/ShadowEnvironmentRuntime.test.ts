import { describe, expect, it } from 'vitest';
import { ShadowEnvironmentRuntime } from './ShadowEnvironmentRuntime';

function createPathProvider(filePath = '/tmp/mlld-shadow/main.mld') {
  return {
    getFileDirectory: () => '/tmp/mlld-shadow',
    getCurrentFilePath: () => filePath
  };
}

describe('ShadowEnvironmentRuntime', () => {
  it('stores language shadow environments and resolves parent fallback', () => {
    const parent = new ShadowEnvironmentRuntime(createPathProvider('/tmp/parent.mld'));
    const child = new ShadowEnvironmentRuntime(createPathProvider('/tmp/child.mld'), parent);

    const jsFn = () => 'js';
    parent.setShadowEnv('js', new Map([['jsFn', jsFn]]));

    const jsEnv = child.getShadowEnv('js');
    expect(jsEnv?.get('jsFn')).toBe(jsFn);
    expect(child.getCurrentFilePath()).toBe('/tmp/child.mld');
  });

  it('manages node and python alias captures consistently', () => {
    const runtime = new ShadowEnvironmentRuntime(createPathProvider());
    const nodeFn = () => 'node';
    const pyFn = () => 'py';

    runtime.setShadowEnv('node', new Map([['nodeFn', nodeFn]]));
    runtime.setShadowEnv('python', new Map([['pyFn', pyFn]]));

    const nodeEnv = runtime.getShadowEnv('node');
    expect(nodeEnv?.get('nodeFn')).toBe(nodeFn);

    const capture = runtime.captureAllShadowEnvs();
    expect(capture.node?.get('nodeFn')).toBe(nodeFn);
    expect(capture.nodejs).toBe(capture.node);
    expect(capture.python?.get('pyFn')).toBe(pyFn);
    expect(capture.py).toBe(capture.python);
  });

  it('reuses parent node/python environments for child getOrCreate calls', () => {
    const parent = new ShadowEnvironmentRuntime(createPathProvider('/tmp/parent.mld'));
    const child = new ShadowEnvironmentRuntime(createPathProvider('/tmp/child.mld'), parent);

    const parentNode = parent.getOrCreateNodeShadowEnv();
    const parentPython = parent.getOrCreatePythonShadowEnv();

    expect(child.getOrCreateNodeShadowEnv()).toBe(parentNode);
    expect(child.getOrCreatePythonShadowEnv()).toBe(parentPython);
  });

  it('reports shadow-env presence and clears all state on cleanup', () => {
    const runtime = new ShadowEnvironmentRuntime(createPathProvider());
    runtime.setShadowEnv('js', new Map([['fn', () => 'ok']]));
    runtime.setShadowEnv('node', new Map([['nodeFn', () => 'node']]));

    expect(runtime.hasShadowEnvs()).toBe(true);
    runtime.cleanup();
    expect(runtime.hasShadowEnvs()).toBe(false);
    expect(runtime.getShadowEnv('js')).toBeUndefined();
  });
});

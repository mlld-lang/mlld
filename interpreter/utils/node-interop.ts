import { builtinModules, createRequire } from 'module';
import * as path from 'path';
import { pathToFileURL } from 'url';
import type { Environment } from '@interpreter/env/Environment';
import type {
  ExecutableDefinition,
  NodeClassExecutable,
  NodeFunctionExecutable
} from '@core/types/executable';
import { isLoadContentResult } from '@core/types/load-content';
import { isExecutableVariable } from '@core/types/variable';
import { isStructuredValue, wrapStructured } from './structured-value';

type WrapOptions = {
  name?: string;
  moduleName?: string;
  thisArg?: unknown;
  warnOnCallback?: boolean;
};

export type NodeModuleResolution = {
  module: unknown;
  spec: string;
  resolvedPath?: string;
};

const builtinSet = new Set(builtinModules);
const requireCache = new Map<string, ReturnType<typeof createRequire>>();
const proxyCache = new WeakMap<object, object>();
const proxyTargets = new WeakMap<object, object>();
const callbackWarned = new WeakSet<Function>();

function getNodeBaseDir(env: Environment): string {
  const fileDir = env.getFileDirectory?.();
  if (fileDir) {
    return fileDir;
  }
  return env.getBasePath?.() ?? process.cwd();
}

function getRequire(baseDir: string): ReturnType<typeof createRequire> {
  const cached = requireCache.get(baseDir);
  if (cached) {
    return cached;
  }
  const requireBase = path.join(baseDir, 'mlld-node-import.cjs');
  const req = createRequire(requireBase);
  requireCache.set(baseDir, req);
  return req;
}

function isBuiltin(spec: string): boolean {
  return builtinSet.has(spec) || builtinSet.has(`node:${spec}`);
}

function stripLeadingAt(spec: string): string {
  return spec.startsWith('@') ? spec.slice(1) : spec;
}

function resolveModuleSpec(
  spec: string,
  req: ReturnType<typeof createRequire>,
  baseDir: string
): { spec: string; resolvedPath?: string } {
  try {
    return {
      spec,
      resolvedPath: req.resolve(spec, { paths: [baseDir] })
    };
  } catch {
    const stripped = stripLeadingAt(spec);
    if (stripped !== spec) {
      try {
        return {
          spec: stripped,
          resolvedPath: req.resolve(stripped, { paths: [baseDir] })
        };
      } catch {
        return { spec };
      }
    }
    return { spec };
  }
}

function shouldTryImport(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  return code === 'ERR_REQUIRE_ESM' || code === 'ERR_UNKNOWN_FILE_EXTENSION';
}

export async function resolveNodeModule(
  spec: string,
  env: Environment
): Promise<NodeModuleResolution> {
  const baseDir = getNodeBaseDir(env);
  const req = getRequire(baseDir);
  const { spec: resolvedSpec, resolvedPath } = resolveModuleSpec(spec, req, baseDir);

  try {
    return {
      module: req(resolvedSpec),
      spec: resolvedSpec,
      resolvedPath
    };
  } catch (error) {
    if (!shouldTryImport(error)) {
      throw error;
    }
    const importTarget =
      resolvedPath && !isBuiltin(resolvedSpec)
        ? pathToFileURL(resolvedPath).href
        : resolvedSpec;
    return {
      module: await import(importTarget),
      spec: resolvedSpec,
      resolvedPath
    };
  }
}

export function normalizeNodeModuleExports(module: unknown): Record<string, unknown> {
  if (module && typeof module === 'object') {
    const exports = { ...(module as Record<string, unknown>) };
    if ('default' in exports) {
      const def = (exports as Record<string, unknown>).default;
      if (typeof def === 'function' && def.name && !(def.name in exports)) {
        exports[def.name] = def;
      }
    }
    return exports;
  }

  const exports: Record<string, unknown> = { default: module };
  if (typeof module === 'function' && module.name) {
    exports[module.name] = module;
  }
  return exports;
}

function extractParamNames(fn: Function): string[] {
  const source = Function.prototype.toString.call(fn);
  const arrowMatch = source.match(/^\s*(?:async\s*)?([A-Za-z_$][\w$]*)\s*=>/);
  if (arrowMatch) {
    return [arrowMatch[1]];
  }
  const listMatch = source.match(/^[^(]*\(([^)]*)\)/);
  if (!listMatch) {
    return [];
  }
  return listMatch[1]
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => part.replace(/=.*$/, '').replace(/^[.]{3}/, '').trim())
    .filter(Boolean);
}

export function warnCallbackPattern(fn: Function, name: string): void {
  if (callbackWarned.has(fn)) {
    return;
  }
  const params = extractParamNames(fn);
  if (params.some(param => /^(callback|cb|done|next|handler)$/i.test(param))) {
    callbackWarned.add(fn);
    console.warn(
      `Warning: '${name}' uses callback-style parameters. Prefer promise-based APIs when available.`
    );
  }
}

function isClassLike(fn: Function): boolean {
  const source = Function.prototype.toString.call(fn);
  if (/^\s*class\s/.test(source)) {
    return true;
  }
  const prototype = (fn as { prototype?: Record<string, unknown> }).prototype;
  if (!prototype || typeof prototype !== 'object') {
    return false;
  }
  const protoKeys = Object.getOwnPropertyNames(prototype);
  return protoKeys.length > 1;
}

function createExecutableExport(
  execDef: ExecutableDefinition
): Record<string, unknown> {
  return {
    __executable: true,
    value: execDef,
    executableDef: execDef,
    paramNames: execDef.paramNames
  };
}

function createNodeFunctionExecutable(
  fn: (...args: unknown[]) => unknown,
  name: string,
  moduleName?: string,
  thisArg?: unknown
): Record<string, unknown> {
  const paramNames = extractParamNames(fn);
  const execDef: NodeFunctionExecutable = {
    type: 'nodeFunction',
    name,
    fn,
    thisArg,
    moduleName,
    paramNames,
    sourceDirective: 'exec'
  };
  return createExecutableExport(execDef);
}

function createNodeClassExecutable(
  ctor: new (...args: unknown[]) => unknown,
  name: string,
  moduleName?: string
): Record<string, unknown> {
  const paramNames = extractParamNames(ctor as unknown as Function);
  const execDef: NodeClassExecutable = {
    type: 'nodeClass',
    name,
    constructorFn: ctor,
    moduleName,
    paramNames,
    sourceDirective: 'exec'
  };
  return createExecutableExport(execDef);
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as { then?: unknown }).then === 'function'
  );
}

export function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function'
  );
}

export function isEventEmitter(value: unknown): boolean {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as { on?: unknown }).on === 'function' &&
      typeof (value as { emit?: unknown }).emit === 'function'
  );
}

export function isLegacyStream(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }
  if (isAsyncIterable(value)) {
    return false;
  }
  return Boolean(
    typeof (value as { pipe?: unknown }).pipe === 'function' &&
      typeof (value as { on?: unknown }).on === 'function'
  );
}

export function isNodeProxy(value: unknown): value is object {
  return Boolean(value && typeof value === 'object' && proxyTargets.has(value as object));
}

function unwrapNodeProxy(value: object): object {
  return proxyTargets.get(value) ?? value;
}

function wrapNodeObject(target: object, options?: WrapOptions): object {
  const existing = proxyCache.get(target);
  if (existing) {
    return existing;
  }
  if (isNodeProxy(target)) {
    return target;
  }
  const proxy = new Proxy(target, {
    get(obj, prop) {
      if (typeof prop === 'symbol') {
        return Reflect.get(obj, prop, obj);
      }
      const value = Reflect.get(obj, prop, obj);
      const name = typeof prop === 'string' ? prop : undefined;
      return wrapNodeValue(value, {
        name,
        moduleName: options?.moduleName,
        thisArg: obj
      });
    }
  });
  proxyCache.set(target, proxy);
  proxyTargets.set(proxy, target);
  return proxy;
}

function isVariableLike(value: unknown): value is { type: string; name: string; value: unknown } {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'type' in value &&
      'name' in value &&
      'value' in value
  );
}

export function wrapNodeExport(value: unknown, options?: WrapOptions): unknown {
  return wrapNodeValue(value, { ...options, warnOnCallback: true });
}

export function wrapNodeValue(value: unknown, options?: WrapOptions): unknown {
  if (value === undefined) {
    return '';
  }
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'function') {
    const name = options?.name || value.name || 'anonymous';
    if (options?.warnOnCallback) {
      warnCallbackPattern(value, name);
    }
    if (isClassLike(value)) {
      return createNodeClassExecutable(value as new (...args: unknown[]) => unknown, name, options?.moduleName);
    }
    return createNodeFunctionExecutable(value, name, options?.moduleName, options?.thisArg);
  }
  if (value && typeof value === 'object') {
    if ((value as { __executable?: boolean }).__executable) {
      return value;
    }
    if (isStructuredValue(value)) {
      return value;
    }
    if (isLoadContentResult(value)) {
      return value;
    }
    if (isAsyncIterable(value)) {
      return wrapStructured(value, 'stream', '');
    }
    if (Array.isArray(value)) {
      return value.map(item => wrapNodeValue(item, options));
    }
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
      return value.toString();
    }
    if (isPromiseLike(value)) {
      return value;
    }
    return wrapNodeObject(value, options);
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function toJsValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (isNodeProxy(value)) {
    return unwrapNodeProxy(value as object);
  }
  if (isStructuredValue(value)) {
    return value.data;
  }
  if (isLoadContentResult(value)) {
    return value.content;
  }
  if (Array.isArray(value)) {
    return value.map(item => toJsValue(item));
  }
  if (isVariableLike(value)) {
    if (isExecutableVariable(value as any)) {
      throw new Error('Executable values are not valid node arguments');
    }
    return toJsValue((value as { value: unknown }).value);
  }
  if (value && typeof value === 'object') {
    if ((value as { __executable?: boolean }).__executable) {
      throw new Error('Executable values are not valid node arguments');
    }
    if (isPlainObject(value)) {
      const result: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(value)) {
        result[key] = toJsValue(entry);
      }
      return result;
    }
  }
  return value;
}

import * as path from 'path';
import type { IFileSystemService } from '@services/fs/IFileSystemService';

type StateObject = Record<string, unknown>;

export async function parseStateOptions(
  stateArgs: string[],
  fileSystem: IFileSystemService,
  basePath: string = process.cwd()
): Promise<StateObject> {
  const state: StateObject = {};

  for (const rawArg of stateArgs) {
    const parsed = await parseStateArg(rawArg, fileSystem, basePath);
    Object.assign(state, parsed);
  }

  return state;
}

async function parseStateArg(
  rawArg: string,
  fileSystem: IFileSystemService,
  basePath: string
): Promise<StateObject> {
  if (!rawArg) {
    throw new Error('--state requires a value');
  }

  if (rawArg.startsWith('@')) {
    const filePath = path.resolve(basePath, rawArg.slice(1));
    const content = await fileSystem.readFile(filePath);
    return parseStateObject(content, `--state ${rawArg}`);
  }

  if (rawArg.trim().startsWith('{')) {
    return parseStateObject(rawArg, '--state');
  }

  const eqIndex = rawArg.indexOf('=');
  if (eqIndex === -1) {
    throw new Error(
      `Invalid --state format: "${rawArg}". Expected @file.json, KEY=VALUE, or JSON object`
    );
  }

  const key = rawArg.slice(0, eqIndex).trim();
  if (!key) {
    throw new Error(`Invalid --state key in "${rawArg}"`);
  }

  return { [key]: rawArg.slice(eqIndex + 1) };
}

function parseStateObject(input: string, label: string): StateObject {
  let parsed: unknown;

  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error(`Invalid JSON in ${label}`);
  }

  if (!isPlainObject(parsed)) {
    throw new Error(`${label} must resolve to a JSON object`);
  }

  return parsed;
}

function isPlainObject(value: unknown): value is StateObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

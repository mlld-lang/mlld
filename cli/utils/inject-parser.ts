/**
 * Parse --inject flag values into dynamic modules for the interpreter.
 *
 * Formats supported:
 *   --inject @module={"key":"value"}    Inline JSON object
 *   --inject @module=[1,2,3]            Inline JSON array
 *   --inject @module=@file.json         Load JSON from file
 *   --inject @module="plain string"     Plain string value
 */

import type { IFileSystemService } from '@services/fs/IFileSystemService';
import * as path from 'path';

export type DynamicModuleMap = Record<string, string | Record<string, unknown> | unknown[]>;

export async function parseInjectOptions(
  injectArgs: string[],
  fileSystem: IFileSystemService,
  basePath: string = process.cwd()
): Promise<DynamicModuleMap> {
  const dynamicModules: DynamicModuleMap = {};

  for (const arg of injectArgs) {
    const eqIndex = arg.indexOf('=');
    if (eqIndex === -1) {
      throw new Error(`Invalid --inject format: "${arg}". Expected @name=value`);
    }

    const key = arg.slice(0, eqIndex);
    const value = arg.slice(eqIndex + 1);

    if (!key.startsWith('@')) {
      throw new Error(`Invalid --inject key: "${key}". Must start with @`);
    }

    // File reference: @module=@file.json
    if (value.startsWith('@')) {
      const filePath = path.resolve(basePath, value.slice(1));
      const content = await fileSystem.readFile(filePath, 'utf8');
      try {
        dynamicModules[key] = JSON.parse(content);
      } catch {
        // Not valid JSON, treat as mlld source
        dynamicModules[key] = content;
      }
      continue;
    }

    // Inline JSON object or array
    if (value.startsWith('{') || value.startsWith('[')) {
      try {
        dynamicModules[key] = JSON.parse(value);
        continue;
      } catch {
        throw new Error(`Invalid JSON in --inject "${key}": ${value.slice(0, 50)}...`);
      }
    }

    // Plain string or mlld source
    dynamicModules[key] = value;
  }

  return dynamicModules;
}

export interface ParsedModuleName {
  name: string;
  version?: string;
}

export function splitModuleNameVersion(rawName: string): ParsedModuleName {
  if (!rawName) {
    return { name: rawName };
  }

  let name = rawName.startsWith('mlld://')
    ? rawName.slice('mlld://'.length)
    : rawName;

  const lastAt = name.lastIndexOf('@');
  const slashIndex = name.indexOf('/');
  const hasVersion = lastAt > 0 && slashIndex >= 0 && lastAt > slashIndex;

  if (hasVersion) {
    const version = name.slice(lastAt + 1).trim();
    name = name.slice(0, lastAt);
    return {
      name,
      version: version.length > 0 ? version : undefined
    };
  }

  return { name };
}

export function normalizeModuleName(rawName: string): string {
  const { name } = splitModuleNameVersion(rawName);
  if (!name) {
    return name;
  }
  return name.startsWith('@') ? name : `@${name}`;
}

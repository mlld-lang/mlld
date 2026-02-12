export function serializeShadowEnvironmentMaps(envs: unknown): Record<string, Record<string, unknown>> {
  if (!envs || typeof envs !== 'object' || Array.isArray(envs)) {
    return {};
  }

  const result: Record<string, Record<string, unknown>> = {};
  for (const [lang, shadowMap] of Object.entries(envs as Record<string, unknown>)) {
    if (!(shadowMap instanceof Map) || shadowMap.size === 0) {
      continue;
    }

    const serialized: Record<string, unknown> = {};
    for (const [name, value] of shadowMap) {
      serialized[name as string] = value;
    }
    result[lang] = serialized;
  }

  return result;
}

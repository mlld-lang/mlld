export interface McpParamInfo {
  paramNames: string[];
  paramTypes: Record<string, string>;
  paramNullable: Record<string, boolean>;
  requiredParams: string[];
}

interface InputSchemaLike {
  properties?: Record<string, unknown>;
  required?: string[] | readonly string[];
}

export function deriveMcpParamInfo(inputSchema: InputSchemaLike | undefined): McpParamInfo {
  const properties = (inputSchema?.properties ?? {}) as Record<string, unknown>;
  const required = Array.isArray(inputSchema?.required) ? (inputSchema!.required as string[]) : [];
  const allParams = Object.keys(properties);
  const optional = allParams.filter(name => !required.includes(name));
  const paramNames = [...required, ...optional];
  const paramTypes: Record<string, string> = {};
  const paramNullable: Record<string, boolean> = {};

  for (const [name, schema] of Object.entries(properties)) {
    paramTypes[name] = extractSchemaType(schema);
    paramNullable[name] = isNullableSchema(schema);
  }

  return { paramNames, paramTypes, paramNullable, requiredParams: [...required] };
}

/**
 * Coerce argument values to match the types declared in a tool's inputSchema.
 * LLMs frequently produce string representations of non-string types,
 * comma-separated strings instead of arrays, "null" strings, etc.
 */
export function coerceMcpArgs(
  payload: Record<string, unknown>,
  paramInfo: McpParamInfo
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const { paramTypes, paramNullable, requiredParams } = paramInfo;
  const requiredSet = new Set(requiredParams);

  for (const [key, value] of Object.entries(payload)) {
    if (value === null || value === undefined) {
      continue;
    }
    if (typeof value === 'string' && value.trim() === 'null') {
      continue;
    }
    if (typeof value === 'string' && value.trim() === '') {
      const schemaType = paramTypes[key];
      if (schemaType === 'array') {
        result[key] = [];
        continue;
      }
      if (paramNullable[key] || !requiredSet.has(key)) {
        continue;
      }
    }
    const schemaType = paramTypes[key];
    if (!schemaType || schemaType === 'string') {
      result[key] = value;
      continue;
    }
    result[key] = coerceValue(value, schemaType);
  }
  return result;
}

function coerceValue(value: unknown, schemaType: string): unknown {
  if (value === undefined || value === null) {
    return value;
  }

  switch (schemaType) {
    case 'array':
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length === 0) return [];
        if (trimmed.startsWith('[')) {
          try { return JSON.parse(trimmed); } catch { /* fall through */ }
        }
        if (trimmed.includes(',')) {
          return trimmed.split(',').map(s => s.trim());
        }
        return [value];
      }
      return [value];

    case 'integer':
    case 'number': {
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
        const n = schemaType === 'integer' ? parseInt(value, 10) : parseFloat(value);
        if (!isNaN(n)) return n;
      }
      return value;
    }

    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        if (value.toLowerCase() === 'true') return true;
        if (value.toLowerCase() === 'false') return false;
      }
      return value;

    case 'null':
      if (typeof value === 'string' && value.toLowerCase() === 'null') return null;
      return value;

    case 'object':
      if (typeof value === 'object' && !Array.isArray(value)) return value;
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.startsWith('{')) {
          try { return JSON.parse(trimmed); } catch { /* fall through */ }
        }
      }
      return value;

    default:
      return value;
  }
}

function extractSchemaType(schema: unknown): string {
  const obj = schema as Record<string, unknown> | undefined;
  if (typeof obj?.type === 'string') {
    return (obj.type as string).toLowerCase();
  }
  if (Array.isArray(obj?.anyOf)) {
    const nonNull = (obj!.anyOf as Array<Record<string, unknown>>).find(s => s?.type && s.type !== 'null');
    if (typeof nonNull?.type === 'string') return nonNull.type.toLowerCase();
  }
  if (Array.isArray(obj?.oneOf)) {
    const nonNull = (obj!.oneOf as Array<Record<string, unknown>>).find(s => s?.type && s.type !== 'null');
    if (typeof nonNull?.type === 'string') return nonNull.type.toLowerCase();
  }
  return 'string';
}

function isNullableSchema(schema: unknown): boolean {
  const obj = schema as Record<string, unknown> | undefined;
  if (Array.isArray(obj?.anyOf)) {
    return (obj!.anyOf as Array<Record<string, unknown>>).some(s => s?.type === 'null');
  }
  if (Array.isArray(obj?.oneOf)) {
    return (obj!.oneOf as Array<Record<string, unknown>>).some(s => s?.type === 'null');
  }
  return false;
}

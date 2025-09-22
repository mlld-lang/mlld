export type StructuredValueFormat = 'json' | 'csv' | 'xml' | 'text' | 'unknown';

export interface StructuredValueOrigin {
  source: 'variable' | 'pipeline' | 'command' | 'import' | 'shadow' | 'other';
  identifier?: string;
  stage?: number;
  hint?: string;
}

interface StructuredValueDetection {
  shouldWrap: boolean;
  format: StructuredValueFormat;
  jsonKind?: 'object' | 'array' | 'primitive';
  reason?: 'hint' | 'structure' | 'primitive';
}

const JSON_PRIMITIVES = new Set(['true', 'false', 'null']);

export interface StructuredValueOptions {
  formatHint?: StructuredValueFormat;
  origin?: StructuredValueOrigin;
  allowPrimaries?: boolean;
}

export class StructuredValue {
  readonly raw: string;
  readonly format: StructuredValueFormat;
  readonly origin?: StructuredValueOrigin;
  readonly jsonKind?: 'object' | 'array' | 'primitive';
  readonly recognizedReason?: 'hint' | 'structure' | 'primitive';

  private jsonEvaluated = false;
  private jsonValue: any;
  private jsonError: Error | undefined;

  constructor(raw: string, options: StructuredValueOptions = {}) {
    this.raw = raw;
    const detection = detectStructuredValue(raw, options);
    this.format = detection.format;
    this.jsonKind = detection.jsonKind;
    this.recognizedReason = detection.reason;
    this.origin = options.origin;

    if (process.env.MLLD_DEBUG === 'true' && detection.shouldWrap) {
      const originSummary = options.origin
        ? `${options.origin.source}${options.origin.identifier ? `:${options.origin.identifier}` : ''}`
        : 'unknown';
      const preview = raw.length > 160 ? `${raw.slice(0, 160)}…` : raw;
      console.debug('[StructuredValue] recognized candidate', {
        origin: originSummary,
        format: detection.format,
        reason: detection.reason,
        kind: detection.jsonKind,
        preview
      });
    }
  }

  static create(raw: string, options: StructuredValueOptions = {}): StructuredValue {
    return new StructuredValue(raw, options);
  }

  static detect(raw: string, options: StructuredValueOptions = {}): StructuredValue | undefined {
    const detection = detectStructuredValue(raw, options);
    return detection.shouldWrap ? new StructuredValue(raw, options) : undefined;
  }

  static isStructuredValue(value: unknown): value is StructuredValue {
    return value instanceof StructuredValue;
  }

  toString(): string {
    return this.raw;
  }

  valueOf(): string {
    return this.raw;
  }

  [Symbol.toPrimitive](): string {
    return this.raw;
  }

  toJSON(): string {
    return this.raw;
  }

  get text(): string {
    return this.raw;
  }

  get data(): any {
    if (this.format === 'json') {
      return this.asJson();
    }
    return this.raw;
  }

  hasJsonCandidate(): boolean {
    return this.format === 'json' || Boolean(this.jsonKind);
  }

  asJson(): any {
    const result = this.tryParseJson();
    if (!result.ok) {
      throw result.error;
    }
    return result.value;
  }

  tryJson(): { ok: boolean; value?: any; error?: Error } {
    return this.tryParseJson();
  }

  isJsonArray(): boolean {
    const result = this.tryParseJson();
    return result.ok && Array.isArray(result.value);
  }

  isJsonObject(): boolean {
    const result = this.tryParseJson();
    return result.ok && typeof result.value === 'object' && result.value !== null && !Array.isArray(result.value);
  }

  asArray(): any[] {
    const value = this.asJson();
    if (!Array.isArray(value)) {
      throw new Error('StructuredValue contains JSON that is not an array');
    }
    return value;
  }

  entries(): Array<[string, any]> {
    const value = this.asJson();
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('StructuredValue contains JSON that is not an object');
    }
    return Object.entries(value);
  }

  getJsonParseError(): Error | undefined {
    return this.jsonError;
  }

  private tryParseJson(): { ok: boolean; value?: any; error?: Error } {
    if (!this.hasJsonCandidate()) {
      return { ok: false, error: new Error('StructuredValue is not recognized as JSON') };
    }

    if (!this.jsonEvaluated) {
      this.jsonEvaluated = true;
      try {
        const trimmed = this.raw.trim();
        this.jsonValue = JSON.parse(trimmed);
        this.jsonError = undefined;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.jsonError = err;
        if (process.env.MLLD_DEBUG === 'true') {
          const originSummary = this.origin
            ? `${this.origin.source}${this.origin.identifier ? `:${this.origin.identifier}` : ''}`
            : 'unknown';
          console.debug('[StructuredValue] JSON parse failed', {
            origin: originSummary,
            message: err.message
          });
        }
        return { ok: false, error: err };
      }
    }

    if (this.jsonError) {
      return { ok: false, error: this.jsonError };
    }

    return { ok: true, value: this.jsonValue };
  }
}

export function detectStructuredValue(raw: string, options: StructuredValueOptions = {}): StructuredValueDetection {
  const formatHint = normalizeFormatHint(options.formatHint);
  const trimmed = raw.trim();
  const allowPrimaries = options.allowPrimaries ?? formatHint === 'json';

  if (!trimmed) {
    return {
      shouldWrap: false,
      format: formatHint ?? 'text'
    };
  }

  if (formatHint === 'json') {
    return {
      shouldWrap: true,
      format: 'json',
      jsonKind: classifyStructure(trimmed) ?? classifyPrimitive(trimmed, allowPrimaries),
      reason: 'hint'
    };
  }

  const structuralKind = classifyStructure(trimmed);
  if (structuralKind) {
    return {
      shouldWrap: true,
      format: 'json',
      jsonKind: structuralKind,
      reason: 'structure'
    };
  }

  const primitiveKind = classifyPrimitive(trimmed, allowPrimaries);
  if (primitiveKind) {
    return {
      shouldWrap: true,
      format: 'json',
      jsonKind: primitiveKind,
      reason: 'primitive'
    };
  }

  return {
    shouldWrap: false,
    format: formatHint ?? 'text'
  };
}

export function looksLikeJsonStructure(raw: string): boolean {
  return classifyStructure(raw.trim()) !== undefined;
}

export function tryParseJsonStructure(raw: string): { isJson: boolean; value: any; originalValue: string } {
  const trimmed = raw.trim();
  if (!looksLikeJsonStructure(trimmed)) {
    return { isJson: false, value: raw, originalValue: raw };
  }

  try {
    return { isJson: true, value: JSON.parse(trimmed), originalValue: raw };
  } catch {
    return { isJson: false, value: raw, originalValue: raw };
  }
}

function normalizeFormatHint(formatHint?: StructuredValueFormat): StructuredValueFormat | undefined {
  if (!formatHint) return undefined;
  switch (formatHint) {
    case 'json':
    case 'csv':
    case 'xml':
    case 'text':
      return formatHint;
    default:
      return 'unknown';
  }
}

function classifyStructure(trimmed: string): 'object' | 'array' | undefined {
  if (!trimmed) return undefined;
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];

  if (first === '{' && last === '}') {
    return 'object';
  }
  if (first === '[' && last === ']') {
    return 'array';
  }
  return undefined;
}

function classifyPrimitive(trimmed: string, allowPrimaries = true): 'primitive' | undefined {
  if (!allowPrimaries) return undefined;

  if (JSON_PRIMITIVES.has(trimmed)) {
    return 'primitive';
  }

  if (/^-?\d+$/.test(trimmed)) {
    const asNumber = Number(trimmed);
    if (Number.isSafeInteger(asNumber)) {
      return 'primitive';
    }
    return undefined;
  }

  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(trimmed)) {
    return 'primitive';
  }

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return 'primitive';
  }

  return undefined;
}

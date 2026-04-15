import {
  astLocationToSourceLocation,
  type SourceLocation
} from '@core/types';
import {
  isStrictDisplayModeName,
  normalizeDisplayModeName
} from '@core/records/display-mode';
import type {
  RecordDirection,
  RecordDirectiveNode,
  RecordDefinition,
  RecordDataTrustLevel,
  RecordDisplayConfig,
  RecordDisplayDeclaration,
  RecordDisplayEntry,
  RecordFieldDefinition,
  RecordInputPolicySections,
  RecordPolicySetTarget,
  RecordRootMode,
  RecordWhenCondition,
  RecordWhenResult
} from '@core/types/record';
import { getRecordDirection } from '@core/types/record';
import type { StaticValidationIssue } from './issues';

const DEFAULT_VALIDATE_MODE = 'demote';

export interface RecordDefinitionBuildResult {
  definition?: RecordDefinition;
  issues: StaticValidationIssue[];
}

function toDirectiveLocation(
  directive: RecordDirectiveNode,
  filePath?: string
): SourceLocation | undefined {
  return astLocationToSourceLocation(directive.location, filePath);
}

function toNodeLocation(
  node: { location?: { start: any; end: any } } | undefined,
  filePath?: string
): SourceLocation | undefined {
  return astLocationToSourceLocation(node?.location, filePath);
}

function issue(
  code: string,
  message: string,
  location?: SourceLocation
): StaticValidationIssue {
  return { code, message, location };
}

function validateRecordDirection(options: {
  name: string;
  display: RecordDisplayConfig;
  hasInputOnlySections: boolean;
  location?: SourceLocation;
}): StaticValidationIssue[] {
  const { name, display, hasInputOnlySections, location } = options;
  if (display.kind !== 'open' && hasInputOnlySections) {
    return [
      issue(
        'mixed_record_direction',
        `Record '@${name}' cannot declare both display and input-only sections`,
        location
      )
    ];
  }
  return [];
}

function normalizeStringList(values: readonly unknown[] | undefined): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalized: string[] = [];
  for (const entry of values) {
    if (typeof entry !== 'string') {
      continue;
    }

    const trimmed = entry.trim();
    if (trimmed.length > 0 && !normalized.includes(trimmed)) {
      normalized.push(trimmed);
    }
  }

  return normalized;
}

function isVariableReferenceWithoutAccess(value: unknown): value is {
  type: 'VariableReference';
  identifier: string;
  fields?: unknown[];
} {
  return Boolean(
    value
    && typeof value === 'object'
    && (value as { type?: unknown }).type === 'VariableReference'
    && typeof (value as { identifier?: unknown }).identifier === 'string'
    && (!Array.isArray((value as { fields?: unknown }).fields)
      || ((value as { fields?: unknown[] }).fields?.length ?? 0) === 0)
  );
}

function extractStaticRecordPolicyLiteral(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    const extracted = value.map(entry => extractStaticRecordPolicyLiteral(entry));
    return extracted.every(entry => entry !== undefined) ? extracted : undefined;
  }

  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  if (Array.isArray(candidate.content)) {
    const extractedContent = extractStaticRecordPolicyLiteral(candidate.content);
    if (typeof extractedContent === 'string') {
      return extractedContent;
    }
    if (
      Array.isArray(extractedContent)
      && extractedContent.every(entry => typeof entry === 'string')
    ) {
      return extractedContent.join('');
    }
  }

  if (candidate.type === 'Literal') {
    return candidate.value;
  }

  if (candidate.type === 'Text') {
    return typeof candidate.content === 'string' ? candidate.content : undefined;
  }

  if (candidate.type === 'array' && Array.isArray(candidate.items)) {
    const extracted = candidate.items.map(entry => extractStaticRecordPolicyLiteral(entry));
    return extracted.every(entry => entry !== undefined) ? extracted : undefined;
  }

  return undefined;
}

function normalizePolicySetTarget(value: unknown): RecordPolicySetTarget | undefined {
  if (isVariableReferenceWithoutAccess(value)) {
    return {
      kind: 'reference',
      name: value.identifier.trim()
    };
  }

  const literal = extractStaticRecordPolicyLiteral(value);
  if (Array.isArray(literal)) {
    return {
      kind: 'array',
      values: literal
    };
  }

  return undefined;
}

function normalizePolicySetMap(options: {
  raw: unknown;
  code: 'allowlist_invalid_target' | 'blocklist_invalid_target';
  recordName: string;
  issues: StaticValidationIssue[];
  fallbackLocation?: SourceLocation;
}): Record<string, RecordPolicySetTarget> {
  if (!options.raw || typeof options.raw !== 'object' || Array.isArray(options.raw)) {
    return {};
  }

  const normalized: Record<string, RecordPolicySetTarget> = {};
  const sectionName = options.code.startsWith('allowlist') ? 'allowlist' : 'blocklist';

  for (const [fieldName, rawTarget] of Object.entries(options.raw as Record<string, unknown>)) {
    const target = normalizePolicySetTarget(rawTarget);
    if (!target) {
      options.issues.push(issue(
        options.code,
        `Record '@${options.recordName}' ${sectionName} target for field '${fieldName}' must be a record reference or array`,
        options.fallbackLocation
      ));
      continue;
    }
    normalized[fieldName] = target;
  }

  return normalized;
}

function buildRecordInputPolicySections(options: {
  directive: RecordDirectiveNode;
  recordName: string;
  issues: StaticValidationIssue[];
  fallbackLocation?: SourceLocation;
}): RecordInputPolicySections | undefined {
  const exact = normalizeStringList(options.directive.values?.exact);
  const update = normalizeStringList(options.directive.values?.update);
  const optionalBenign = normalizeStringList(options.directive.values?.optionalBenign);
  const allowlist = normalizePolicySetMap({
    raw: options.directive.values?.allowlist,
    code: 'allowlist_invalid_target',
    recordName: options.recordName,
    issues: options.issues,
    fallbackLocation: options.fallbackLocation
  });
  const blocklist = normalizePolicySetMap({
    raw: options.directive.values?.blocklist,
    code: 'blocklist_invalid_target',
    recordName: options.recordName,
    issues: options.issues,
    fallbackLocation: options.fallbackLocation
  });

  if (
    exact.length === 0
    && update.length === 0
    && optionalBenign.length === 0
    && Object.keys(allowlist).length === 0
    && Object.keys(blocklist).length === 0
  ) {
    return undefined;
  }

  return {
    ...(exact.length > 0 ? { exact } : {}),
    ...(update.length > 0 ? { update } : {}),
    ...(Object.keys(allowlist).length > 0 ? { allowlist } : {}),
    ...(Object.keys(blocklist).length > 0 ? { blocklist } : {}),
    ...(optionalBenign.length > 0 ? { optionalBenign } : {})
  };
}

function hasInputPolicySections(policy: RecordInputPolicySections | undefined): boolean {
  return Boolean(
    policy
    && (
      (policy.exact?.length ?? 0) > 0
      || (policy.update?.length ?? 0) > 0
      || Object.keys(policy.allowlist ?? {}).length > 0
      || Object.keys(policy.blocklist ?? {}).length > 0
      || (policy.optionalBenign?.length ?? 0) > 0
    )
  );
}

function validateRecordInputPolicySections(options: {
  recordName: string;
  fieldByName: ReadonlyMap<string, RecordFieldDefinition>;
  inputPolicy: RecordInputPolicySections | undefined;
  location?: SourceLocation;
}): StaticValidationIssue[] {
  const issues: StaticValidationIssue[] = [];
  const { recordName, fieldByName, inputPolicy, location } = options;
  if (!inputPolicy) {
    return issues;
  }

  for (const fieldName of inputPolicy.exact ?? []) {
    const field = fieldByName.get(fieldName);
    if (!field) {
      issues.push(issue(
        'exact_field_undefined',
        `Record '@${recordName}' exact field '${fieldName}' is not defined`,
        location
      ));
      continue;
    }
    if (field.classification !== 'data') {
      issues.push(issue(
        'exact_field_not_in_data',
        `Record '@${recordName}' exact field '${fieldName}' must be declared in data`,
        location
      ));
    }
  }

  for (const fieldName of inputPolicy.update ?? []) {
    const field = fieldByName.get(fieldName);
    if (!field) {
      issues.push(issue(
        'update_field_undefined',
        `Record '@${recordName}' update field '${fieldName}' is not defined`,
        location
      ));
      continue;
    }
    if (field.classification !== 'data') {
      issues.push(issue(
        'update_field_not_in_data',
        `Record '@${recordName}' update field '${fieldName}' must be declared in data`,
        location
      ));
    }
  }

  for (const fieldName of Object.keys(inputPolicy.allowlist ?? {})) {
    if (!fieldByName.has(fieldName)) {
      issues.push(issue(
        'allowlist_field_undefined',
        `Record '@${recordName}' allowlist field '${fieldName}' is not defined`,
        location
      ));
    }
  }

  for (const fieldName of Object.keys(inputPolicy.blocklist ?? {})) {
    if (!fieldByName.has(fieldName)) {
      issues.push(issue(
        'blocklist_field_undefined',
        `Record '@${recordName}' blocklist field '${fieldName}' is not defined`,
        location
      ));
    }
  }

  for (const fieldName of inputPolicy.optionalBenign ?? []) {
    const field = fieldByName.get(fieldName);
    if (!field) {
      issues.push(issue(
        'optional_benign_field_undefined',
        `Record '@${recordName}' optional_benign field '${fieldName}' is not defined`,
        location
      ));
      continue;
    }
    if (field.classification !== 'fact' || field.optional !== true) {
      issues.push(issue(
        'optional_benign_invalid_field',
        `Record '@${recordName}' optional_benign field '${fieldName}' must be an optional fact`,
        location
      ));
    }
  }

  return issues;
}

function normalizeFields(
  fields: RecordFieldDefinition[],
  classification: 'fact' | 'data'
): RecordFieldDefinition[] {
  return fields.map(field => {
    if (classification === 'fact') {
      return {
        ...field,
        classification,
        dataTrust: undefined
      };
    }

    return {
      ...field,
      classification,
      dataTrust: normalizeRecordDataTrustLevel(field.dataTrust)
    };
  });
}

function validateRecordFieldShape(
  field: RecordFieldDefinition,
  recordName: string,
  filePath?: string,
  fallbackLocation?: SourceLocation
): StaticValidationIssue[] {
  if (field.classification === 'data' && field.valueType === 'handle') {
    return [
      issue(
        'HANDLE_ON_DATA',
        `Record '@${recordName}' data field '${field.name}' cannot use handle type`,
        getRecordFieldLocation(field, filePath, fallbackLocation)
      )
    ];
  }
  return [];
}

function normalizeRecordDataTrustLevel(value: unknown): RecordDataTrustLevel {
  return value === 'trusted' ? 'trusted' : 'untrusted';
}

function getRecordFieldLocation(
  field: RecordFieldDefinition,
  filePath?: string,
  fallback?: SourceLocation
): SourceLocation | undefined {
  if (field.kind === 'input') {
    return toNodeLocation(field.source as any, filePath) ?? fallback;
  }

  return toNodeLocation(field.expression as any, filePath) ?? fallback;
}

function normalizeDisplay(
  declaration: RecordDisplayDeclaration | undefined,
  fields: RecordFieldDefinition[],
  recordName: string,
  issues: StaticValidationIssue[],
  fallbackLocation?: SourceLocation
): RecordDisplayConfig {
  if (!declaration) {
    return { kind: 'open' };
  }

  if (declaration.kind === 'legacy') {
    return {
      kind: 'legacy',
      entries: normalizeDisplayEntries(
        declaration.entries,
        fields,
        recordName,
        issues,
        fallbackLocation
      )
    };
  }

  const normalizedModes: Record<string, RecordDisplayEntry[]> = {};
  for (const [rawModeName, entries] of Object.entries(declaration.modes)) {
    const modeName = normalizeDisplayModeName(rawModeName);
    if (!modeName) {
      continue;
    }

    if (isStrictDisplayModeName(modeName)) {
      issues.push(issue(
        'INVALID_RECORD_DISPLAY',
        `Record '@${recordName}' cannot declare display mode 'strict'`,
        fallbackLocation
      ));
      continue;
    }

    normalizedModes[modeName] = normalizeDisplayEntries(
      entries,
      fields,
      recordName,
      issues,
      fallbackLocation,
      modeName
    );
  }

  return {
    kind: 'named',
    modes: normalizedModes
  };
}

function normalizeDisplayEntries(
  entries: RecordDisplayEntry[],
  fields: RecordFieldDefinition[],
  recordName: string,
  issues: StaticValidationIssue[],
  fallbackLocation?: SourceLocation,
  modeName?: string
): RecordDisplayEntry[] {
  const fieldByName = new Map(fields.map(field => [field.name, field]));
  const seen = new Set<string>();
  const normalized: RecordDisplayEntry[] = [];
  const modePrefix = modeName ? ` display mode '${modeName}'` : '';

  for (const entry of entries) {
    const field = fieldByName.get(entry.field);
    if (!field) {
      issues.push(issue(
        'INVALID_RECORD_DISPLAY',
        `Record '@${recordName}'${modePrefix} references unknown field '${entry.field}'`,
        fallbackLocation
      ));
      continue;
    }

    if (field.classification !== 'fact' && entry.kind !== 'bare') {
      issues.push(issue(
        'INVALID_RECORD_DISPLAY',
        `Record '@${recordName}'${modePrefix} entry '${entry.field}' must reference a fact field`,
        fallbackLocation
      ));
      continue;
    }

    if (seen.has(entry.field)) {
      issues.push(issue(
        'INVALID_RECORD_DISPLAY',
        `Record '@${recordName}'${modePrefix} entry '${entry.field}' is duplicated`,
        fallbackLocation
      ));
      continue;
    }

    seen.add(entry.field);
    normalized.push({ ...entry });
  }

  return normalized;
}

function validateRecordFieldPurity(
  field: RecordFieldDefinition,
  recordName: string,
  filePath?: string,
  fallbackLocation?: SourceLocation
): StaticValidationIssue[] {
  if (field.kind === 'input') {
    if (!['input', 'key', 'value'].includes(field.source.identifier)) {
      return [
        issue(
          'INVALID_RECORD_FIELD',
          `Record '@${recordName}' input field '${field.name}' must read from @input, @key, or @value`,
          getRecordFieldLocation(field, filePath, fallbackLocation)
        )
      ];
    }
    return [];
  }

  const visited = new Set<unknown>();
  const stack: unknown[] = [field.expression];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== 'object' || visited.has(current)) {
      continue;
    }
    visited.add(current);

    const nodeType = (current as { type?: unknown }).type;
    if (
      nodeType === 'Directive' ||
      nodeType === 'ExecInvocation' ||
      nodeType === 'load-content' ||
      nodeType === 'command' ||
      nodeType === 'code' ||
      nodeType === 'foreach-command'
    ) {
      return [
        issue(
          'INVALID_RECORD_FIELD',
          `Record '@${recordName}' computed field '${field.name}' must be pure`,
          getRecordFieldLocation(field, filePath, fallbackLocation)
        )
      ];
    }

    for (const value of Object.values(current as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          stack.push(item);
        }
      } else {
        stack.push(value);
      }
    }
  }

  return [];
}

function validateRecordCondition(
  condition: RecordWhenCondition,
  recordName: string,
  fallbackLocation?: SourceLocation
): StaticValidationIssue[] {
  if (condition.type === 'wildcard') {
    return [];
  }

  if (typeof condition.field !== 'string' || condition.field.length === 0) {
    return [
      issue(
        'INVALID_RECORD_WHEN',
        `Record '@${recordName}' has an invalid when condition`,
        fallbackLocation
      )
    ];
  }

  if (
    condition.sourceRoot &&
    condition.path &&
    (!Array.isArray(condition.path) || condition.path.some(segment => typeof segment !== 'string' || segment.length === 0))
  ) {
    return [
      issue(
        'INVALID_RECORD_WHEN',
        `Record '@${recordName}' has an invalid when condition`,
        fallbackLocation
      )
    ];
  }

  return [];
}

function validateRecordWhenOverrides(
  result: RecordWhenResult,
  fieldByName: ReadonlyMap<string, RecordFieldDefinition>,
  recordName: string,
  fallbackLocation?: SourceLocation
): StaticValidationIssue[] {
  if (result.type !== 'tiers' || !result.overrides?.data) {
    return [];
  }

  const issues: StaticValidationIssue[] = [];
  const seen = new Set<string>();
  for (const [trust, fields] of Object.entries(result.overrides.data)) {
    if (trust !== 'trusted' && trust !== 'untrusted') {
      issues.push(issue(
        'INVALID_RECORD_WHEN',
        `Record '@${recordName}' has an invalid when override`,
        fallbackLocation
      ));
      continue;
    }

    if (!Array.isArray(fields)) {
      issues.push(issue(
        'INVALID_RECORD_WHEN',
        `Record '@${recordName}' has an invalid when override`,
        fallbackLocation
      ));
      continue;
    }

    for (const fieldName of fields) {
      if (typeof fieldName !== 'string' || fieldName.length === 0) {
        issues.push(issue(
          'INVALID_RECORD_WHEN',
          `Record '@${recordName}' has an invalid when override`,
          fallbackLocation
        ));
        continue;
      }

      if (seen.has(fieldName)) {
        issues.push(issue(
          'INVALID_RECORD_WHEN',
          `Record '@${recordName}' reclassifies field '${fieldName}' more than once in a when branch`,
          fallbackLocation
        ));
        continue;
      }

      const field = fieldByName.get(fieldName);
      if (!field) {
        issues.push(issue(
          'INVALID_RECORD_WHEN',
          `Record '@${recordName}' when override references unknown field '${fieldName}'`,
          fallbackLocation
        ));
        continue;
      }

      if (field.classification !== 'data') {
        issues.push(issue(
          'INVALID_RECORD_WHEN',
          `Record '@${recordName}' when override can only reclassify data field '${fieldName}'`,
          fallbackLocation
        ));
        continue;
      }

      seen.add(fieldName);
    }
  }

  return issues;
}

export function inferRecordRootMode(fields: RecordFieldDefinition[]): RecordRootMode {
  let usesMapEntryRoot = false;
  let hasBareInputRoot = false;
  let hasNestedInputAccess = false;

  const visitExpression = (node: unknown): void => {
    if (!node || typeof node !== 'object') {
      return;
    }

    const candidate = node as { type?: unknown; identifier?: unknown; fields?: unknown };
    if (candidate.type === 'VariableReference' && typeof candidate.identifier === 'string') {
      if (candidate.identifier === 'key' || candidate.identifier === 'value') {
        usesMapEntryRoot = true;
      }
      if (candidate.identifier === 'input') {
        const fields = Array.isArray(candidate.fields) ? candidate.fields : [];
        if (fields.length === 0) {
          hasBareInputRoot = true;
        } else {
          hasNestedInputAccess = true;
        }
      }
    }

    for (const value of Object.values(node as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          visitExpression(item);
        }
      } else {
        visitExpression(value);
      }
    }
  };

  for (const field of fields) {
    if (field.kind === 'input') {
      if (field.sourceRoot === 'key' || field.sourceRoot === 'value') {
        usesMapEntryRoot = true;
      }
      const sourceFields = Array.isArray(field.source.fields) ? field.source.fields : [];
      if (field.sourceRoot === 'input') {
        if (sourceFields.length === 0) {
          hasBareInputRoot = true;
        } else {
          hasNestedInputAccess = true;
        }
      }
      continue;
    }
    visitExpression(field.expression);
  }

  if (usesMapEntryRoot) {
    return 'map-entry';
  }
  if (hasBareInputRoot && !hasNestedInputAccess) {
    return 'scalar';
  }
  return 'object';
}

export function buildRecordDefinitionFromDirective(
  directive: RecordDirectiveNode,
  options: { filePath?: string } = {}
): RecordDefinitionBuildResult {
  const issues: StaticValidationIssue[] = [];
  const directiveLocation = toDirectiveLocation(directive, options.filePath);
  const identifierNode = directive.values?.identifier?.[0];
  const name =
    identifierNode && identifierNode.type === 'VariableReference'
      ? identifierNode.identifier
      : directive.raw?.identifier;

  if (!name) {
    issues.push(issue(
      'INVALID_RECORD_NAME',
      'Record directive is missing a name',
      directiveLocation
    ));
    return { issues };
  }

  const facts = normalizeFields(directive.values?.facts ?? [], 'fact');
  const data = normalizeFields(directive.values?.data ?? [], 'data');
  const fields = [...facts, ...data];
  if (fields.length === 0) {
    issues.push(issue(
      'INVALID_RECORD_FIELDS',
      `Record '@${name}' must define at least one fact or data field`,
      directiveLocation
    ));
  }

  const seen = new Set<string>();
  const fieldByName = new Map<string, RecordFieldDefinition>();
  for (const field of fields) {
    if (seen.has(field.name)) {
      issues.push(issue(
        'INVALID_RECORD_FIELDS',
        `Record '@${name}' defines duplicate field '${field.name}'`,
        getRecordFieldLocation(field, options.filePath, directiveLocation)
      ));
      continue;
    }

    seen.add(field.name);
    fieldByName.set(field.name, field);
    issues.push(...validateRecordFieldShape(field, name, options.filePath, directiveLocation));
    issues.push(...validateRecordFieldPurity(field, name, options.filePath, directiveLocation));
  }

  const key = typeof directive.values?.key === 'string' ? directive.values.key.trim() : '';
  if (key) {
    const keyField = fieldByName.get(key);
    if (!keyField) {
      issues.push(issue(
        'key_field_undefined',
        `Record '@${name}' key field '${key}' is not defined`,
        directiveLocation
      ));
    } else if (keyField.optional) {
      issues.push(issue(
        'INVALID_RECORD_KEY',
        `Record '@${name}' key field '${key}' cannot be optional`,
        directiveLocation
      ));
    } else if (keyField.classification !== 'fact') {
      issues.push(issue(
        'INVALID_RECORD_KEY',
        `Record '@${name}' key field '${key}' must be declared in facts`,
        directiveLocation
      ));
    }
  }

  const display = normalizeDisplay(
    directive.values?.display,
    fields,
    name,
    issues,
    directiveLocation
  );
  const inputPolicy = buildRecordInputPolicySections({
    directive,
    recordName: name,
    issues,
    fallbackLocation: directiveLocation
  });
  const correlate = typeof directive.values?.correlate === 'boolean'
    ? directive.values.correlate
    : undefined;
  const hasInputOnlySections = typeof correlate === 'boolean' || hasInputPolicySections(inputPolicy);
  issues.push(...validateRecordDirection({
    name,
    display,
    hasInputOnlySections,
    location: directiveLocation
  }));
  issues.push(...validateRecordInputPolicySections({
    recordName: name,
    fieldByName,
    inputPolicy,
    location: directiveLocation
  }));

  const when = directive.values?.when;
  if (Array.isArray(when)) {
    for (const rule of when) {
      issues.push(...validateRecordCondition(rule.condition, name, directiveLocation));
      issues.push(...validateRecordWhenOverrides(rule.result, fieldByName, name, directiveLocation));
    }
  }

  if (issues.length > 0) {
    return { issues };
  }

  return {
    definition: {
      name,
      ...(key ? { key } : {}),
      fields,
      rootMode: inferRecordRootMode(fields),
      display,
      direction: getRecordDirection({
        display,
        correlate,
        hasInputPolicy: hasInputPolicySections(inputPolicy)
      }),
      ...(typeof correlate === 'boolean' ? { correlate } : {}),
      ...(inputPolicy ? { inputPolicy } : {}),
      validate: directive.values?.validate ?? DEFAULT_VALIDATE_MODE,
      ...(Array.isArray(when) && when.length > 0 ? { when: [...when] } : {}),
      location: directiveLocation
    },
    issues
  };
}

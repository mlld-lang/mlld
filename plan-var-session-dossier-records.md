# Dossier: Record Internals + Input-Style Classification

**Purpose:** Document record grammar, storage, validation, and the input-style-vs-output-style distinction. Session slot types must be input-style (no `display:`/`when:`); this dossier identifies the exact classifier extension point.

---

## Executive Summary

Records in mlld are a dual-purpose primitive that both classifies tool output (via `=> record @name` coercion) and validates tool input (via `inputs: @record` binding on tool catalog entries). Each record has a **direction** classification — `input`, `output`, or `hybrid` — determined at parse-time by presence of input-only sections (`supply:`, `correlate:`, `exact:`, `update:`, `allowlist:`, `blocklist:`, `optional_benign:`) or output-only sections (`display:`). The classifier enforces that records may not mix input-only and output-only sections (`mixed_record_direction` error).

**Session-slot-type binding requires records to be input-style (`input` or `hybrid`) and to have no `display:` or `when:` sections** — the same constraint applied to records used in `inputs:` bindings. Adding `canUseRecordForSessionSlot()` is a ~10-line additive helper with low risk.

---

## File-and-Line-Range Reference Table

| File | Lines | Purpose |
|---|---|---|
| `grammar/directives/record.peggy` | 1-542 | Record directive grammar: parses sections, input-only sections, output sections |
| `core/types/record.ts` | 1-100 | Type definitions: `RecordDirection`, field classification, display modes, direction helpers |
| `core/types/record.ts` | 452-469 | `getRecordDirection()`: classifier determining direction from sections present |
| `core/types/record.ts` | 471-477 | `canUseRecordForOutput()` and `canUseRecordForInput()`: direction constraint enforcement |
| `core/validation/record-definition.ts` | 56-72 | `validateRecordDirection()`: error on mixed directions (`mixed_record_direction`) |
| `interpreter/eval/record.ts` | 1-46 | `evaluateRecord()`: calls `buildRecordDefinitionFromDirective`, registers definition, creates variable |
| `interpreter/eval/records/resolve-record-definition.ts` | 50-92 | `resolveConfiguredOutputRecordDefinition()`: enforces `!canUseRecordForOutput()` for tool output |
| `interpreter/eval/records/coerce-record.ts` | 700-900 | Core coercion logic: fact minting, data trust, field type validation, metadata projection |
| `interpreter/env/builtins/cast.ts` | 30-85 | `@cast()` builtin: enforces input-record constraint before coercion |
| `interpreter/eval/var.ts` | 117-210 | `prepareVarAssignment()`: var directive evaluation entry point |

---

## Record AST Shape

From `grammar/directives/record.peggy`:

```typescript
RecordDirectiveNode {
  kind: 'record',
  subtype: 'record',
  values: {
    identifier: VariableReferenceNode[],
    key?: string,
    facts?: RecordFieldDefinition[],
    data?: RecordFieldDefinition[],
    display?: RecordDisplayDeclaration,
    correlate?: boolean,                 // INPUT-ONLY
    exact?: string[],                    // INPUT-ONLY
    update?: string[],                   // INPUT-ONLY
    allowlist?: Record<string, DataValue>, // INPUT-ONLY
    blocklist?: Record<string, DataValue>, // INPUT-ONLY
    optionalBenign?: string[],           // INPUT-ONLY
    when?: RecordWhenRule[],             // OUTPUT (non-semantic; can exist in hybrid)
    validate?: RecordValidationMode      // "demote"|"strict"|"drop"
  },
  meta: {
    hasKey: boolean,
    fieldCount: number,
    factCount: number,
    dataCount: number,
    hasCorrelate: boolean,
    hasWhen: boolean,
    validate: RecordValidationMode,
    comment?: string
  }
}

RecordDefinition (built by buildRecordDefinitionFromDirective) {
  name: string,
  key?: string,
  fields: RecordFieldDefinition[],
  rootMode: 'object' | 'scalar' | 'map-entry',
  display: RecordDisplayConfig,
  direction: 'input' | 'output' | 'hybrid',   // CLASSIFIER OUTPUT
  correlate?: boolean,
  inputPolicy?: {
    exact?: string[],
    update?: string[],
    allowlist?: Record<string, RecordPolicySetTarget>,
    blocklist?: Record<string, RecordPolicySetTarget>,
    optionalBenign?: string[]
  },
  validate: RecordValidationMode,
  when?: RecordWhenRule[],
  location?: SourceLocation
}
```

---

## Classifier Walkthrough

### 1. Direction Classification (Parse-time)

`core/types/record.ts:452-469`

```typescript
export function getRecordDirection(options: {
  display: RecordDisplayConfig;
  correlate?: boolean;
  hasInputPolicy?: boolean;
  hasSupply?: boolean;
}): RecordDirection {
  if (
    typeof options.correlate === 'boolean'
    || options.hasInputPolicy === true
    || options.hasSupply === true
  ) {
    return 'input';  // Has input-only sections
  }
  if (options.display.kind !== 'open') {
    return 'output'; // Has display
  }
  return 'hybrid';   // Neither input-only nor output-only
}
```

**Decision rules:**
- **Input** — has any of: `correlate:`, `exact:`, `update:`, `allowlist:`, `blocklist:`, `optional_benign:`, `supply:` (deferred)
- **Output** — has `display:` (any mode)
- **Hybrid** — has neither input-only nor output-only sections

`core/validation/record-definition.ts:56-72`

```typescript
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
```

### 2. Use-Site Constraint Enforcement

`core/types/record.ts:471-477`

```typescript
export function canUseRecordForOutput(definition: RecordDefinition): boolean {
  return definition.direction !== 'input';  // Allow 'output' and 'hybrid'
}

export function canUseRecordForInput(definition: RecordDefinition): boolean {
  return definition.direction !== 'output';  // Allow 'input' and 'hybrid'
}
```

Output-use (tool coercion), `interpreter/eval/records/resolve-record-definition.ts:50-92`:

```typescript
if (typeof outputRecord === 'string') {
  const recordDefinition = runtimeEnv.getRecordDefinition(outputRecord);
  if (recordDefinition) {
    if (!canUseRecordForOutput(recordDefinition)) {
      throw new MlldInterpreterError(
        `Executable '@${executableDisplayName}' cannot use input-only record '@${outputRecord}' as output`,
        'exec',
        nodeSourceLocation,
        { code: 'INPUT_RECORD_COERCION_ATTEMPT' }
      );
    }
    return recordDefinition;
  }
}
```

`@cast()` builtin, `interpreter/env/builtins/cast.ts:30-85`:

```typescript
function resolveCastRecordDefinition(recordArg: unknown, env: Environment) {
  const direct = normalizeResolvedRecordDefinition(recordArg);
  if (direct) {
    if (!canUseRecordForOutput(direct)) {
      throw new MlldInterpreterError(
        'Builtin @cast cannot use an input-only record',
        'record',
        undefined,
        { code: 'INPUT_RECORD_COERCION_ATTEMPT' }
      );
    }
    return direct;
  }
}
```

### 3. Session-Bound Type Classifier (Where to Plug In)

Session-slot-type validation would:
1. Check `canUseRecordForInput(definition)` — allow `input` and `hybrid`
2. Check that `definition.display.kind === 'open'` — no display sections
3. Check that `definition.when === undefined` or `definition.when.length === 0` — no when rules

**Proposed location:** `core/types/record.ts` lines 475-500 (new):

```typescript
export function canUseRecordForSessionSlot(definition: RecordDefinition): boolean {
  // Must be input-directed or hybrid
  if (!canUseRecordForInput(definition)) {
    return false;  // Is output-only
  }
  // No display sections
  if (definition.display.kind !== 'open') {
    return false;
  }
  // No when rules (accumulator semantics, no proof minting)
  if (definition.when && definition.when.length > 0) {
    return false;
  }
  return true;
}
```

**Call site:** wherever session slot types are bound and checked (session schema validator).

---

## Key Code Excerpts

### 1. Grammar: Input vs Output Section Distinction

`grammar/directives/record.peggy:1-65`

```peggy
SlashRecord
  = DirectiveContext RecordKeyword _ "@" id:BaseIdentifier _ "=" _ body:RecordBody ending:StandardDirectiveEnding {
      const facts = body.entries.filter(entry => entry.kind === 'facts').flatMap(entry => entry.fields);
      const data = body.entries.filter(entry => entry.kind === 'data').flatMap(entry => entry.fields);
      const keyEntry = body.entries.find(entry => entry.kind === 'key');
      const whenEntry = body.entries.find(entry => entry.kind === 'when');
      const validateEntry = body.entries.find(entry => entry.kind === 'validate');
      const displayEntry = body.entries.find(entry => entry.kind === 'display');
      const correlateEntry = body.entries.find(entry => entry.kind === 'correlate');
      const exactEntry = body.entries.find(entry => entry.kind === 'exact');
      const updateEntry = body.entries.find(entry => entry.kind === 'update');
      const allowlistEntry = body.entries.find(entry => entry.kind === 'allowlist');
      const blocklistEntry = body.entries.find(entry => entry.kind === 'blocklist');
      const optionalBenignEntry = body.entries.find(entry => entry.kind === 'optional_benign');

      const values = {
        identifier: [identifierNode],
        ...(keyEntry ? { key: keyEntry.value } : {}),
        ...(facts.length > 0 ? { facts } : {}),
        ...(data.length > 0 ? { data } : {}),
        ...(displayEntry ? { display: displayEntry.value } : {}),
        ...(correlateEntry ? { correlate: correlateEntry.value } : {}),  // INPUT-ONLY
        ...(exactEntry ? { exact: exactEntry.value } : {}),               // INPUT-ONLY
        ...(updateEntry ? { update: updateEntry.value } : {}),            // INPUT-ONLY
        ...(allowlistEntry ? { allowlist: allowlistEntry.value } : {}),   // INPUT-ONLY
        ...(blocklistEntry ? { blocklist: blocklistEntry.value } : {}),   // INPUT-ONLY
        ...(optionalBenignEntry ? { optionalBenign: optionalBenignEntry.value } : {}), // INPUT-ONLY
        ...(whenEntry ? { when: whenEntry.rules } : {}),
        ...(validateEntry ? { validate: validateEntry.mode } : {})
      };
    }
```

### 2. Field Type Coercion

`interpreter/eval/records/coerce-record.ts:413-484`

```typescript
function coerceFieldValue(
  field: RecordFieldDefinition,
  value: unknown,
  env: Environment
): { ok: true; value: unknown } | { ok: false; actual: string } {
  const extracted = extractRecordInputValue(value);
  if (!field.valueType) {
    if (typeof extracted === 'string' || typeof extracted === 'number' || typeof extracted === 'boolean') {
      return { ok: true, value: extracted };
    }
    return { ok: false, actual: describeRecordValueType(value) };
  }

  if (field.valueType === 'string') {
    if (extracted === null || extracted === undefined) {
      return { ok: false, actual: String(extracted) };
    }
    return { ok: true, value: typeof extracted === 'string' ? extracted.trim() : String(extracted) };
  }

  if (field.valueType === 'number') {
    if (typeof extracted === 'number' && Number.isFinite(extracted)) {
      return { ok: true, value: extracted };
    }
    if (typeof extracted === 'string' && extracted.trim().length > 0) {
      const parsed = Number(extracted.trim());
      if (Number.isFinite(parsed)) return { ok: true, value: parsed };
    }
    return { ok: false, actual: describeRecordValueType(value) };
  }

  if (field.valueType === 'handle') {
    return resolveHandleTypedFieldValue(value, env);
  }
  // ...array, object, boolean paths...
  return { ok: false, actual: describeRecordValueType(value) };
}
```

Field validation is type-driven and environment-aware. Applies uniformly to input and output coercions.

### 3. Fact-Label Minting (Output-Only)

`interpreter/eval/records/coerce-record.ts:673-683`

```typescript
function buildFactLabels(
  definition: RecordDefinition,
  fieldName: string,
  tiers: readonly string[]
): string[] {
  const address = `@${definition.name}.${fieldName}`;
  if (tiers.length === 0) {
    return [`fact:${address}`];
  }
  return [`fact:${tiers.join(':')}:${address}`];
}
```

Called during output coercion to mint `fact:` labels. **Never called during input validation** — session slots and input bindings validate without minting.

### 4. Direction Determination

`core/validation/record-definition.ts:207-248`

```typescript
function buildRecordInputPolicySections(options: {
  directive: RecordDirectiveNode;
  recordName: string;
  issues: StaticValidationIssue[];
  fallbackLocation?: SourceLocation;
}): RecordInputPolicySections | undefined {
  const exact = normalizeStringList(options.directive.values?.exact);
  const update = normalizeStringList(options.directive.values?.update);
  const optionalBenign = normalizeStringList(options.directive.values?.optionalBenign);
  const allowlist = normalizePolicySetMap({...});
  const blocklist = normalizePolicySetMap({...});

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
    policy && (
      (policy.exact?.length ?? 0) > 0
      || (policy.update?.length ?? 0) > 0
      || Object.keys(policy.allowlist ?? {}).length > 0
      || Object.keys(policy.blocklist ?? {}).length > 0
      || (policy.optionalBenign?.length ?? 0) > 0
    )
  );
}
```

### 5. Optional Field Handling

`interpreter/eval/records/coerce-record.ts:778-789`

```typescript
for (const field of definition.fields) {
  const rawValue = await evaluateFieldValue(field, context, env);
  const fieldPath = pathPrefix ? `${pathPrefix}.${field.name}` : field.name;

  if (rawValue === undefined || rawValue === null) {
    if (!field.optional) {
      errors.push({
        path: fieldPath,
        code: 'required',
        message: `Missing required field '${field.name}'`,
        expected: field.valueType ?? 'value'
      });
    }
    continue;  // Optional fields skip without error
  }
}
```

The `optional: boolean` flag on each field is parsed as `?` suffix and enforced uniformly.

### 6. Record Variable Creation

`interpreter/eval/record.ts:8-45`

```typescript
export async function evaluateRecord(
  directive: RecordDirectiveNode,
  env: Environment
): Promise<EvalResult> {
  const { definition, issues } = buildRecordDefinitionFromDirective(directive, {
    filePath: env.getCurrentFilePath()
  });

  if (!definition) {
    const firstIssue = issues[0];
    throw new MlldInterpreterError(
      firstIssue?.message ?? 'Invalid record definition',
      'record',
      firstIssue?.location,
      { code: firstIssue?.code ?? 'INVALID_RECORD' }
    );
  }

  env.registerRecordDefinition(definition.name, definition);
  const source: VariableSource = {
    directive: 'var',
    syntax: 'object',
    hasInterpolation: false,
    isMultiLine: true
  };
  env.setVariable(definition.name, createRecordVariable(definition.name, definition, source, {
    internal: {
      recordDefinition: definition
    }
  }));

  return { value: definition, env };
}
```

Records stored by name (string key) and wrapped as variables for re-export/import.

---

## Extension Points

### 1. Session-Slot-Type Classification (additive)

**File to extend:** `core/types/record.ts` (after line 485)

```typescript
export function canUseRecordForSessionSlot(definition: RecordDefinition): boolean {
  if (!canUseRecordForInput(definition)) return false;
  if (definition.display.kind !== 'open') return false;
  if (definition.when && definition.when.length > 0) return false;
  return true;
}
```

Call site: wherever session slot types are bound and checked (schema validator).

### 2. `@record[]` Array Syntax

**Status: partially implemented.** Field types already include `array`:

```typescript
type RecordFieldValueType = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'handle';
```

To support `@recordName[]` field syntax:

**Grammar change:** `grammar/directives/record.peggy:387-393`

Current:
```peggy
RecordFieldValueType
  = value:$("string" ![a-zA-Z0-9_]) { return value; }
  / value:$("number" ![a-zA-Z0-9_]) { return value; }
```

Extend to:
```peggy
RecordFieldValueType
  = recordRef:RecordReference arrayMarker:"[]"? { 
      return arrayMarker ? `${recordRef}[]` : recordRef; 
    }
  / primitiveName:("string" | "number" | ...) arrayMarker:"[]"? { 
      return arrayMarker ? `${primitiveName}[]` : primitiveName; 
    }
```

**Type system:** `core/types/record.ts:8`

```typescript
type RecordFieldValueType = 
  | 'string' | 'number' | 'boolean' | 'array' | 'object' | 'handle'
  | 'string[]' | 'number[]' | 'boolean[]' | 'array[]' | 'object[]'
  | `@${string}[]`;
```

**Coercion:** `interpreter/eval/records/coerce-record.ts:465-470` — add case for array types:
```typescript
if (field.valueType?.endsWith('[]')) {
  if (Array.isArray(extracted)) {
    const elementType = field.valueType.slice(0, -2);
    // Validate each element against elementType
    return { ok: true, value: extracted };
  }
  return { ok: false, actual: describeRecordValueType(value) };
}
```

### 3. "No display: / when: on session-bound records" Check

**File to extend:** `core/validation/record-definition.ts` or `core/types/record.ts`

```typescript
export function validateSessionSlotType(definition: RecordDefinition, usage: 'session-slot'): StaticValidationIssue[] {
  const issues: StaticValidationIssue[] = [];

  if (definition.display.kind !== 'open') {
    issues.push({
      code: 'SESSION_SLOT_TYPE_WITH_DISPLAY',
      message: `Record '@${definition.name}' cannot declare display: for use as session slot type`,
      location: definition.location
    });
  }

  if (definition.when && definition.when.length > 0) {
    issues.push({
      code: 'SESSION_SLOT_TYPE_WITH_WHEN',
      message: `Record '@${definition.name}' cannot declare when: for use as session slot type`,
      location: definition.location
    });
  }

  return issues;
}
```

Call site: in var session directive evaluation, when attaching a session schema.

---

## Flags and Cross-Cutting Concerns

1. **Cross-Record References.** Records can reference other records:
   - Field types: `field: @recordName`
   - Display projections: records reference others for nested projection
   - Policy targets: `allowlist: { field: @record }`

   Resolution by **name string**, not declaration identity. Two records with same name imported under different module bindings are the **same record**.

2. **Legacy Paths (controlArgs, sourceArgs, payloadArgs).** Not record concerns; handled by input-records spec. Record validator accepts both old and new shapes during v2 but doesn't emit them.

3. **Optional Fields and Benign Omission.** `fact?` emits advisory `optional_fact_declared` requesting acknowledgement via `optional_benign:`. Advisory in v2, errors in v3.

4. **Multi-Fact Correlation.** `correlate:` controls whether writes referencing multiple facts must come from same source record instance. Default true for multi-fact, false for single-fact.

5. **Instance Key (keyed records).** `key: fieldname` designates a field as instance identity. Used by `=> record` coercion to track fact-source handles per-instance. Not relevant to session slots (accumulators, no proof tracking).

---

## Non-Goals Confirmation

**✓ Did NOT design session slot-type system.** Documents current record internals and extension points. Session slot-type design in session spec §7.

**✓ Did NOT design classifier.** `getRecordDirection()` already live and operational. Session slot binding plugs into existing check via `canUseRecordForInput()` + additional `display.kind === 'open'` and `when === undefined` checks.

**✓ Did NOT review planner-worker authorization.** Records are one piece; policies, facts, handles, guards are orthogonal.

Extension is additive and low-risk. Hours of work, not days.

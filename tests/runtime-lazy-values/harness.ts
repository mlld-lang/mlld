import { extractUrlsFromValue } from '../../core/security/url-provenance';
import {
  makeSecurityDescriptor,
  type SecurityDescriptor
} from '../../core/types/security';
import {
  buildRecordFieldProjectionMetadata,
  buildRecordObjectProjectionMetadata,
  type RecordDefinition,
  type RecordFieldDefinition,
  type RecordProjectionMetadata
} from '../../core/types/record';
import {
  createFactSourceHandle,
  internFactSourceArray,
  type FactSourceHandle
} from '../../core/types/handle';
import {
  asText,
  setRecordProjectionMetadata,
  wrapStructured,
  type StructuredValue
} from '../../interpreter/utils/structured-value';

type HarnessOptions = {
  records: number;
  fields: number;
  textSize: number;
  sessions: boolean;
};

type HarnessState = {
  toJsonCalls: number;
  wrappers: StructuredValue<Record<string, unknown>>[];
  fieldValues: StructuredValue[];
  sessionValues: StructuredValue[];
};

function parseArgs(argv: readonly string[]): HarnessOptions {
  const options: HarnessOptions = {
    records: 160,
    fields: 12,
    textSize: 0,
    sessions: true
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    const next = argv[index + 1];
    if (arg === '--records' && next) {
      options.records = Number(next);
      index += 1;
    } else if (arg === '--fields' && next) {
      options.fields = Number(next);
      index += 1;
    } else if (arg === '--text-size' && next) {
      options.textSize = Number(next);
      index += 1;
    } else if (arg === '--sessions' && next) {
      options.sessions = next !== 'false';
      index += 1;
    }
  }

  return options;
}

function memorySample() {
  return process.memoryUsage();
}

function postGcSample() {
  const gc = (globalThis as { gc?: () => void }).gc;
  if (typeof gc !== 'function') {
    return undefined;
  }
  gc();
  return memorySample();
}

function emit(stage: string, state: HarnessState, extra: Record<string, unknown> = {}): void {
  const allStructured = [...state.wrappers, ...state.fieldValues, ...state.sessionValues];
  const descriptorIdentities = new Set<SecurityDescriptor>();
  const factsourceArrayIdentities = new Set<readonly FactSourceHandle[]>();
  const projectionIdentities = new Set<RecordProjectionMetadata>();

  let textAccessors = 0;
  let materializedText = 0;
  let nestedUrlCount = 0;

  for (const value of allStructured) {
    const textDescriptor = Object.getOwnPropertyDescriptor(value, 'text');
    if (textDescriptor?.get) {
      textAccessors += 1;
    } else if (textDescriptor && 'value' in textDescriptor) {
      materializedText += 1;
    }
    if (value.metadata?.security) {
      descriptorIdentities.add(value.metadata.security);
    }
    if (value.metadata?.factsources) {
      factsourceArrayIdentities.add(value.metadata.factsources);
    }
    if (value.metadata?.projection) {
      projectionIdentities.add(value.metadata.projection);
    }
    nestedUrlCount += extractUrlsFromValue(value.data).length;
  }

  console.log(JSON.stringify({
    stage,
    memory: memorySample(),
    postGc: postGcSample(),
    counters: {
      structuredValues: allStructured.length,
      textAccessors,
      materializedText,
      toJsonCalls: state.toJsonCalls,
      nestedUrlCount,
      descriptorIdentities: descriptorIdentities.size,
      factsourceArrayIdentities: factsourceArrayIdentities.size,
      projectionIdentities: projectionIdentities.size
    },
    ...extra
  }));
}

function makePayload(recordIndex: number, fields: number, textSize: number, state: HarnessState) {
  const payload: Record<string, unknown> = {
    id: `record-${recordIndex}`,
    link: `https://example.com/items/${recordIndex}#frag`
  };
  for (let fieldIndex = 0; fieldIndex < fields; fieldIndex += 1) {
    payload[`field_${fieldIndex}`] = textSize > 0
      ? `${fieldIndex}:`.padEnd(textSize, 'x')
      : `value-${recordIndex}-${fieldIndex}`;
  }
  Object.defineProperty(payload, 'toJSON', {
    enumerable: false,
    value() {
      state.toJsonCalls += 1;
      return { ...payload };
    }
  });
  return payload;
}

function makeRecordDefinition(fields: number): RecordDefinition {
  const definitions: RecordFieldDefinition[] = Array.from({ length: fields }, (_, index) => ({
    kind: 'computed',
    name: `field_${index}`,
    classification: index % 3 === 0 ? 'data' : 'fact',
    expression: '' as any,
    valueType: 'string',
    optional: false
  }));

  return {
    name: 'bench_record',
    fields: definitions,
    rootMode: 'object',
    display: { kind: 'open' },
    direction: 'output',
    validate: 'demote'
  };
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const state: HarnessState = {
    toJsonCalls: 0,
    wrappers: [],
    fieldValues: [],
    sessionValues: []
  };

  for (let index = 0; index < options.records; index += 1) {
    state.wrappers.push(
      wrapStructured(makePayload(index, options.fields, options.textSize, state), 'object', undefined, {
        security: makeSecurityDescriptor({ labels: ['influenced'] })
      })
    );
  }
  emit('wrap-object', state, { options });

  state.wrappers = state.wrappers.map(value =>
    wrapStructured(value, undefined, undefined, {
      ...(value.metadata ?? {}),
      security: makeSecurityDescriptor({ labels: ['influenced'], sources: ['src:harness'] })
    })
  );
  emit('clone-with-metadata', state);

  const definition = makeRecordDefinition(options.fields);
  const objectProjection = buildRecordObjectProjectionMetadata(definition);
  for (let recordIndex = 0; recordIndex < options.records; recordIndex += 1) {
    for (const field of definition.fields) {
      const factsources = internFactSourceArray([
        createFactSourceHandle({
          sourceRef: definition.name,
          field: field.name,
          coercionId: `coercion-${recordIndex}`,
          position: recordIndex
        })
      ]);
      state.fieldValues.push(
        wrapStructured(`value-${recordIndex}-${field.name}`, 'text', `value-${recordIndex}-${field.name}`, {
          factsources,
          projection: buildRecordFieldProjectionMetadata(definition, field),
          security: makeSecurityDescriptor({ labels: [`fact:@${definition.name}.${field.name}`] })
        })
      );
    }
  }
  for (const wrapper of state.wrappers) {
    setRecordProjectionMetadata(wrapper, objectProjection);
  }
  emit('record-coercion', state);

  state.fieldValues = state.fieldValues.map(value =>
    wrapStructured(value, undefined, undefined, {
      ...(value.metadata ?? {}),
      factsources: value.metadata?.factsources
    })
  );
  emit('field-access', state);

  if (options.sessions) {
    state.sessionValues = state.wrappers.map(value =>
      wrapStructured(value, undefined, undefined, {
        ...(value.metadata ?? {}),
        sessionId: 'harness-session'
      })
    );
  }
  emit('session-write-read', state);

  for (const value of state.wrappers.slice(0, Math.min(5, state.wrappers.length))) {
    asText(value);
  }
  emit('display-serialize', state);
}

main();

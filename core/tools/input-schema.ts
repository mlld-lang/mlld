import { resolveRecordFactCorrelation, type RecordDefinition } from '@core/types/record';
import type { ToolInputSchema } from '@core/types/tools';

export function computeAllowWholeObjectInput(
  value: Pick<Record<string, unknown>, 'direct' | 'inputs'>
): boolean {
  const directFlag = value.direct;
  if (directFlag === true) {
    return true;
  }
  if (directFlag === false) {
    return false;
  }
  return value.inputs !== undefined;
}

export function buildToolInputSchemaFromRecordDefinition(options: {
  recordDefinition: RecordDefinition;
  executableParamNames: readonly string[];
  wholeObjectInput?: boolean;
}): ToolInputSchema {
  const { recordDefinition, executableParamNames, wholeObjectInput = false } = options;
  const orderedFieldNames = recordDefinition.fields.map(field => field.name);
  const fieldNames = new Set(orderedFieldNames);
  const visibleParams = wholeObjectInput
    ? orderedFieldNames
    : executableParamNames.filter(paramName => fieldNames.has(paramName));
  const visibleParamSet = new Set(visibleParams);
  const fields = recordDefinition.fields
    .filter(field => visibleParamSet.has(field.name))
    .map(field => ({
      name: field.name,
      classification: field.classification,
      ...(field.valueType ? { valueType: field.valueType } : {}),
      optional: field.optional === true,
      ...(field.dataTrust ? { dataTrust: field.dataTrust } : {})
    }));

  return {
    recordName: recordDefinition.name,
    fields,
    factFields: fields
      .filter(field => field.classification === 'fact')
      .map(field => field.name),
    dataFields: fields
      .filter(field => field.classification === 'data')
      .map(field => field.name),
    visibleParams,
    ...(wholeObjectInput ? { wholeObjectInput: true } : {}),
    optionalParams: fields
      .filter(field => field.optional)
      .map(field => field.name),
    exactFields: [...(recordDefinition.inputPolicy?.exact ?? [])].filter(name => visibleParamSet.has(name)),
    updateFields: [...(recordDefinition.inputPolicy?.update ?? [])].filter(name => visibleParamSet.has(name)),
    allowlist: Object.fromEntries(
      Object.entries(recordDefinition.inputPolicy?.allowlist ?? {})
        .filter(([fieldName]) => visibleParamSet.has(fieldName))
        .map(([fieldName, target]) => [fieldName, target])
    ),
    blocklist: Object.fromEntries(
      Object.entries(recordDefinition.inputPolicy?.blocklist ?? {})
        .filter(([fieldName]) => visibleParamSet.has(fieldName))
        .map(([fieldName, target]) => [fieldName, target])
    ),
    optionalBenignFields: [...(recordDefinition.inputPolicy?.optionalBenign ?? [])].filter(name => visibleParamSet.has(name)),
    correlate: resolveRecordFactCorrelation(recordDefinition),
    ...(typeof recordDefinition.correlate === 'boolean'
      ? { declaredCorrelate: recordDefinition.correlate }
      : {})
  };
}

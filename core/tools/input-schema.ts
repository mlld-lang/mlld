import { resolveRecordFactCorrelation, type RecordDefinition } from '@core/types/record';
import type { ToolInputSchema } from '@core/types/tools';

export function buildToolInputSchemaFromRecordDefinition(options: {
  recordDefinition: RecordDefinition;
  executableParamNames: readonly string[];
}): ToolInputSchema {
  const { recordDefinition, executableParamNames } = options;
  const fieldNames = new Set(recordDefinition.fields.map(field => field.name));
  const visibleParams = executableParamNames.filter(paramName => fieldNames.has(paramName));
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
    optionalParams: fields
      .filter(field => field.optional)
      .map(field => field.name),
    correlate: resolveRecordFactCorrelation(recordDefinition),
    ...(typeof recordDefinition.correlate === 'boolean'
      ? { declaredCorrelate: recordDefinition.correlate }
      : {})
  };
}

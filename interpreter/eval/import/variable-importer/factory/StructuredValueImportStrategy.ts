import { createStructuredValueVariable } from '@core/types/variable';
import { isStructuredValue } from '@interpreter/utils/structured-value';
import type { ImportValueFamilyStrategy, ImportVariableFactoryRequest } from './types';

export class StructuredValueImportStrategy implements ImportValueFamilyStrategy {
  create(request: ImportVariableFactoryRequest) {
    if (!isStructuredValue(request.value)) {
      return undefined;
    }

    return createStructuredValueVariable(
      request.name,
      request.value,
      request.metadata.source,
      request.metadata.buildMetadata({
        isStructuredValue: true,
        structuredValueType: request.value.type
      })
    );
  }
}

import { createImportedVariable, type VariableTypeDiscriminator } from '@core/types/variable';
import type { ImportVariableFactoryRequest } from './types';

export class PrimitiveImportStrategy {
  create(
    request: ImportVariableFactoryRequest,
    inferredType: VariableTypeDiscriminator
  ) {
    return createImportedVariable(
      request.name,
      request.value,
      inferredType,
      request.importPath,
      false,
      request.originalName || request.name,
      request.metadata.source,
      request.metadata.buildMetadata()
    );
  }
}

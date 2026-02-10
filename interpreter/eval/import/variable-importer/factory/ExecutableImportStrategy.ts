import type { ExecutableImportFactory, ImportValueFamilyStrategy, ImportVariableFactoryRequest } from './types';

export class ExecutableImportStrategy implements ImportValueFamilyStrategy {
  constructor(private readonly executableFactory: ExecutableImportFactory) {}

  create(request: ImportVariableFactoryRequest) {
    if (!(request.value && typeof request.value === 'object' && '__executable' in request.value && request.value.__executable)) {
      return undefined;
    }

    return this.executableFactory.createExecutableFromImport(
      request.name,
      request.value,
      request.metadata.source,
      request.metadata.buildMetadata(),
      request.metadata.securityLabels
    );
  }
}

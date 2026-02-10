import type { DataLabel } from '@core/types/security';
import {
  VariableMetadataUtils,
  type Variable,
  type VariableTypeDiscriminator
} from '@core/types/variable';
import type { Environment } from '@interpreter/env/Environment';
import { ImportVariableMetadataBuilder } from './ImportVariableMetadataBuilder';
import { StructuredValueImportStrategy } from './StructuredValueImportStrategy';
import { ExecutableImportStrategy } from './ExecutableImportStrategy';
import { TemplateImportStrategy } from './TemplateImportStrategy';
import { ArrayImportStrategy } from './ArrayImportStrategy';
import { ObjectImportStrategy } from './ObjectImportStrategy';
import { PrimitiveImportStrategy } from './PrimitiveImportStrategy';
import type {
  ExecutableImportFactory,
  ImportValueComplexityHelpers,
  ImportValueTypeInference,
  ImportVariableFactoryRequest
} from './types';

export interface ImportVariableFactoryOptions {
  securityLabels?: DataLabel[];
  serializedMetadata?: ReturnType<typeof VariableMetadataUtils.serializeSecurityMetadata> | undefined;
  env?: Environment;
}

export interface ImportVariableFactoryDependencies extends ExecutableImportFactory, ImportValueComplexityHelpers, ImportValueTypeInference {}

export class ImportVariableFactoryOrchestrator {
  private readonly metadataBuilder: ImportVariableMetadataBuilder;
  private readonly structuredValueStrategy: StructuredValueImportStrategy;
  private readonly executableStrategy: ExecutableImportStrategy;
  private readonly templateStrategy: TemplateImportStrategy;
  private readonly arrayStrategy: ArrayImportStrategy;
  private readonly objectStrategy: ObjectImportStrategy;
  private readonly primitiveStrategy: PrimitiveImportStrategy;

  constructor(private readonly dependencies: ImportVariableFactoryDependencies) {
    this.metadataBuilder = new ImportVariableMetadataBuilder();
    this.structuredValueStrategy = new StructuredValueImportStrategy();
    this.executableStrategy = new ExecutableImportStrategy(this.dependencies);
    this.templateStrategy = new TemplateImportStrategy();
    this.arrayStrategy = new ArrayImportStrategy(this.dependencies);
    this.objectStrategy = new ObjectImportStrategy(this.dependencies);
    this.primitiveStrategy = new PrimitiveImportStrategy();
  }

  createVariableFromValue(
    name: string,
    value: any,
    importPath: string,
    originalName?: string,
    options?: ImportVariableFactoryOptions
  ): Variable {
    const metadata = this.metadataBuilder.build(name, value, importPath, originalName, options);
    const request: ImportVariableFactoryRequest = {
      name,
      value,
      importPath,
      originalName,
      metadata
    };

    const pretypedResult =
      this.structuredValueStrategy.create(request) ??
      this.executableStrategy.create(request) ??
      this.templateStrategy.create(request);
    if (pretypedResult) {
      return pretypedResult;
    }

    const inferredType = this.dependencies.inferVariableType(value);
    return this.createTypedVariable(request, inferredType);
  }

  private createTypedVariable(
    request: ImportVariableFactoryRequest,
    inferredType: VariableTypeDiscriminator
  ): Variable {
    return this.arrayStrategy.create(request, inferredType)
      ?? this.objectStrategy.create(request, inferredType)
      ?? this.primitiveStrategy.create(request, inferredType);
  }
}

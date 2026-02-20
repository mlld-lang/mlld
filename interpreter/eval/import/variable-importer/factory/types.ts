import type { DataLabel } from '@core/types/security';
import type {
  ExecutableVariable,
  Variable,
  VariableMetadata,
  VariableSource,
  VariableTypeDiscriminator
} from '@core/types/variable';

export interface ImportVariableMetadataContext {
  source: VariableSource;
  securityLabels?: DataLabel[];
  buildMetadata: (extra?: VariableMetadata) => VariableMetadata;
}

export interface ImportVariableFactoryRequest {
  name: string;
  value: any;
  importPath: string;
  originalName?: string;
  metadata: ImportVariableMetadataContext;
}

export interface ImportValueFamilyStrategy {
  create(request: ImportVariableFactoryRequest): Variable | undefined;
}

export interface ExecutableImportFactory {
  createExecutableFromImport: (
    name: string,
    value: any,
    source: VariableSource,
    metadata: VariableMetadata,
    securityLabels?: DataLabel[]
  ) => ExecutableVariable;
}

export interface ImportValueComplexityHelpers {
  hasComplexContent: (value: any) => boolean;
  unwrapArraySnapshots: (value: any, importPath: string) => any;
}

export interface ImportValueTypeInference {
  inferVariableType: (value: any) => VariableTypeDiscriminator;
}

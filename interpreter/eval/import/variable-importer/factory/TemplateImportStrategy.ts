import { createTemplateVariable, type VariableSource } from '@core/types/variable';
import type { ImportValueFamilyStrategy, ImportVariableFactoryRequest } from './types';

export class TemplateImportStrategy implements ImportValueFamilyStrategy {
  create(request: ImportVariableFactoryRequest) {
    if (!(request.value && typeof request.value === 'object' && (request.value as any).__template)) {
      return undefined;
    }

    const templateSource: VariableSource = {
      directive: 'var',
      syntax: 'template',
      hasInterpolation: true,
      isMultiLine: true
    };
    const templateMetadata = request.metadata.buildMetadata();
    const templateOptions = {
      metadata: templateMetadata,
      internal: {
        templateAst: (request.value as any).templateAst
      }
    };
    return createTemplateVariable(
      request.name,
      (request.value as any).content,
      (request.value as any).parameters,
      (request.value as any).templateSyntax === 'tripleColon' ? 'tripleColon' : 'doubleColon',
      templateSource,
      templateOptions
    );
  }
}

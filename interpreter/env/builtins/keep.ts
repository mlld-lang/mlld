import { markExecutableDefinition } from '@core/types/executable';
import { keep, keepStructured } from '@interpreter/utils/structured-value';
import type { MlldVariable } from '@core/types';

export function createKeepExecutable(): MlldVariable {
  const definition = markExecutableDefinition({
    type: 'code',
    codeTemplate: [{ type: 'Text', content: '// keep structured' }],
    language: 'javascript',
    paramNames: ['input'],
    sourceDirective: 'exec'
  });

  return {
    type: 'executable',
    name: 'keep',
    value: definition,
    metadata: {
      isSystem: true,
      isBuiltinTransformer: true
    },
    internal: {
      executableDef: definition,
      isBuiltinTransformer: true,
      transformerImplementation: (input: any) => keep(input),
      description: 'Preserve structured value/metadata instead of unwrapping'
    }
  };
}

export function createKeepStructuredExecutable(): MlldVariable {
  const base = createKeepExecutable();
  return {
    ...base,
    name: 'keepStructured'
  };
}

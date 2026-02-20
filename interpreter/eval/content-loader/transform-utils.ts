import type { LoadContentResult } from '@core/types/load-content';
import type { Environment } from '@interpreter/env/Environment';
import type { AstResult } from '../ast-extractor';

export interface ContentLoaderTransformDependencies {
  interpolateAndRecord: (nodes: any[], env: Environment) => Promise<string>;
}

export class ContentLoaderTransformHelper {
  constructor(private readonly dependencies: ContentLoaderTransformDependencies) {}

  async applyTransformToResults(
    results: LoadContentResult[],
    transform: any,
    env: Environment
  ): Promise<string[]> {
    const transformed: string[] = [];

    for (const result of results) {
      const childEnv = env.createChild();
      const templateParts = transform.parts || [];
      const processedParts: any[] = [];

      for (const part of templateParts) {
        const isPlaceholder = part.type === 'placeholder' ||
          (part.type === 'FileReference' && part.source?.type === 'placeholder');

        if (isPlaceholder) {
          if (part.fields && part.fields.length > 0) {
            let value: any = result;
            for (const field of part.fields) {
              if (value && typeof value === 'object') {
                const fieldName = field.value;
                if (fieldName === 'mx' && typeof value.mx === 'object') {
                  value = value.mx;
                } else {
                  value = value[fieldName];
                }
              } else {
                value = undefined;
                break;
              }
            }
            processedParts.push({
              type: 'Text',
              content: value !== undefined ? String(value) : ''
            });
          } else {
            processedParts.push({
              type: 'Text',
              content: result.content
            });
          }
        } else {
          processedParts.push(part);
        }
      }

      const transformedContent = await this.dependencies.interpolateAndRecord(processedParts, childEnv);
      transformed.push(transformedContent);
    }

    return transformed;
  }

  async applyTemplateToAstResults(
    results: Array<AstResult | null>,
    transform: any,
    env: Environment
  ): Promise<string[]> {
    const transformed: string[] = [];

    for (const result of results) {
      const templateParts = transform.parts || [];
      const processedParts: any[] = [];

      for (const part of templateParts) {
        if (part.type === 'placeholder') {
          if (!result) {
            processedParts.push({ type: 'Text', content: '' });
            continue;
          }

          if (part.fields && part.fields.length > 0) {
            let value: any = result;
            for (const field of part.fields) {
              if (value && typeof value === 'object') {
                value = value[field.value];
              } else {
                value = undefined;
                break;
              }
            }
            processedParts.push({
              type: 'Text',
              content: value !== undefined && value !== null ? String(value) : ''
            });
          } else {
            processedParts.push({
              type: 'Text',
              content: result.code ?? ''
            });
          }
        } else {
          processedParts.push(part);
        }
      }

      const childEnv = env.createChild();
      const transformedContent = await this.dependencies.interpolateAndRecord(processedParts, childEnv);
      transformed.push(transformedContent);
    }

    return transformed;
  }
}

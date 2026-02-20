import type { DirectiveNode } from '@core/types';
import type { DataLabel } from '@core/types/security';
import type { Environment } from '../../env/Environment';
import { VariableImporter } from './VariableImporter';

export class ResolverImportDataAdapter {
  constructor(private readonly variableImporter: VariableImporter) {}

  async getResolverExportData(
    resolver: any,
    directive: DirectiveNode,
    resolverName: string
  ): Promise<Record<string, any>> {
    if (directive.subtype === 'importSelected') {
      const imports = directive.values?.imports || [];

      if (imports.length === 1) {
        const importNode = imports[0];
        const format = importNode.identifier.replace(/^["']|["']$/g, '');

        if (importNode.identifier.startsWith('"') || importNode.identifier.startsWith('\'')) {
          const exportData = await resolver.getExportData(format);
          return { [importNode.alias || format]: exportData[format] };
        }
      }

      return await resolver.getExportData();
    }
    return await resolver.getExportData();
  }

  async fallbackResolverData(
    resolver: any,
    directive: DirectiveNode,
    resolverName: string,
    resolvedResult?: { contentType: string; content: any }
  ): Promise<Record<string, any>> {
    const requestedImports = directive.subtype === 'importSelected'
      ? (directive.values?.imports || []).map((imp: any) => imp.identifier)
      : undefined;

    const result =
      resolvedResult ??
      (await resolver.resolve(`@${resolverName}`, {
        context: 'import',
        requestedImports
      }));

    if (result.contentType === 'data' && typeof result.content === 'string') {
      try {
        return JSON.parse(result.content);
      } catch (e) {
        return { value: result.content };
      }
    }
    if (result.contentType === 'data' && typeof result.content === 'object' && result.content !== null) {
      return result.content;
    }
    return { value: result.content };
  }

  async importResolverVariables(
    directive: DirectiveNode,
    exportData: Record<string, any>,
    env: Environment,
    sourcePath: string
  ): Promise<void> {
    const securityLabels = (directive.meta?.securityLabels || directive.values?.securityLabels) as DataLabel[] | undefined;
    if (directive.subtype === 'importSelected') {
      const imports = directive.values?.imports || [];
      for (const importItem of imports) {
        const varName = importItem.identifier.replace(/^["']|["']$/g, '');
        const alias = importItem.alias || varName;

        if (varName in exportData) {
          const value = exportData[varName];
          const variable = this.variableImporter.createVariableFromValue(alias, value, sourcePath, varName, {
            securityLabels,
            env
          });
          env.setVariable(alias, variable);
        } else {
          throw new Error(`Export '${varName}' not found in resolver '${sourcePath}'`);
        }
      }
      return;
    }

    for (const [name, value] of Object.entries(exportData)) {
      const variable = this.variableImporter.createVariableFromValue(name, value, sourcePath, undefined, {
        securityLabels,
        env
      });
      env.setVariable(name, variable);
    }
  }
}

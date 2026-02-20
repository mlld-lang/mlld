import { MlldDirectiveError } from '@core/errors';
import type { Environment } from '@interpreter/env/Environment';
import { extractVariableValue } from '../../utils/variable-resolution';
import { hasContentPattern, hasNameListPattern, type AstPattern } from '../ast-extractor';

export interface AstPatternFamily {
  hasNameList: boolean;
  hasContent: boolean;
}

export class AstPatternResolution {
  async resolveVariables(patterns: AstPattern[], env: Environment): Promise<AstPattern[]> {
    const resolvedPatterns = await Promise.all(patterns.map(async pattern => {
      if (pattern.type === 'type-filter-var') {
        const variable = env.getVariable(pattern.identifier);
        if (!variable) {
          throw new MlldDirectiveError(
            `Variable @${pattern.identifier} is not defined`,
            { identifier: pattern.identifier }
          );
        }
        const varValue = await extractVariableValue(variable, env);
        const filter = varValue ? String(varValue) : undefined;
        if (!filter) {
          throw new MlldDirectiveError(
            `Variable @${pattern.identifier} is empty`,
            { identifier: pattern.identifier }
          );
        }
        return { type: 'type-filter', filter, usage: pattern.usage };
      }

      if (pattern.type === 'name-list-var') {
        const variable = env.getVariable(pattern.identifier);
        if (!variable) {
          throw new MlldDirectiveError(
            `Variable @${pattern.identifier} is not defined`,
            { identifier: pattern.identifier }
          );
        }
        const varValue = await extractVariableValue(variable, env);
        const filter = varValue ? String(varValue) : undefined;
        if (!filter) {
          throw new MlldDirectiveError(
            `Variable @${pattern.identifier} is empty`,
            { identifier: pattern.identifier }
          );
        }
        return { type: 'name-list', filter, usage: pattern.usage };
      }

      return pattern;
    }));

    return resolvedPatterns as AstPattern[];
  }

  validateFamilies(patterns: AstPattern[]): AstPatternFamily {
    const hasNameList = hasNameListPattern(patterns);
    const hasContent = hasContentPattern(patterns);
    if (hasNameList && hasContent) {
      throw new MlldDirectiveError(
        'Cannot mix content selectors with name-list selectors',
        { patterns: patterns.map(pattern => pattern.type) }
      );
    }

    return { hasNameList, hasContent };
  }

  getNameListFilter(patterns: AstPattern[]): string | undefined {
    const namePattern = patterns.find(pattern =>
      pattern.type === 'name-list' || pattern.type === 'name-list-all'
    );
    return namePattern?.type === 'name-list' ? namePattern.filter : undefined;
  }
}

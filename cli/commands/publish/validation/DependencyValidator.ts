/**
 * Dependency validation for mlld modules
 */

import { ValidationStep } from '../types/PublishingStrategy';
import type { ModuleData, ValidationResult, ValidationWarning, ValidationError, ValidationContext } from '../types/PublishingTypes';
import type { MlldNode } from '@core/types';
import { DependencyDetector } from '@core/utils/dependency-detector';

export class DependencyValidator implements ValidationStep {
  name = 'dependencies';

  async validate(module: ModuleData, _context: ValidationContext): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!module.metadata.needs || !Array.isArray(module.metadata.needs)) {
      return { valid: true, errors, warnings };
    }

    const ast = Array.isArray(module.ast) ? module.ast : [];
    const detector = new DependencyDetector();

    await this.checkJavaScriptDependencies(module, ast, detector, warnings);
    await this.checkNodeDependencies(module, ast, detector, warnings);
    await this.checkPythonDependencies(module, ast, detector, warnings);
    await this.checkShellDependencies(module, ast, detector, warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private async checkJavaScriptDependencies(
    module: ModuleData,
    ast: MlldNode[],
    detector: DependencyDetector,
    warnings: ValidationWarning[]
  ): Promise<void> {
    if (module.metadata.needs.includes('js') && !module.metadata.needsJs) {
      try {
        const packages = detector.detectJavaScriptPackages(ast);
        if (packages.length > 0) {
          warnings.push({
            field: 'needs-js',
            message: `Module declares "js" in needs but missing needs-js details.\n` +
                    `    Detected packages: ${packages.join(', ')}`,
          });
        }
      } catch {
        // Ignore detection errors
      }
    }
  }

  private async checkNodeDependencies(
    module: ModuleData,
    ast: MlldNode[],
    detector: DependencyDetector,
    warnings: ValidationWarning[]
  ): Promise<void> {
    if (module.metadata.needs.includes('node') && !module.metadata.needsNode) {
      try {
        const packages = detector.detectNodePackages(ast);
        if (packages.length > 0) {
          warnings.push({
            field: 'needs-node',
            message: `Module declares "node" in needs but missing needs-node details.\n` +
                    `    Detected packages: ${packages.join(', ')}`,
          });
        }
      } catch {
        // Ignore detection errors
      }
    }
  }

  private async checkPythonDependencies(
    module: ModuleData,
    ast: MlldNode[],
    detector: DependencyDetector,
    warnings: ValidationWarning[]
  ): Promise<void> {
    if (module.metadata.needs.includes('py') && !module.metadata.needsPy) {
      try {
        const packages = detector.detectPythonPackages(ast);
        if (packages.length > 0) {
          warnings.push({
            field: 'needs-py',
            message: `Module declares "py" in needs but missing needs-py details.\n` +
                    `    Detected packages: ${packages.join(', ')}`,
          });
        }
      } catch {
        // Ignore detection errors
      }
    }
  }

  private async checkShellDependencies(
    module: ModuleData,
    ast: MlldNode[],
    detector: DependencyDetector,
    warnings: ValidationWarning[]
  ): Promise<void> {
    if (module.metadata.needs.includes('sh') && !module.metadata.needsSh) {
      try {
        const commands = detector.detectShellCommands(ast);
        if (commands.length > 0) {
          warnings.push({
            field: 'needs-sh',
            message: `Module declares "sh" in needs but missing needs-sh details.\n` +
                    `    Detected commands: ${commands.join(', ')}`,
          });
        }
      } catch {
        // Ignore detection errors
      }
    }
  }
}
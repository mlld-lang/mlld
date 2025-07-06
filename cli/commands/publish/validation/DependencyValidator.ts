/**
 * Dependency validation for mlld modules
 */

import { ValidationStep } from '../types/PublishingStrategy';
import { ModuleMetadata, ValidationResult } from '../types/PublishingTypes';
import { DependencyDetector } from '@core/utils/dependency-detector';
import { parseSync } from '@grammar/parser';

interface ModuleData {
  metadata: ModuleMetadata;
  content: string;
  filePath: string;
}

export class DependencyValidator implements ValidationStep {
  name = 'dependencies';

  async validate(module: ModuleData): Promise<ValidationResult> {
    const errors: any[] = [];
    const warnings: any[] = [];

    if (!module.metadata.needs || !Array.isArray(module.metadata.needs)) {
      // Skip dependency validation if needs is not properly defined
      // This will be caught by metadata validation
      return {
        valid: true,
        errors: [],
        warnings: []
      };
    }

    try {
      const ast = parseSync(module.content);
      const detector = new DependencyDetector();
      
      // Check for missing dependency details
      await this.checkJavaScriptDependencies(module, ast, detector, warnings);
      await this.checkNodeDependencies(module, ast, detector, warnings);
      await this.checkPythonDependencies(module, ast, detector, warnings);
      await this.checkShellDependencies(module, ast, detector, warnings);
      
    } catch (parseError) {
      // If we can't parse the content, skip dependency validation
      // This will be caught by syntax validation
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private async checkJavaScriptDependencies(
    module: ModuleData,
    ast: any[],
    detector: DependencyDetector,
    warnings: any[]
  ): Promise<void> {
    if (module.metadata.needs.includes('js') && !module.metadata.needsJs) {
      try {
        const packages = detector.detectJavaScriptPackages(ast);
        if (packages.length > 0) {
          warnings.push({
            field: 'needs-js',
            message: `Module declares "js" in needs but missing needs-js details.\n` +
                    `    Detected packages: ${packages.join(', ')}`,
            severity: 'warning' as const
          });
        }
      } catch {
        // Ignore detection errors
      }
    }
  }

  private async checkNodeDependencies(
    module: ModuleData,
    ast: any[],
    detector: DependencyDetector,
    warnings: any[]
  ): Promise<void> {
    if (module.metadata.needs.includes('node') && !module.metadata.needsNode) {
      try {
        const packages = detector.detectNodePackages(ast);
        if (packages.length > 0) {
          warnings.push({
            field: 'needs-node',
            message: `Module declares "node" in needs but missing needs-node details.\n` +
                    `    Detected packages: ${packages.join(', ')}`,
            severity: 'warning' as const
          });
        }
      } catch {
        // Ignore detection errors
      }
    }
  }

  private async checkPythonDependencies(
    module: ModuleData,
    ast: any[],
    detector: DependencyDetector,
    warnings: any[]
  ): Promise<void> {
    if (module.metadata.needs.includes('py') && !module.metadata.needsPy) {
      try {
        const packages = detector.detectPythonPackages(ast);
        if (packages.length > 0) {
          warnings.push({
            field: 'needs-py',
            message: `Module declares "py" in needs but missing needs-py details.\n` +
                    `    Detected packages: ${packages.join(', ')}`,
            severity: 'warning' as const
          });
        }
      } catch {
        // Ignore detection errors
      }
    }
  }

  private async checkShellDependencies(
    module: ModuleData,
    ast: any[],
    detector: DependencyDetector,
    warnings: any[]
  ): Promise<void> {
    if (module.metadata.needs.includes('sh') && !module.metadata.needsSh) {
      try {
        const commands = detector.detectShellCommands(ast);
        if (commands.length > 0) {
          warnings.push({
            field: 'needs-sh',
            message: `Module declares "sh" in needs but missing needs-sh details.\n` +
                    `    Detected commands: ${commands.join(', ')}`,
            severity: 'warning' as const
          });
        }
      } catch {
        // Ignore detection errors
      }
    }
  }
}
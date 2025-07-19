import type { CommandExecutionOptions, ICommandExecutor } from './BaseCommandExecutor';
import { ShellCommandExecutor } from './ShellCommandExecutor';
import { JavaScriptExecutor, type ShadowEnvironment } from './JavaScriptExecutor';
import { NodeExecutor, type NodeShadowEnvironmentProvider } from './NodeExecutor';
import { PythonExecutor, type ShellCommandExecutor as IShellCommandExecutor } from './PythonExecutor';
import { BashExecutor, type VariableProvider } from './BashExecutor';
import type { ErrorUtils, CommandExecutionContext } from '../ErrorUtils';

export interface ExecutorDependencies {
  errorUtils: ErrorUtils;
  workingDirectory: string;
  shadowEnvironment: ShadowEnvironment;
  nodeShadowProvider: NodeShadowEnvironmentProvider;
  variableProvider: VariableProvider;
}

/**
 * Factory for creating and managing command executors based on language/context
 */
export class CommandExecutorFactory {
  private shellExecutor: ShellCommandExecutor;
  private jsExecutor: JavaScriptExecutor;
  private nodeExecutor: NodeExecutor;
  private pythonExecutor: PythonExecutor;
  private bashExecutor: BashExecutor;

  constructor(dependencies: ExecutorDependencies) {
    const { errorUtils, workingDirectory, shadowEnvironment, nodeShadowProvider, variableProvider } = dependencies;

    // Create all executor instances
    this.shellExecutor = new ShellCommandExecutor(errorUtils, workingDirectory);
    this.jsExecutor = new JavaScriptExecutor(errorUtils, workingDirectory, shadowEnvironment);
    this.nodeExecutor = new NodeExecutor(errorUtils, workingDirectory, nodeShadowProvider);
    this.pythonExecutor = new PythonExecutor(errorUtils, workingDirectory, this.shellExecutor);
    this.bashExecutor = new BashExecutor(errorUtils, workingDirectory, variableProvider);
  }

  /**
   * Execute a shell command
   */
  async executeCommand(
    command: string,
    options?: CommandExecutionOptions,
    context?: CommandExecutionContext
  ): Promise<string> {
    return this.shellExecutor.execute(command, options, context);
  }

  /**
   * Execute code in a specific language
   */
  async executeCode(
    code: string,
    language: string,
    params?: Record<string, any>,
    metadata?: Record<string, any>,
    options?: CommandExecutionOptions,
    context?: CommandExecutionContext
  ): Promise<string> {
    const executor = this.getCodeExecutor(language);
    
    if (!executor) {
      throw new Error(`Unsupported code language: ${language}`);
    }

    // Different executors have different signatures, so we need to handle this
    if (executor === this.jsExecutor) {
      return this.jsExecutor.execute(code, options, context, params, metadata);
    } else if (executor === this.nodeExecutor) {
      return this.nodeExecutor.execute(code, options, context, params, metadata);
    } else if (executor === this.pythonExecutor) {
      return this.pythonExecutor.execute(code, options, context, params, metadata);
    } else if (executor === this.bashExecutor) {
      return this.bashExecutor.execute(code, options, context, params, metadata);
    }

    // Fallback (shouldn't reach here)
    return executor.execute(code, options, context);
  }

  /**
   * Get the appropriate executor for a given language
   */
  private getCodeExecutor(language: string): ICommandExecutor | null {
    switch (language.toLowerCase()) {
      case 'javascript':
      case 'js':
        return this.jsExecutor;
      
      case 'node':
      case 'nodejs':
        return this.nodeExecutor;
      
      case 'python':
      case 'py':
        return this.pythonExecutor;
      
      case 'bash':
      case 'sh':
      case 'shell':
        return this.bashExecutor;
      
      default:
        return null;
    }
  }

  /**
   * Get the shell executor for direct access
   */
  getShellExecutor(): ShellCommandExecutor {
    return this.shellExecutor;
  }

  /**
   * Get the JavaScript executor for direct access
   */
  getJavaScriptExecutor(): JavaScriptExecutor {
    return this.jsExecutor;
  }

  /**
   * Get the Node executor for direct access
   */
  getNodeExecutor(): NodeExecutor {
    return this.nodeExecutor;
  }

  /**
   * Get the Python executor for direct access
   */
  getPythonExecutor(): PythonExecutor {
    return this.pythonExecutor;
  }

  /**
   * Get the Bash executor for direct access
   */
  getBashExecutor(): BashExecutor {
    return this.bashExecutor;
  }
}
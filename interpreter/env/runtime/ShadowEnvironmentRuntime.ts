import type { ShadowEnvironment } from '../executors/JavaScriptExecutor';
import type { NodeShadowEnvironmentProvider } from '../executors/NodeExecutor';
import type { PythonShadowEnvironmentProvider } from '../executors/PythonExecutor';
import { NodeShadowEnvironment } from '../NodeShadowEnvironment';
import { PythonShadowEnvironment } from '../PythonShadowEnvironment';
import type { ShadowEnvironmentCapture } from '../types/ShadowEnvironmentCapture';

export interface ShadowEnvironmentPathProvider {
  getFileDirectory(): string;
  getCurrentFilePath(): string | undefined;
}

type ShadowFunctions = Map<string, any>;

export class ShadowEnvironmentRuntime
  implements ShadowEnvironment, NodeShadowEnvironmentProvider, PythonShadowEnvironmentProvider
{
  private readonly shadowEnvs: Map<string, ShadowFunctions> = new Map();
  private nodeShadowEnv?: NodeShadowEnvironment;
  private pythonShadowEnv?: PythonShadowEnvironment;

  constructor(
    private readonly pathProvider: ShadowEnvironmentPathProvider,
    private readonly parent?: ShadowEnvironmentRuntime
  ) {}

  setShadowEnv(language: string, functions: ShadowFunctions): void {
    if (language === 'node' || language === 'nodejs') {
      const nodeEnv = this.ensureNodeShadowEnv();
      for (const [name, fn] of functions) {
        nodeEnv.addFunction(name, fn);
      }
      return;
    }

    if (language === 'python' || language === 'py') {
      this.ensurePythonShadowEnv();
      this.shadowEnvs.set(language, functions);
      return;
    }

    this.shadowEnvs.set(language, functions);
  }

  getShadowEnv(language: string): ShadowFunctions | undefined {
    if (language === 'node' || language === 'nodejs') {
      const nodeEnv = this.getNodeShadowEnv();
      if (!nodeEnv) {
        return undefined;
      }
      return this.toNodeFunctionMap(nodeEnv);
    }

    return this.shadowEnvs.get(language) ?? this.parent?.getShadowEnv(language);
  }

  getNodeShadowEnv(): NodeShadowEnvironment | undefined {
    return this.nodeShadowEnv ?? this.parent?.getNodeShadowEnv();
  }

  getCurrentFilePath(): string | undefined {
    return this.pathProvider.getCurrentFilePath();
  }

  getOrCreateNodeShadowEnv(): NodeShadowEnvironment {
    if (this.nodeShadowEnv) {
      return this.nodeShadowEnv;
    }

    const parentNodeEnv = this.parent?.getNodeShadowEnv();
    if (parentNodeEnv) {
      return parentNodeEnv;
    }

    this.nodeShadowEnv = this.createNodeShadowEnv();
    return this.nodeShadowEnv;
  }

  getPythonShadowEnv(): PythonShadowEnvironment | undefined {
    return this.pythonShadowEnv ?? this.parent?.getPythonShadowEnv();
  }

  getOrCreatePythonShadowEnv(): PythonShadowEnvironment {
    if (this.pythonShadowEnv) {
      return this.pythonShadowEnv;
    }

    const parentPythonEnv = this.parent?.getPythonShadowEnv();
    if (parentPythonEnv) {
      return parentPythonEnv;
    }

    this.pythonShadowEnv = this.createPythonShadowEnv();
    return this.pythonShadowEnv;
  }

  captureAllShadowEnvs(): ShadowEnvironmentCapture {
    const capture: ShadowEnvironmentCapture = {};

    const jsEnv = this.shadowEnvs.get('js');
    if (jsEnv && jsEnv.size > 0) {
      capture.js = new Map(jsEnv);
    }

    const javascriptEnv = this.shadowEnvs.get('javascript');
    if (javascriptEnv && javascriptEnv.size > 0) {
      capture.javascript = new Map(javascriptEnv);
    }

    if (this.nodeShadowEnv) {
      const nodeMap = this.toNodeFunctionMap(this.nodeShadowEnv);
      if (nodeMap.size > 0) {
        capture.node = nodeMap;
        capture.nodejs = nodeMap;
      }
    }

    const pythonEnv = this.shadowEnvs.get('python');
    if (pythonEnv && pythonEnv.size > 0) {
      capture.python = new Map(pythonEnv);
      capture.py = capture.python;
    }

    const pyEnv = this.shadowEnvs.get('py');
    if (pyEnv && pyEnv.size > 0 && !capture.python) {
      capture.py = new Map(pyEnv);
      capture.python = capture.py;
    }

    return capture;
  }

  hasShadowEnvs(): boolean {
    for (const env of this.shadowEnvs.values()) {
      if (env.size > 0) {
        return true;
      }
    }

    return this.nodeShadowEnv !== undefined || this.pythonShadowEnv !== undefined;
  }

  cleanup(): void {
    if (this.nodeShadowEnv) {
      this.nodeShadowEnv.cleanup();
      this.nodeShadowEnv = undefined;
    }

    if (this.pythonShadowEnv) {
      this.pythonShadowEnv.cleanup().catch(() => {});
      this.pythonShadowEnv = undefined;
    }

    this.shadowEnvs.clear();
  }

  private ensureNodeShadowEnv(): NodeShadowEnvironment {
    if (!this.nodeShadowEnv) {
      this.nodeShadowEnv = this.createNodeShadowEnv();
    }
    return this.nodeShadowEnv;
  }

  private ensurePythonShadowEnv(): PythonShadowEnvironment {
    if (!this.pythonShadowEnv) {
      this.pythonShadowEnv = this.createPythonShadowEnv();
    }
    return this.pythonShadowEnv;
  }

  private createNodeShadowEnv(): NodeShadowEnvironment {
    return new NodeShadowEnvironment(
      this.pathProvider.getFileDirectory(),
      this.pathProvider.getCurrentFilePath()
    );
  }

  private createPythonShadowEnv(): PythonShadowEnvironment {
    return new PythonShadowEnvironment(
      this.pathProvider.getFileDirectory(),
      this.pathProvider.getCurrentFilePath()
    );
  }

  private toNodeFunctionMap(nodeShadowEnv: NodeShadowEnvironment): ShadowFunctions {
    const context = nodeShadowEnv.getContext();
    const map: ShadowFunctions = new Map();
    for (const name of nodeShadowEnv.getFunctionNames()) {
      if (context[name]) {
        map.set(name, context[name]);
      }
    }
    return map;
  }
}

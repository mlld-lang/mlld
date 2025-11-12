import type { Environment } from '../../env/Environment';
import type { PipelineCommand } from '@core/types';
import { appendContentToFile } from '../append';

// Minimal builtin effects support for pipelines. These are inline effects that
// do not create stages and run after the owning stage succeeds.

const BUILTIN_EFFECTS = new Set<string>([
  'log', 'LOG',
  'output', 'OUTPUT',
  'show', 'SHOW',
  'append', 'APPEND'
]);

export function isBuiltinEffect(name: string): boolean {
  return BUILTIN_EFFECTS.has(name);
}

export function getBuiltinEffects(): string[] {
  return Array.from(new Set(Array.from(BUILTIN_EFFECTS).map(n => n.toLowerCase()))).sort();
}

// Evaluate a single effect argument into a string using the stage environment
async function evaluateEffectArg(arg: any, env: Environment): Promise<string> {
  // UnifiedArgumentList items can be Text nodes, VariableReference, nested exec, objects, arrays, etc.
  // We reuse interpolate for a best-effort string evaluation.
  const { interpolate } = await import('../../core/interpreter');
  if (Array.isArray(arg)) {
    return String(await interpolate(arg, env));
  }
  return String(await interpolate([arg], env));
}

// Execute a builtin effect. Returns void; throws on error to abort the pipeline.
export async function runBuiltinEffect(
  effect: PipelineCommand,
  stageOutput: string,
  env: Environment
): Promise<void> {
  const name = effect.rawIdentifier;
  switch (name) {
    case 'log':
    case 'LOG': {
      let content: string;
      if (effect.args && effect.args.length > 0) {
        const parts: string[] = [];
        for (const a of effect.args) {
          parts.push(await evaluateEffectArg(a, env));
        }
        content = parts.join(' ');
      } else {
        // Default to logging the stage output
        content = stageOutput;
      }
      if (!content.endsWith('\n')) content += '\n';
      // Prefer stderr for logs per policy
      env.emitEffect('stderr', content);
      return;
    }

    case 'show':
    case 'SHOW': {
      let content: string;
      if (effect.args && effect.args.length > 0) {
        const parts: string[] = [];
        for (const a of effect.args) {
          parts.push(await evaluateEffectArg(a, env));
        }
        content = parts.join(' ');
      } else {
        content = stageOutput;
      }
      if (!content.endsWith('\n')) content += '\n';
      // Show writes to stdout (if streaming) and appends to document
      env.emitEffect('both', content);
      return;
    }

    case 'output':
    case 'OUTPUT': {
      // args[0] = optional source; args[1] = required target object
      // Determine content: if two or more args, first is source; with one or zero args, use stage output
      let content = stageOutput;
      if (effect.args && effect.args.length >= 2) {
        try {
          content = await evaluateEffectArg(effect.args[0], env);
        } catch {
          content = stageOutput;
        }
      }
      let target: any = null;
      if (effect.args && effect.args.length > 1) {
        target = effect.args[1];
      } else if (effect.args && effect.args.length === 1) {
        // No explicit source; single arg is the target
        target = effect.args[0];
      }
      if (!target || typeof target !== 'object' || !target.type) {
        throw new Error('output requires a valid target (file|stream|env|resolver)');
      }

      switch (String(target.type)) {
        case 'file': {
          // Interpolate path nodes; target.path may be node array or primitive
          const { interpolate } = await import('../../core/interpreter');
          const path = await import('path');
          let resolvedPath = '';
          if (Array.isArray(target.path)) {
            resolvedPath = await interpolate(target.path, env);
          } else if (typeof target.path === 'string') {
            resolvedPath = target.path;
          } else if (target.values) {
            resolvedPath = await interpolate(target.values, env);
          }
          if (!resolvedPath) {
            throw new Error('output file target requires a non-empty path');
          }

          // Handle @base prefix used in resolver-style paths
          if (resolvedPath.startsWith('@base/')) {
            const projectRoot = (env as any).getProjectRoot ? (env as any).getProjectRoot() : '/';
            resolvedPath = path.join(projectRoot, resolvedPath.substring(6));
          }

          // Resolve relative paths against project root for consistency with /output
          if (!path.isAbsolute(resolvedPath)) {
            const base = (env as any).getBasePath ? (env as any).getBasePath() : '/';
            resolvedPath = path.resolve(base, resolvedPath);
          }

          // Write via the environment's file system (single target), matching /output behavior
          if (process.env.MLLD_DEBUG === 'true') {
            // eslint-disable-next-line no-console
            console.error('[builtin-effects] output:file →', resolvedPath);
          }
          const fileSystem = (env as any).fileSystem;
          if (!fileSystem || typeof fileSystem.writeFile !== 'function') {
            throw new Error('File system not available for pipeline output');
          }
          const dir = path.dirname(resolvedPath);
          try {
            await fileSystem.mkdir(dir, { recursive: true });
          } catch {
            // Directory may already exist; ignore
          }
          await fileSystem.writeFile(resolvedPath, content);

          // Emit a file effect for handlers/observers
          env.emitEffect('file', content, { path: resolvedPath });
          return;
        }
        case 'stream': {
          const stream = target.stream === 'stderr' ? 'stderr' : 'stdout';
          // Normalize newline like /output
          const payload = content.endsWith('\n') ? content : content + '\n';
          env.emitEffect(stream, payload);
          return;
        }
        case 'env': {
          // Name selection similar to evaluateOutput: default MLLD_OUTPUT
          let varName = 'MLLD_OUTPUT';
          if (target.varname) {
            varName = target.varname;
          } else {
            // Try to derive from source variable identifier
            const src = effect.args && effect.args.length > 0 ? effect.args[0] : null;
            const id = (src && typeof src === 'object' && Array.isArray((src as any).identifier) && (src as any).identifier[0]?.identifier)
              ? (src as any).identifier[0].identifier
              : undefined;
            if (id) varName = `MLLD_${String(id).toUpperCase()}`;
          }
          process.env[varName] = content;
          return;
        }
        case 'resolver': {
          throw new Error('resolver targets not supported yet in pipeline output');
        }
        default:
          throw new Error(`Unknown output target type: ${String(target.type)}`);
      }
    }

    case 'append':
    case 'APPEND': {
      const args = effect.args ?? [];
      const hasExplicitSource = Boolean(effect.meta?.hasExplicitSource);
      const targetArgIndex = hasExplicitSource ? 1 : 0;
      const target = args[targetArgIndex];

      if (!target || typeof target !== 'object' || target.type !== 'file') {
        throw new Error('append requires a file target');
      }

      let payload = stageOutput;
      if (hasExplicitSource && args.length > 0) {
        payload = await evaluateEffectArg(args[0], env);
      }

      await appendContentToFile(target, payload, env, { directiveKind: 'append' });
      return;
    }

    // Placeholder for future effects like 'output' once grammar supports `to ...`
    default:
      throw new Error(`Unsupported builtin effect in pipeline: @${name}`);
  }
}

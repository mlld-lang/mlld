import type { Environment } from '../../env/Environment';
import type { PipelineCommand } from '@core/types';

// Minimal builtin effects support for pipelines. These are inline effects that
// do not create stages and run after the owning stage succeeds.

const BUILTIN_EFFECTS = new Set<string>([
  'log', 'LOG',
  'output', 'OUTPUT',
  'show', 'SHOW'
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
      env.emitEffect('stdout', content);
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
      let content = stageOutput;
      if (effect.args && effect.args.length > 0) {
        // Only treat the first arg as the source; ignore extras
        try {
          content = await evaluateEffectArg(effect.args[0], env);
        } catch {
          // Fall back to stageOutput on evaluation failure
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
          let targetPath = '';
          if (Array.isArray(target.path)) {
            targetPath = await interpolate(target.path, env);
          } else if (typeof target.path === 'string') {
            targetPath = target.path;
          } else if (target.values) {
            targetPath = await interpolate(target.values, env);
          }
          if (!targetPath) {
            throw new Error('output file target requires a non-empty path');
          }
          env.emitEffect('file', content, { path: targetPath });
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

    // Placeholder for future effects like 'output' once grammar supports `to ...`
    default:
      throw new Error(`Unsupported builtin effect in pipeline: @${name}`);
  }
}

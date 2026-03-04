import type { Environment } from '@interpreter/env/Environment';
import { InterpolationContext } from '@interpreter/core/interpolation-context';
import type { SecurityDescriptor } from '@core/types/security';
import { resolveWorkspaceFromVariable } from '@interpreter/utils/workspace-reference';

export class ContentSourceReconstruction {
  async interpolateAndRecord(
    nodes: any,
    env: Environment,
    context: InterpolationContext = InterpolationContext.Default
  ): Promise<string> {
    const { interpolate } = await import('../../core/interpreter');
    const descriptors: SecurityDescriptor[] = [];
    const text = await interpolate(nodes, env, context, {
      collectSecurityDescriptor: descriptor => {
        if (descriptor) {
          descriptors.push(descriptor);
        }
      }
    });
    if (descriptors.length > 0) {
      const merged =
        descriptors.length === 1 ? descriptors[0] : env.mergeSecurityDescriptors(...descriptors);
      env.recordSecurityDescriptor(merged);
    }
    return text;
  }

  async reconstructPath(pathNode: any, env: Environment): Promise<string> {
    if (!pathNode.segments || !Array.isArray(pathNode.segments)) {
      return (pathNode.raw || '').trim();
    }

    const hasVariables = pathNode.segments.some((segment: any) => segment.type === 'VariableReference');
    if (hasVariables) {
      const workspacePath = await this.tryReconstructWorkspaceReference(pathNode, env);
      if (workspacePath) {
        return workspacePath;
      }
      const interpolated = await this.interpolateAndRecord(pathNode.segments, env);
      return interpolated.trim();
    }

    const reconstructed = pathNode.segments.map((segment: any) => {
      if (segment.type === 'Text') {
        return segment.content;
      }
      if (segment.type === 'PathSeparator') {
        return segment.value;
      }
      return '';
    }).join('');

    return reconstructed.trim();
  }

  private async tryReconstructWorkspaceReference(pathNode: any, env: Environment): Promise<string | undefined> {
    const segments = Array.isArray(pathNode?.segments) ? pathNode.segments : [];
    if (segments.length < 2) {
      return undefined;
    }

    const first = segments[0] as { type?: string; identifier?: string } | undefined;
    if (!first || first.type !== 'VariableReference' || typeof first.identifier !== 'string') {
      return undefined;
    }

    for (const segment of segments.slice(1)) {
      if (!segment || typeof segment !== 'object') {
        return undefined;
      }
      if (segment.type !== 'PathSeparator' && segment.type !== 'Text') {
        return undefined;
      }
    }

    const hasWorkspace = Boolean(await resolveWorkspaceFromVariable(first.identifier, env));
    if (!hasWorkspace) {
      return undefined;
    }

    const suffix = segments
      .slice(1)
      .map((segment: any) => segment.type === 'PathSeparator'
        ? String(segment.value ?? '/')
        : String(segment.content ?? '')
      )
      .join('');

    return `@${first.identifier}${suffix}`.trim();
  }

  reconstructUrl(urlNode: any): string {
    if (urlNode.raw) {
      return urlNode.raw;
    }
    const { protocol, host, path } = urlNode;
    return `${protocol}://${host}${path || ''}`;
  }

  stripNullableSuffix(pathOrUrl: string): { pathOrUrl: string; isNullable: boolean } {
    if (pathOrUrl.endsWith('?')) {
      return {
        pathOrUrl: pathOrUrl.slice(0, -1),
        isNullable: true
      };
    }
    return {
      pathOrUrl,
      isNullable: false
    };
  }
}

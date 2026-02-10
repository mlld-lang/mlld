import type { Environment } from '@interpreter/env/Environment';
import { InterpolationContext } from '@interpreter/core/interpolation-context';
import type { SecurityDescriptor } from '@core/types/security';

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

import type { SourceLocation } from '@core/types';
import { createCapabilityContext, makeSecurityDescriptor, type CapabilityContext, type SecurityDescriptor } from '@core/types/security';
import type { SDKEffectEvent } from '@sdk/types';
import type { OutputIntent } from '@interpreter/output/intent';
import { OutputRenderer } from '@interpreter/output/renderer';
import type { EffectHandler } from '../EffectHandler';
import type { SecuritySnapshotLike } from './SecurityPolicyRuntime';

export type EffectType = 'doc' | 'stdout' | 'stderr' | 'both' | 'file';

export interface EffectOptions {
  path?: string;
  source?: SourceLocation;
  mode?: 'append' | 'write';
  metadata?: unknown;
}

export interface OutputCoordinatorContext {
  getSecuritySnapshot(): SecuritySnapshotLike | undefined;
  recordSecurityDescriptor(descriptor: SecurityDescriptor | undefined): void;
  isImportingContent(): boolean;
  isProvenanceEnabled(): boolean;
  hasSDKEmitter(): boolean;
  emitSDKEvent(event: SDKEffectEvent): void;
}

export class OutputCoordinator {
  constructor(
    private effectHandler: EffectHandler,
    private readonly outputRenderer: OutputRenderer
  ) {}

  getEffectHandler(): EffectHandler {
    return this.effectHandler;
  }

  setEffectHandler(effectHandler: EffectHandler): void {
    this.effectHandler = effectHandler;
  }

  emitEffect(
    type: EffectType,
    content: string,
    options: EffectOptions | undefined,
    context: OutputCoordinatorContext
  ): void {
    if (!this.effectHandler) {
      console.error('[WARNING] No effect handler available!');
      return;
    }

    if (type === 'doc' && context.isImportingContent()) {
      return;
    }

    if ((type === 'doc' || type === 'both') && content && !/^\n+$/.test(content)) {
      this.outputRenderer.render();
    }

    const snapshot = context.getSecuritySnapshot();
    let capability: CapabilityContext | undefined;
    if (snapshot) {
      const descriptor = makeSecurityDescriptor({
        labels: snapshot.labels,
        taint: snapshot.taint,
        sources: snapshot.sources,
        policyContext: snapshot.policy ? { ...snapshot.policy } : undefined
      });
      capability = createCapabilityContext({
        kind: 'effect',
        descriptor,
        metadata: {
          effectType: type,
          path: options?.path
        },
        operation: snapshot.operation ?? {
          kind: 'effect',
          effectType: type
        }
      });
      context.recordSecurityDescriptor(descriptor);
    }

    const effect = {
      type,
      content,
      path: options?.path,
      source: options?.source,
      mode: options?.mode,
      metadata: options?.metadata,
      capability
    };

    this.effectHandler.handleEffect(effect);

    if (context.hasSDKEmitter()) {
      const provenance = context.isProvenanceEnabled()
        ? capability?.security ?? makeSecurityDescriptor()
        : undefined;
      context.emitSDKEvent({
        type: 'effect',
        effect: {
          ...effect,
          security: capability?.security ?? makeSecurityDescriptor(),
          ...(provenance && { provenance })
        },
        timestamp: Date.now()
      });
    }
  }

  intentToEffect(intent: OutputIntent, context: OutputCoordinatorContext): void {
    let effectType: EffectType;

    switch (intent.type) {
      case 'content':
        effectType = 'doc';
        break;
      case 'break':
        effectType = 'doc';
        break;
      case 'progress':
        effectType = 'stdout';
        break;
      case 'error':
        effectType = 'stderr';
        break;
      default:
        effectType = 'doc';
    }

    this.emitEffect(effectType, intent.value, undefined, context);
  }

  emitIntent(intent: OutputIntent): void {
    this.outputRenderer.emit(intent);
  }

  renderOutput(): void {
    this.outputRenderer.render();
  }
}

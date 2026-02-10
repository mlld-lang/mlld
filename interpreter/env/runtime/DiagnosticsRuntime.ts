import path from 'path';
import type { SourceLocation } from '@core/types';
import type { DirectiveTrace } from '@core/types/trace';
import type { SecurityDescriptor } from '@core/types/security';
import type { SDKEvent } from '@sdk/types';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import type { CollectedError } from '../ErrorUtils';

interface ErrorCollectorLike {
  getCollectedErrors(): CollectedError[];
  clearCollectedErrors(): void;
}

interface DirectiveTraceState {
  directiveTrace: DirectiveTrace[];
  directiveTimings: number[];
  traceEnabled: boolean;
  currentFilePath?: string;
}

interface DirectiveEventBridge {
  emitSDKEvent(event: SDKEvent): void;
}

interface SourceCacheParent {
  cacheSource(filePath: string, content: string): void;
  getSource(filePath: string): string | undefined;
}

export class DiagnosticsRuntime {
  getCollectedErrors(collector: ErrorCollectorLike): CollectedError[] {
    return collector.getCollectedErrors();
  }

  clearCollectedErrors(collector: ErrorCollectorLike): void {
    collector.clearCollectedErrors();
  }

  async displayCollectedErrors(
    collector: ErrorCollectorLike,
    fileSystem: IFileSystemService,
    basePath: string
  ): Promise<void> {
    const errors = collector.getCollectedErrors();
    if (errors.length === 0) {
      return;
    }

    console.log(`\n❌ ${errors.length} error${errors.length > 1 ? 's' : ''} occurred:\n`);

    const { ErrorFormatSelector } = await import('@core/utils/errorFormatSelector');
    const formatter = new ErrorFormatSelector(fileSystem);

    for (let i = 0; i < errors.length; i++) {
      const item = errors[i];
      console.log(`${i + 1}. Command execution failed:`);

      try {
        const formatted = await formatter.formatForCLI(item.error, {
          useColors: true,
          useSourceContext: true,
          useSmartPaths: true,
          basePath,
          workingDirectory: (process as NodeJS.Process).cwd(),
          contextLines: 2
        });
        console.log(formatted);
      } catch (formatError) {
        console.log(`   ├─ Command: ${item.command}`);
        console.log(`   ├─ Duration: ${item.duration}ms`);
        if (formatError instanceof Error) {
          console.log(`   ├─ ${item.error.message}`);
        }
        if (item.error.details?.exitCode !== undefined) {
          console.log(`   ├─ Exit code: ${item.error.details.exitCode}`);
        }
        console.log('   └─ Use --verbose to see full output\n');
      }
    }

    console.log('💡 Use --verbose to see full command output');
    console.log('💡 Use --help error-handling for error handling options\n');
  }

  pushDirective(
    state: DirectiveTraceState,
    directive: string,
    varName: string | undefined,
    location: SourceLocation | undefined,
    options: { bridge?: DirectiveEventBridge; provenance?: SecurityDescriptor }
  ): void {
    const start = Date.now();
    state.directiveTimings.push(start);

    if (options.bridge) {
      options.bridge.emitSDKEvent({
        type: 'debug:directive:start',
        directive,
        timestamp: start,
        ...(options.provenance && { provenance: options.provenance })
      });
    }

    if (!state.traceEnabled) {
      return;
    }

    const fileName = state.currentFilePath ? path.basename(state.currentFilePath) : 'unknown';
    const lineNumber = location?.line || 'unknown';

    state.directiveTrace.push({
      directive,
      varName,
      location: `${fileName}:${lineNumber}`,
      depth: state.directiveTrace.length
    });
  }

  popDirective(
    state: DirectiveTraceState,
    options: { bridge?: DirectiveEventBridge; provenance?: SecurityDescriptor }
  ): void {
    const start = state.directiveTimings.pop();
    const entry = state.traceEnabled ? state.directiveTrace.pop() : undefined;

    if (options.bridge && start && entry) {
      const durationMs = Date.now() - start;
      options.bridge.emitSDKEvent({
        type: 'debug:directive:complete',
        directive: entry.directive,
        durationMs,
        timestamp: Date.now(),
        ...(options.provenance && { provenance: options.provenance })
      });
    }
  }

  getDirectiveTrace(state: DirectiveTraceState): DirectiveTrace[] {
    return [...state.directiveTrace];
  }

  markLastDirectiveFailed(state: DirectiveTraceState, errorMessage: string): void {
    if (state.directiveTrace.length === 0) {
      return;
    }
    const lastEntry = state.directiveTrace[state.directiveTrace.length - 1];
    lastEntry.failed = true;
    lastEntry.errorMessage = errorMessage;
  }

  setTraceEnabled(state: DirectiveTraceState, enabled: boolean): void {
    state.traceEnabled = enabled;
    if (!enabled) {
      state.directiveTrace = [];
    }
  }

  isTraceEnabled(state: DirectiveTraceState): boolean {
    return state.traceEnabled;
  }

  cacheSource(
    sourceCache: Map<string, string>,
    parent: SourceCacheParent | undefined,
    filePath: string,
    content: string
  ): void {
    if (parent) {
      parent.cacheSource(filePath, content);
      return;
    }
    sourceCache.set(filePath, content);
  }

  getSource(
    sourceCache: Map<string, string>,
    parent: SourceCacheParent | undefined,
    filePath: string
  ): string | undefined {
    const source = sourceCache.get(filePath);
    if (source !== undefined) {
      return source;
    }
    return parent?.getSource(filePath);
  }
}

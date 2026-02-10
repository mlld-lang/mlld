import type { DirectiveNode } from '@core/types';
import { MlldImportError } from '@core/errors';
import type { SerializedGuardDefinition } from '@interpreter/guards';

export interface ImportTypeRouteHandlers {
  handleNamespaceImport: () => Promise<void>;
  handleSelectedImport: () => Promise<void>;
  registerSerializedGuards: (definitions: readonly SerializedGuardDefinition[]) => void;
}

export class ImportTypeRouter {
  async route(
    directive: DirectiveNode,
    guardDefinitions: readonly SerializedGuardDefinition[] | undefined,
    handlers: ImportTypeRouteHandlers
  ): Promise<void> {
    if (directive.subtype === 'importPolicy' || directive.subtype === 'importNamespace') {
      await handlers.handleNamespaceImport();
      return;
    }

    if (directive.subtype === 'importAll') {
      throw new MlldImportError(
        'Wildcard imports \'/import { * }\' are no longer supported. ' +
        'Use namespace imports instead: \'/import "file"\' or \'/import "file" as @name\'',
        directive.location,
        {
          suggestion: 'Change \'/import { * } from "file"\' to \'/import "file"\''
        }
      );
    }

    if (directive.subtype === 'importSelected') {
      if (guardDefinitions && guardDefinitions.length > 0) {
        handlers.registerSerializedGuards(guardDefinitions);
      }
      await handlers.handleSelectedImport();
      return;
    }

    throw new Error(`Unknown import subtype: ${directive.subtype}`);
  }
}

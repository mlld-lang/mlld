import type { DirectiveNode, SourceLocation } from '@core/types';
import type { DataLabel, SecurityDescriptor } from '@core/types/security';
import type { EvaluationContext } from '@interpreter/core/interpreter';
import { interpolate } from '@interpreter/core/interpreter';
import type { Environment } from '@interpreter/env/Environment';
import {
  evaluateLegacyTemplateInvocation,
  evaluateShowExecInvocation,
  evaluateShowInvocation
} from './show-invocation-handlers';
import { evaluateShowForeach, evaluateShowForeachSection } from './show-foreach-handlers';
import { evaluateShowPath, evaluateShowPathSection } from './show-path-handlers';
import { evaluateShowCode, evaluateShowCommand } from './show-runtime-handlers';
import { evaluateShowLoadContent, evaluateShowTemplate } from './show-template-load-handlers';
import { ShowDescriptorCollector } from './shared-helpers';
import { evaluateShowVariable } from './show-variable';

export interface ShowDispatchParams {
  directive: DirectiveNode;
  env: Environment;
  context?: EvaluationContext;
  descriptorCollector: ShowDescriptorCollector;
  collectInterpolatedDescriptor: (descriptor?: SecurityDescriptor) => void;
  directiveLocation: SourceLocation | null;
  securityLabels?: DataLabel[];
}

export interface ShowDispatchResult {
  content: string;
  resultValue?: unknown;
  skipJsonFormatting?: boolean;
  isStreamingShow?: boolean;
}

async function evaluateInterpolatedContent(
  directive: DirectiveNode,
  env: Environment,
  collectInterpolatedDescriptor: (descriptor?: SecurityDescriptor) => void
): Promise<string> {
  let templateNodes = directive.values?.content;
  if (!templateNodes) {
    return '';
  }

  if (
    directive.subtype === 'show' &&
    Array.isArray(templateNodes) &&
    templateNodes.length === 1 &&
    templateNodes[0].content &&
    templateNodes[0].wrapperType
  ) {
    templateNodes = templateNodes[0].content;
  }

  return interpolate(templateNodes, env, undefined, {
    collectSecurityDescriptor: collectInterpolatedDescriptor
  });
}

export async function dispatchShowSubtype({
  directive,
  env,
  context,
  descriptorCollector,
  collectInterpolatedDescriptor,
  directiveLocation,
  securityLabels
}: ShowDispatchParams): Promise<ShowDispatchResult> {
  switch (directive.subtype) {
    case 'showVariable': {
      const showVariableResult = await evaluateShowVariable({
        directive,
        env,
        context,
        collectInterpolatedDescriptor,
        descriptorCollector,
        directiveLocation
      });
      return {
        content: showVariableResult.content,
        resultValue: showVariableResult.resultValue,
        skipJsonFormatting: showVariableResult.skipJsonFormatting
      };
    }

    case 'showPath':
      return {
        content: await evaluateShowPath({
          directive,
          env,
          directiveLocation,
          collectInterpolatedDescriptor
        })
      };

    case 'showPathSection':
      return {
        content: await evaluateShowPathSection({
          directive,
          env,
          directiveLocation,
          collectInterpolatedDescriptor
        })
      };

    case 'showTemplate':
      return {
        content: await evaluateShowTemplate({
          directive,
          env,
          collectInterpolatedDescriptor
        })
      };

    case 'addInvocation':
    case 'showInvocation': {
      const invocationResult = await evaluateShowInvocation({
        directive,
        env,
        context,
        collectInterpolatedDescriptor,
        securityLabels
      });
      return {
        content: invocationResult.content,
        resultValue: invocationResult.resultValue,
        isStreamingShow: invocationResult.isStreamingShow
      };
    }

    case 'addTemplateInvocation': {
      const templateInvocationResult = await evaluateLegacyTemplateInvocation({
        directive,
        env,
        collectInterpolatedDescriptor
      });
      return {
        content: templateInvocationResult.content,
        resultValue: templateInvocationResult.resultValue
      };
    }

    case 'addForeach':
    case 'showForeach': {
      const foreachResult = await evaluateShowForeach(directive, env);
      return { content: foreachResult.content };
    }

    case 'addExecInvocation':
    case 'showExecInvocation': {
      const execInvocationResult = await evaluateShowExecInvocation({
        directive,
        env,
        collectInterpolatedDescriptor
      });
      return {
        content: execInvocationResult.content,
        resultValue: execInvocationResult.resultValue,
        skipJsonFormatting: execInvocationResult.skipJsonFormatting
      };
    }

    case 'showForeachSection': {
      const foreachSectionResult = await evaluateShowForeachSection(directive, env);
      return { content: foreachSectionResult.content };
    }

    case 'showLoadContent': {
      const loadContentResult = await evaluateShowLoadContent({
        directive,
        env,
        collectInterpolatedDescriptor
      });
      return {
        content: loadContentResult.content,
        resultValue: loadContentResult.resultValue
      };
    }

    case 'showCommand': {
      const commandResult = await evaluateShowCommand({
        directive,
        env,
        directiveLocation,
        collectInterpolatedDescriptor
      });
      return {
        content: commandResult.content,
        resultValue: commandResult.resultValue
      };
    }

    case 'showCode': {
      const codeResult = await evaluateShowCode({
        directive,
        env,
        directiveLocation,
        collectInterpolatedDescriptor
      });
      return {
        content: codeResult.content,
        resultValue: codeResult.resultValue
      };
    }

    case 'show':
    case 'showLiteral':
      return {
        content: await evaluateInterpolatedContent(directive, env, collectInterpolatedDescriptor)
      };

    default:
      throw new Error(`Unsupported show subtype: ${directive.subtype}`);
  }
}

import type { DirectiveNode, FieldAccessNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import type { Variable } from '@core/types/variable';
import { PersistentContentStore } from '@disreguard/sig';
import { createSigContextForEnv, normalizeContentVerifyResult } from '@core/security/sig-adapter';
import { isStructuredValue, asText } from '@interpreter/utils/structured-value';

function coerceToString(value: unknown): string {
  if (value === null) return '';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (isStructuredValue(value)) return asText(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function resolveIdentifier(directive: DirectiveNode): string {
  const node = Array.isArray(directive.values?.identifier)
    ? directive.values?.identifier?.[0]
    : (directive.values as any)?.identifier;
  if (!node) {
    throw new Error('Directive missing identifier');
  }
  if (typeof node === 'string') {
    return node.startsWith('@') ? node.slice(1) : node;
  }
  if (node.type === 'VariableReference' && typeof node.identifier === 'string') {
    return node.identifier;
  }
  if (node.type === 'Text' && typeof node.content === 'string') {
    return node.content;
  }
  throw new Error('Directive identifier is invalid');
}

function resolveTextValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const node = value[0] as any;
    if (!node) return undefined;
    if (typeof node === 'string') return node;
    if (node.type === 'Text' && typeof node.content === 'string') return node.content;
  }
  if (value && typeof value === 'object' && 'content' in (value as any)) {
    const content = (value as any).content;
    if (typeof content === 'string') return content;
  }
  return undefined;
}

function formatFieldAccess(fields?: FieldAccessNode[]): string {
  if (!fields || fields.length === 0) return '';
  let output = '';
  for (const field of fields) {
    if (!field) continue;
    const optionalSuffix = field.optional ? '?' : '';
    switch (field.type) {
      case 'field':
      case 'numericField':
        output += `.${field.value ?? ''}${optionalSuffix}`;
        break;
      case 'array':
      case 'arrayIndex':
      case 'stringIndex':
        output += `[${field.value ?? ''}]${optionalSuffix}`;
        break;
      case 'bracketAccess':
        output += `[${JSON.stringify(field.value ?? '')}]${optionalSuffix}`;
        break;
      case 'variableIndex': {
        const ref = (field as any).value;
        output += `[${renderVariableReference(ref)}]${optionalSuffix}`;
        break;
      }
      case 'arraySlice': {
        const start = renderSliceIndex((field as any).start);
        const end = renderSliceIndex((field as any).end);
        output += `[${start}:${end}]${optionalSuffix}`;
        break;
      }
      case 'arrayFilter': {
        const condition = renderFilterCondition((field as any).condition);
        output += `[?${condition}]${optionalSuffix}`;
        break;
      }
      default:
        break;
    }
  }
  return output;
}

function renderSliceIndex(index: unknown): string {
  if (index === null || index === undefined) return '';
  if (typeof index === 'number' || typeof index === 'string') return String(index);
  if (index && typeof index === 'object' && (index as any).type === 'VariableReference') {
    return renderVariableReference(index);
  }
  return '';
}

function renderFilterCondition(condition: any): string {
  if (!condition) return '';
  const field = Array.isArray(condition.field)
    ? condition.field.join('.')
    : String(condition.field ?? '');
  if (!condition.operator) {
    return field;
  }
  const value = renderFilterValue(condition.value);
  return `${field}${condition.operator}${value}`;
}

function renderFilterValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value && typeof value === 'object' && (value as any).type === 'VariableReference') {
    return renderVariableReference(value);
  }
  return String(value);
}

function renderVariableReference(node: any): string {
  if (!node || typeof node !== 'object') return '';
  const identifier = node.identifier || node.name || '';
  const fields = formatFieldAccess(node.fields);
  if (node.valueType === 'varInterpolation') {
    return `{{${identifier}${fields}}}`;
  }
  return `@${identifier}${fields}`;
}

function reconstructRawString(nodes: any[] | any): string {
  if (!Array.isArray(nodes)) {
    if (nodes && typeof nodes === 'object') {
      if (nodes.type === 'Text') return nodes.content || '';
      if (nodes.type === 'VariableReference') return renderVariableReference(nodes);
      if (nodes.type === 'ConditionalStringFragment') {
        const conditionRaw = reconstructRawString(nodes.condition);
        const contentRaw = reconstructRawString(nodes.content || []);
        return `${conditionRaw}?"${contentRaw}"`;
      }
      if (nodes.type === 'ConditionalTemplateSnippet') {
        const conditionRaw = reconstructRawString(nodes.condition);
        const contentRaw = reconstructRawString(nodes.content || []);
        return `${conditionRaw}?\`${contentRaw}\``;
      }
      if (nodes.type === 'ConditionalVarOmission') {
        const variableRaw = reconstructRawString(nodes.variable);
        return `${variableRaw}?`;
      }
      if (nodes.type === 'NullCoalescingTight') {
        const variableRaw = reconstructRawString(nodes.variable);
        const fallback = nodes.default || { quote: 'double', value: '' };
        const quote = fallback.quote === 'single' ? '\'' : '"';
        return `${variableRaw}??${quote}${fallback.value || ''}${quote}`;
      }
      if (nodes.type === 'TemplateInlineShow') {
        return renderInlineShow(nodes);
      }
    }
    return String(nodes ?? '');
  }

  let raw = '';
  for (const node of nodes) {
    if (!node) continue;
    if (node.type === 'Text') {
      raw += node.content || '';
    } else if (node.type === 'VariableReference') {
      raw += renderVariableReference(node);
    } else if (node.type === 'PathSeparator' || node.type === 'SectionMarker' || node.type === 'DotSeparator') {
      raw += node.value || '';
    } else if (node.type === 'StringLiteral') {
      raw += node.value || '';
    } else if (node.type === 'ConditionalStringFragment') {
      const conditionRaw = reconstructRawString(node.condition);
      const contentRaw = reconstructRawString(node.content || []);
      raw += `${conditionRaw}?"${contentRaw}"`;
    } else if (node.type === 'ConditionalTemplateSnippet') {
      const conditionRaw = reconstructRawString(node.condition);
      const contentRaw = reconstructRawString(node.content || []);
      raw += `${conditionRaw}?\`${contentRaw}\``;
    } else if (node.type === 'ConditionalVarOmission') {
      const variableRaw = reconstructRawString(node.variable);
      raw += `${variableRaw}?`;
    } else if (node.type === 'NullCoalescingTight') {
      const variableRaw = reconstructRawString(node.variable);
      const fallback = node.default || { quote: 'double', value: '' };
      const quote = fallback.quote === 'single' ? '\'' : '"';
      raw += `${variableRaw}??${quote}${fallback.value || ''}${quote}`;
    } else if (node.type === 'TemplateInlineShow') {
      raw += renderInlineShow(node);
    } else if (typeof node === 'string') {
      raw += node;
    } else {
      raw += node.content || node.value || node.raw || '';
    }
  }
  return raw;
}

function renderInlineShow(node: any): string {
  if (!node || typeof node !== 'object') return '/show';
  const tail = node.tail ? ` ${renderTail(node.tail)}` : '';
  if (node.showKind === 'command' && node.content) {
    const rawCommand = node.content.raw?.command;
    if (typeof rawCommand === 'string') {
      return `/show {${rawCommand}}${tail}`;
    }
    const commandNodes = node.content.values?.command;
    if (Array.isArray(commandNodes)) {
      return `/show {${reconstructRawString(commandNodes)}}${tail}`;
    }
  }
  if (node.showKind === 'template' && node.template) {
    const rawTemplate = node.template.raw?.content;
    if (typeof rawTemplate === 'string') {
      return `/show ${rawTemplate}${tail}`;
    }
    const templateNodes = node.template.values?.content;
    if (Array.isArray(templateNodes)) {
      return `/show ${reconstructRawString(templateNodes)}${tail}`;
    }
  }
  if (node.showKind === 'code' && node.lang && node.code) {
    const lang = Array.isArray(node.lang) ? reconstructRawString(node.lang) : String(node.lang);
    const code = Array.isArray(node.code) ? reconstructRawString(node.code) : node.code.content || '';
    return `/show ${lang} {${code}}${tail}`;
  }
  return `/show${tail}`;
}

function renderTail(tail: any): string {
  if (!tail) return '';
  if (tail.pipeline && Array.isArray(tail.pipeline)) {
    const pipes = tail.pipeline
      .map((pipe: any) => pipe.rawIdentifier || pipe.identifier?.[0]?.identifier || '')
      .filter(Boolean)
      .map((name: string) => `| @${name}`)
      .join(' ');
    return pipes;
  }
  return '';
}

export function getSignatureContent(variable: Variable): string {
  if (variable.type === 'template') {
    const raw = variable.internal?.templateRaw;
    if (typeof raw === 'string') {
      return raw;
    }
    if (Array.isArray(variable.value)) {
      return reconstructRawString(variable.value);
    }
    if (Array.isArray(variable.internal?.templateAst)) {
      return reconstructRawString(variable.internal?.templateAst);
    }
    if (typeof variable.value === 'string') {
      return variable.value;
    }
  }
  if (variable.type === 'executable') {
    const execDef = (variable.internal as any)?.executableDef;
    if (execDef && typeof execDef === 'object' && execDef.type === 'template') {
      const templateNodes = execDef.template ?? (variable.value as any)?.template;
      if (Array.isArray(templateNodes)) {
        return reconstructRawString(templateNodes);
      }
      if (typeof templateNodes === 'string') {
        return templateNodes;
      }
    }
  }
  return coerceToString(variable.value);
}

export async function evaluateSign(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  const varName = resolveIdentifier(directive);
  const method = resolveTextValue(directive.values?.method);
  if (method && method.toLowerCase() !== 'sha256') {
    throw new Error(`Unsupported signing method: ${method}`);
  }
  const signedBy = resolveTextValue(directive.values?.signedBy);
  const variable = env.getVariable(varName);
  if (!variable) {
    throw new Error(`Variable not found for signing: @${varName}`);
  }

  const content = getSignatureContent(variable);
  const store = new PersistentContentStore(createSigContextForEnv(env));
  const record = await store.sign(content, { id: varName, identity: signedBy });
  return { value: record, env };
}

export async function evaluateVerify(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  const varName = resolveIdentifier(directive);
  const variable = env.getVariable(varName);
  if (!variable) {
    throw new Error(`Variable not found for verification: @${varName}`);
  }
  const content = getSignatureContent(variable);
  const store = new PersistentContentStore(createSigContextForEnv(env));
  const result = await store.verify(varName, { content, detail: 'directive:verify' });
  return { value: normalizeContentVerifyResult(result), env };
}

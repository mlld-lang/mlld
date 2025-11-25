const BUILTIN_PATHS = [
  'message.content[].text',
  'result',
  'delta.text',
  'completion',
  'error.message'
];

type ExtractedKind = 'message' | 'thinking' | 'tool-use' | 'tool-result' | 'error' | 'unknown';

function formatToolInput(input: any): string {
  if (input === undefined || input === null) return '';
  try {
    const str = JSON.stringify(input);
    if (str.length <= 80) return str;
    if (typeof input === 'object') {
      const keys = Object.keys(input);
      const preview = keys.slice(0, 3).join(', ');
      return `{${preview}${keys.length > 3 ? ', ...' : ''}}`;
    }
    return str.slice(0, 77) + '...';
  } catch {
    return String(input);
  }
}

function formatToolResult(result: any): string {
  try {
    const str = typeof result === 'string' ? result : JSON.stringify(result);
    if (str.length <= 200) return str;
    const truncated = str.substring(0, 197);
    const lastSpace = truncated.lastIndexOf(' ');
    const cutoff = lastSpace > 150 ? truncated.substring(0, lastSpace) : truncated;
    return `${cutoff}...`;
  } catch {
    return String(result);
  }
}

function getAtPath(obj: any, path: string): any {
  const segments = path.split('.');
  let current: any = obj;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.endsWith('[]')) {
      const key = seg.slice(0, -2);
      const arr = current?.[key];
      if (!Array.isArray(arr)) return undefined;
      const remaining = segments.slice(i + 1);
      if (remaining.length === 0) return arr;
      const results: any[] = [];
      for (const item of arr) {
        const val = getAtPath(item, remaining.join('.'));
        if (val !== undefined) {
          if (Array.isArray(val)) {
            results.push(...val);
          } else {
            results.push(val);
          }
        }
      }
      return results.length === 0 ? undefined : results;
    }
    const key = seg;
    current = current?.[key];
    if (current === undefined) return undefined;
  }
  return current;
}

export function extractTextFromEvent(event: any): string | undefined {
  for (const path of BUILTIN_PATHS) {
    const val = getAtPath(event, path);
    if (val === undefined || val === null) continue;
    if (Array.isArray(val)) {
      const first = val.find(v => typeof v === 'string' && v.trim());
      if (typeof first === 'string' && first.trim()) {
        return first;
      }
      continue;
    }
    if (typeof val === 'string' && val.trim()) {
      return val;
    }
  }
  return undefined;
}

export function classifyEvent(event: any): { kind: ExtractedKind; text?: string; raw?: any } {
  const thinking = getAtPath(event, 'message.content[]');
  if (Array.isArray(thinking)) {
    const t = thinking.find((v: any) => v && (v.type === 'thinking' || v.type === 'reasoning'));
    if (t && t.thinking) {
      return { kind: 'thinking', text: String(t.thinking) };
    }
    if (t && t.text) {
      return { kind: 'thinking', text: String(t.text) };
    }
  }
  const thinkingFlat = getAtPath(event, 'message.content[].thinking');
  if (thinkingFlat) {
    const txt = Array.isArray(thinkingFlat) ? thinkingFlat.join(' ') : String(thinkingFlat);
    return { kind: 'thinking', text: txt };
  }

  const toolUses = getAtPath(event, 'message.content[]');
  if (Array.isArray(toolUses)) {
    const tu = toolUses.find((t: any) => t && t.type === 'tool_use');
    if (tu) {
      const name = tu.name || 'tool';
      const input = formatToolInput(tu.input ?? tu.parameters);
      return { kind: 'tool-use', text: `🔧 ${name}${input ? ` input=${input}` : ''}` };
    }
    const tr = toolUses.find((t: any) => t && (t.type === 'tool_result' || t.type === 'tool_result_block'));
    if (tr) {
      const out = tr.output ?? tr.result ?? tr.content ?? tr.text;
      const formatted = formatToolResult(out ?? '');
      return { kind: 'tool-result', text: `🔧 result: ${formatted}` };
    }
  }

  const msg = extractTextFromEvent(event);
  if (msg) return { kind: 'message', text: msg };

  const err = getAtPath(event, 'error.message');
  if (err) return { kind: 'error', text: String(err) };

  return { kind: 'unknown', raw: event };
}

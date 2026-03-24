/**
 * Apply header transformation to content.
 * Supports:
 * 1. Header level only: "###" -> changes level, keeps text.
 * 2. Text only: "New Title" -> keeps original level, replaces text.
 * 3. Full header: "### New Title" -> replaces entire heading line.
 */
export function applyHeaderTransform(content: string, newHeader: string): string {
  const lines = content.split('\n');
  if (lines.length === 0) {
    return newHeader;
  }

  if (lines[0].match(/^#+\s/)) {
    const newHeaderTrimmed = newHeader.trim();
    const headerMatch = newHeaderTrimmed.match(/^(#+)(\s+(.*))?$/);

    if (headerMatch) {
      if (!headerMatch[3]) {
        const originalText = lines[0].replace(/^#+\s*/, '');
        lines[0] = `${headerMatch[1]} ${originalText}`;
      } else {
        lines[0] = newHeaderTrimmed;
      }
    } else {
      const originalLevel = lines[0].match(/^(#+)\s/)?.[1] || '#';
      lines[0] = `${originalLevel} ${newHeaderTrimmed}`;
    }
  } else {
    lines.unshift(newHeader);
  }

  return lines.join('\n');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract a section from markdown content by heading name.
 * Preserves all content as-is (no markdown parsing/re-serialization).
 */
export function extractSection(content: string, sectionName: string): string {
  return extractMarkdownSection(content, sectionName, { includeTitle: true });
}

export interface ExtractSectionOptions {
  includeTitle?: boolean;
}

/**
 * Text-based markdown section extraction that preserves all content verbatim.
 * Finds the heading matching sectionName and returns everything up to the next
 * same-or-higher-level heading.
 */
export function extractMarkdownSection(
  content: string,
  sectionName: string,
  options: ExtractSectionOptions = {}
): string {
  const { includeTitle = true } = options;
  const lines = content.split('\n');
  const normalizedName = sectionName.replace(/^#+\s*/, '').trim();
  const escapedName = escapeRegExp(normalizedName);
  const sectionRegex = new RegExp(`^\\s{0,3}#{1,6}\\s+${escapedName}\\s*$`, 'i');

  let sectionStart = -1;
  let sectionLevel = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    if (sectionRegex.test(line)) {
      sectionStart = i;
      sectionLevel = line.match(/^#{1,6}/)?.[0].length || 0;
      break;
    }
  }

  if (sectionStart === -1) {
    return '';
  }

  const startLine = includeTitle ? sectionStart : sectionStart + 1;
  const sectionLines: string[] = [];

  for (let i = startLine; i < lines.length; i++) {
    if (i > sectionStart) {
      const match = lines[i].match(/^\s{0,3}(#{1,6})\s+/);
      if (match && match[1].length <= sectionLevel) {
        break;
      }
    }
    sectionLines.push(lines[i]);
  }

  return sectionLines.join('\n').trim();
}

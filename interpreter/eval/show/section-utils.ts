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
 * Extract a section from markdown content.
 */
export function extractSection(content: string, sectionName: string): string {
  const lines = content.split('\\n');
  const normalizedName = sectionName.replace(/^#+\\s*/, '').trim();
  const escapedName = escapeRegExp(normalizedName);
  const sectionRegex = new RegExp(`^#{1,6}\\s+${escapedName}\\s*$`, 'i');

  let inSection = false;
  let sectionLevel = 0;
  const sectionLines: string[] = [];

  for (const line of lines) {
    const lineForMatch = line.trimEnd();
    if (!inSection && sectionRegex.test(lineForMatch)) {
      inSection = true;
      sectionLevel = lineForMatch.match(/^#+/)?.[0].length || 0;
      sectionLines.push(lineForMatch);
      continue;
    }

    if (inSection) {
      const headerMatch = lineForMatch.match(/^(#{1,6})\\s+/);
      if (headerMatch && headerMatch[1].length <= sectionLevel) {
        break;
      }
      sectionLines.push(lineForMatch);
    }
  }

  return sectionLines.join('\\n').trim();
}

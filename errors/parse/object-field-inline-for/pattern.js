export const pattern = {
  name: 'object-field-inline-for',

  test(error, mx) {
    if (!mx.lines || !mx.lineNumber) return false;

    let match = null;
    const start = Math.max(0, mx.lineNumber - 3);
    const end = Math.min(mx.lines.length - 1, mx.lineNumber + 2);

    for (let i = start; i <= end; i++) {
      const line = mx.lines[i];
      if (!line) continue;

      const inlineMatch = line.match(
        /([A-Za-z_][\w-]*)\s*:\s*(for\s+@\w[\s\S]*?)(?=\s*(?:,\s*[A-Za-z_][\w-]*\s*:|\}))/
      );
      if (inlineMatch) {
        const expression = inlineMatch[2].trim();
        match = {
          lineNumber: i + 1,
          fieldLine: `${inlineMatch[1]}: ${expression}`,
          fieldName: inlineMatch[1],
          expression
        };
        break;
      }

      const fieldOnlyMatch = line.match(/([A-Za-z_][\w-]*)\s*:\s*$/);
      const nextLine = mx.lines[i + 1];
      const nextLineMatch = nextLine && nextLine.match(/^\s*(for\s+@\w[\s\S]*)$/);
      if (fieldOnlyMatch && nextLineMatch) {
        match = {
          lineNumber: i + 1,
          fieldLine: `${line.trim()} ${nextLineMatch[1].trim()}`.trim(),
          fieldName: fieldOnlyMatch[1],
          expression: nextLineMatch[1].trim()
        };
        break;
      }
    }

    if (!match) return false;

    const message = error.message || '';
    return (
      message.includes('Invalid var syntax') ||
      message.includes('Invalid let syntax') ||
      message.includes('data object literal') ||
      message.includes('when RHS action') ||
      message.includes('Expected')
    );
  },

  enhance(error, mx) {
    let match = null;

    if (mx.lines && mx.lineNumber) {
      const start = Math.max(0, mx.lineNumber - 3);
      const end = Math.min(mx.lines.length - 1, mx.lineNumber + 2);

      for (let i = start; i <= end; i++) {
        const line = mx.lines[i];
        if (!line) continue;

        const inlineMatch = line.match(
          /([A-Za-z_][\w-]*)\s*:\s*(for\s+@\w[\s\S]*?)(?=\s*(?:,\s*[A-Za-z_][\w-]*\s*:|\}))/
        );
        if (inlineMatch) {
          const expression = inlineMatch[2].trim();
          match = {
            lineNumber: i + 1,
            fieldLine: `${inlineMatch[1]}: ${expression}`,
            fieldName: inlineMatch[1],
            expression
          };
          break;
        }

        const fieldOnlyMatch = line.match(/([A-Za-z_][\w-]*)\s*:\s*$/);
        const nextLine = mx.lines[i + 1];
        const nextLineMatch = nextLine && nextLine.match(/^\s*(for\s+@\w[\s\S]*)$/);
        if (fieldOnlyMatch && nextLineMatch) {
          match = {
            lineNumber: i + 1,
            fieldLine: `${line.trim()} ${nextLineMatch[1].trim()}`.trim(),
            fieldName: fieldOnlyMatch[1],
            expression: nextLineMatch[1].trim()
          };
          break;
        }
      }
    }

    const resolvedMatch = match || {
      lineNumber: mx.lineNumber || 1,
      fieldLine: mx.line?.trim() || '',
      fieldName: 'field',
      expression: 'for @item in @items => @item'
    };

    const sanitized = String(resolvedMatch.fieldName || 'value')
      .replace(/[^A-Za-z0-9_]/g, '_')
      .replace(/^[^A-Za-z_]+/, '');
    const tempVar = `${sanitized || 'value'}Value`;

    return {
      LINE: resolvedMatch.lineNumber,
      FIELD_LINE: resolvedMatch.fieldLine,
      FIELD_NAME: resolvedMatch.fieldName,
      EXPRESSION: resolvedMatch.expression,
      TEMP_VAR: tempVar
    };
  }
};

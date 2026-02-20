export const pattern = {
  name: 'var-template',

  test(error, mx) {
    const line = mx.line || '';
    return /^\/?var\b/.test(line) && /\b=\s*template\b/.test(line);
  },

  enhance(error, mx) {
    const line = (mx.line || '').trim();
    const nameMatch = line.match(/@([A-Za-z_][\w]*)/);
    const varName = nameMatch ? nameMatch[1] : 'template';
    const pathMatch = line.match(/template\s+(['"])(.+?)\1/);
    const templatePath = pathMatch ? pathMatch[2] : 'prompt.att';

    return {
      ATTEMPTED_LINE: line,
      VAR_NAME: varName,
      TEMPLATE_PATH: templatePath
    };
  }
};

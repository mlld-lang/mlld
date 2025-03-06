// Custom markdown-it plugin to escape template syntax in code blocks
function escapeTemplatePlugin(md) {
  const defaultFence = md.renderer.rules.fence;
  md.renderer.rules.fence = function(tokens, idx, options, env, self) {
    const token = tokens[idx];
    token.content = token.content
      .replace(/{{/g, '&#123;&#123;')
      .replace(/}}/g, '&#125;&#125;')
      .replace(/{%/g, '&#123;%')
      .replace(/%}/g, '%&#125;');
    return defaultFence(tokens, idx, options, env, self);
  };

  const defaultInlineCode = md.renderer.rules.code_inline;
  md.renderer.rules.code_inline = function(tokens, idx, options, env, self) {
    const token = tokens[idx];
    token.content = token.content
      .replace(/{{/g, '&#123;&#123;')
      .replace(/}}/g, '&#125;&#125;')
      .replace(/{%/g, '&#123;%')
      .replace(/%}/g, '%&#125;');
    return defaultInlineCode(tokens, idx, options, env, self);
  };
}

module.exports = escapeTemplatePlugin; 
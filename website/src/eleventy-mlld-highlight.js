const Prism = require('prismjs');
require('./prism-mlld.js');

/**
 * Highlights Mlld code and returns HTML
 * @param {string} code - The Mlld code to highlight
 * @param {boolean} inline - Whether to render inline (no pre/code wrapper)
 * @returns {string} - Highlighted HTML
 */
function highlightMlld(code, inline = false) {
  const highlighted = Prism.highlight(code, Prism.languages.mlld, 'mlld');
  
  if (inline) {
    return highlighted;
  }
  
  return `<pre class="language-mlld"><code class="language-mlld">${highlighted}</code></pre>`;
}

module.exports = highlightMlld;
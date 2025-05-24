const Prism = require('prismjs');
require('./prism-meld.js');

/**
 * Highlights Meld code and returns HTML
 * @param {string} code - The Meld code to highlight
 * @param {boolean} inline - Whether to render inline (no pre/code wrapper)
 * @returns {string} - Highlighted HTML
 */
function highlightMeld(code, inline = false) {
  const highlighted = Prism.highlight(code, Prism.languages.meld, 'meld');
  
  if (inline) {
    return highlighted;
  }
  
  return `<pre class="language-meld"><code class="language-meld">${highlighted}</code></pre>`;
}

module.exports = highlightMeld;
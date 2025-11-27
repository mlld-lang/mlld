const markdownIt = require('markdown-it');
const markdownItAnchor = require('markdown-it-anchor');
const markdownItPrism = require('markdown-it-prism');

// Load our custom Meld language
require('./src/prism-mlld.js');
const highlightMeld = require('./src/eleventy-mld-highlight.js');

module.exports = function(eleventyConfig) {
  // Configure Markdown
  const markdownLib = markdownIt({
    html: true,
    breaks: true,
    linkify: true
  })
  .use(markdownItAnchor)
  .use(markdownItPrism);
  
  eleventyConfig.setLibrary('md', markdownLib);
  
  // Add watch target for docs folder
  eleventyConfig.addWatchTarget('../docs/');
  
  // Add passthrough copy for assets
  eleventyConfig.addPassthroughCopy('css');
  eleventyConfig.addPassthroughCopy('js');
  eleventyConfig.addPassthroughCopy('images');
  eleventyConfig.addPassthroughCopy('.nojekyll');
  
  // Copy llms.txt from project root to website root
  eleventyConfig.addPassthroughCopy({
    '../llms.txt': 'llms.txt'
  });
  
  // Prism CSS theme is now in css/prism-theme.css (copied via 'css' passthrough)
  
  // Create a collection for documentation pages
  eleventyConfig.addCollection('docs', function(collectionApi) {
    return collectionApi.getFilteredByGlob('src/docs/**/*.md').sort((a, b) => {
      // Custom sort order for docs
      const order = {
        'introduction': 1,
        'cli-usage': 3,
        'sdk-usage': 4,
        'variables': 5,
        'error-handling': 6,
        'syntax-reference': 2,
        'directives': 100 // Directives at the end
      };
      
      // Extract slug from URL
      const getSlug = (item) => {
        const parts = item.url.split('/');
        const slug = parts[parts.length - 2] || parts[parts.length - 3];
        return slug;
      };
      
      const aSlug = getSlug(a);
      const bSlug = getSlug(b);
      
      // Get order or default to high number
      const aOrder = order[aSlug] || 1000;
      const bOrder = order[bSlug] || 1000;
      
      // Sort by order, then by title
      if (aOrder === bOrder) {
        return a.data.title.localeCompare(b.data.title);
      }
      return aOrder - bOrder;
    });
  });
  
  // Add isActive filter for navigation
  eleventyConfig.addFilter('isActive', function(pageUrl, currentUrl) {
    return currentUrl.startsWith(pageUrl) ? 'aria-current="page"' : '';
  });
  
  // Add year shortcode
  eleventyConfig.addShortcode('year', () => `${new Date().getFullYear()}`);
  
  // Add Meld syntax highlighting shortcode
  eleventyConfig.addShortcode('meld', function(code) {
    return highlightMeld(code.trim(), true);
  });
  
  // Add Meld code block shortcode
  eleventyConfig.addShortcode('meldBlock', function(code) {
    return highlightMeld(code.trim(), false);
  });
  
  return {
    dir: {
      input: 'src',
      output: '_site',
      includes: '_includes',
      data: '_data'
    },
    templateFormats: ['md', 'njk'],
    markdownTemplateEngine: false,
    htmlTemplateEngine: 'njk',
    dataTemplateEngine: 'njk'
  };
};

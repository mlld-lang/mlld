const markdownIt = require("markdown-it");
const markdownItAnchor = require("markdown-it-anchor");

module.exports = function(eleventyConfig) {
  // Configure Markdown
  const markdownLib = markdownIt({
    html: true,
    breaks: true,
    linkify: true
  }).use(markdownItAnchor);
  
  eleventyConfig.setLibrary("md", markdownLib);
  
  // Add watch target for docs folder
  eleventyConfig.addWatchTarget("../docs/");
  
  // Add passthrough copy for assets
  eleventyConfig.addPassthroughCopy("css");
  eleventyConfig.addPassthroughCopy("js");
  eleventyConfig.addPassthroughCopy("images");
  eleventyConfig.addPassthroughCopy(".nojekyll");
  
  // Create a collection for documentation pages
  eleventyConfig.addCollection("docs", function(collectionApi) {
    return collectionApi.getFilteredByGlob("src/docs/**/*.md").sort((a, b) => {
      // Custom sort order for docs
      const order = {
        "introduction": 1,
        "cli-usage": 3,
        "sdk-usage": 4,
        "variables": 5,
        "error-handling": 6,
        "syntax-reference": 2,
        "directives": 100 // Directives at the end
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
  eleventyConfig.addFilter("isActive", function(pageUrl, currentUrl) {
    return currentUrl.startsWith(pageUrl) ? "aria-current=\"page\"" : "";
  });
  
  // Add year shortcode
  eleventyConfig.addShortcode("year", () => `${new Date().getFullYear()}`);
  
  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data"
    },
    templateFormats: ["md", "njk"],
    markdownTemplateEngine: false,
    htmlTemplateEngine: "njk",
    dataTemplateEngine: "njk"
  };
};

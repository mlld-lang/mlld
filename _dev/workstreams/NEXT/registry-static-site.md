# Static Registry Website

**Status**: Planning  
**Priority**: P1 - Improves discoverability  
**Estimated Time**: 2-3 days  
**Dependencies**: Registry data structure, Basic DNS registry

## Objective

Build a static website for browsing the mlld module registry, integrated into mlld.ai. Users can search, browse, and learn about modules without using the CLI.

## Features

### Browse & Search
- Module listing with cards
- Search by name, description, keywords
- Filter by author, tags
- Sort by popularity, recent, alphabetical

### Module Pages
- Detailed module information
- README rendering
- Installation instructions
- Usage examples
- Version history (git commits)
- Author information

### Registry Stats
- Total modules
- Total authors  
- Recent additions
- Popular modules
- Growth metrics

## Technical Architecture

### Data Pipeline
```
GitHub Registry Repo → 11ty Build → Static Site → Netlify/GH Pages

1. Registry data in mlld-lang/registry
2. 11ty fetches during build
3. Generates static pages
4. Deploys to mlld.ai/registry
```

### Data Sources
```javascript
// website/src/_data/registry.js
module.exports = async function() {
  // Fetch modules from GitHub
  const modules = await fetchModules();
  
  // Fetch gist content for READMEs
  const enrichedModules = await enrichModules(modules);
  
  // Generate indexes
  return {
    modules: enrichedModules,
    byAuthor: indexByAuthor(enrichedModules),
    byKeyword: indexByKeyword(enrichedModules),
    popular: getPopularModules(enrichedModules),
    recent: getRecentModules(enrichedModules)
  };
};
```

## Implementation Plan

### Phase 1: Data Integration
1. [ ] Create registry data fetcher
2. [ ] Parse module metadata
3. [ ] Fetch gist content
4. [ ] Build search indexes
5. [ ] Cache during build

### Phase 2: Browse Pages
1. [ ] Create registry layout template
2. [ ] Build module grid/list views
3. [ ] Add pagination
4. [ ] Implement client-side search
5. [ ] Add filtering UI

### Phase 3: Module Pages
1. [ ] Dynamic module page generation
2. [ ] Render module READMEs
3. [ ] Show installation instructions
4. [ ] Display module metadata
5. [ ] Add copy-to-clipboard

### Phase 4: Search & Discovery
1. [ ] Implement fuzzy search
2. [ ] Add search suggestions
3. [ ] Create tag pages
4. [ ] Build author pages
5. [ ] Add "similar modules"

### Phase 5: Analytics & Stats
1. [ ] Track page views (privacy-friendly)
2. [ ] Generate statistics
3. [ ] Create stats dashboard
4. [ ] Add trending modules
5. [ ] Show growth metrics

## Page Templates

### Registry Home (`/registry/`)
```njk
---
layout: base.njk
title: mlld Module Registry
---

<div class="registry-hero">
  <h1>mlld Module Registry</h1>
  <p>Discover and share mlld modules</p>
  
  <div class="search-box">
    <input type="text" placeholder="Search modules..." id="module-search">
  </div>
  
  <div class="stats">
    <span>{{ registry.modules.length }} modules</span>
    <span>{{ registry.authors.size }} authors</span>
  </div>
</div>

<section class="popular-modules">
  <h2>Popular Modules</h2>
  {% include "components/module-grid.njk" %}
</section>

<section class="recent-modules">
  <h2>Recently Added</h2>
  {% include "components/module-list.njk" %}
</section>
```

### Module Detail (`/registry/[module]/`)
```njk
---
pagination:
  data: registry.modules
  size: 1
  alias: module
permalink: /registry/{{ module.name | slug }}/
---

<article class="module-detail">
  <header>
    <h1>{{ module.name }}</h1>
    <p class="description">{{ module.description }}</p>
    
    <div class="module-meta">
      <span>By {{ module.author.name }}</span>
      <span>{{ module.stats.installs }} installs</span>
      <span>Updated {{ module.updatedAt | timeAgo }}</span>
    </div>
  </header>
  
  <div class="install-instructions">
    <h2>Installation</h2>
    <pre><code>mlld install {{ module.name }}</code></pre>
    <button class="copy-button" data-copy="mlld install {{ module.name }}">
      Copy
    </button>
  </div>
  
  <div class="module-content">
    {{ module.readme | markdown | safe }}
  </div>
  
  <aside class="module-sidebar">
    <h3>Keywords</h3>
    <div class="keywords">
      {% for keyword in module.keywords %}
        <a href="/registry/tag/{{ keyword }}">{{ keyword }}</a>
      {% endfor %}
    </div>
    
    <h3>Source</h3>
    <a href="{{ module.source.gistUrl }}">View on GitHub</a>
  </aside>
</article>
```

## Search Implementation

### Client-Side Search
```javascript
// website/src/js/registry-search.js
import Fuse from 'fuse.js';

const searchIndex = new Fuse(window.registryModules, {
  keys: [
    { name: 'name', weight: 2 },
    { name: 'description', weight: 1 },
    { name: 'keywords', weight: 1.5 },
    { name: 'author.name', weight: 0.5 }
  ],
  threshold: 0.3
});

function search(query) {
  const results = searchIndex.search(query);
  renderResults(results.map(r => r.item));
}
```

### Search Index Generation
```javascript
// During build, create search index
const searchData = modules.map(m => ({
  name: m.name,
  description: m.description,
  keywords: m.keywords,
  author: m.author.name,
  url: `/registry/${slugify(m.name)}/`
}));

// Write to static file
fs.writeFileSync(
  'src/js/registry-modules.json',
  JSON.stringify(searchData)
);
```

## Performance Optimizations

### Build-Time Optimization
- Cache GitHub API responses
- Parallel gist fetching
- Incremental builds
- Pre-render search indexes

### Runtime Optimization  
- Lazy load search library
- Progressive enhancement
- Service worker caching
- Optimize images/assets

## SEO & Social

### Module Pages
```html
<meta property="og:title" content="{{ module.name }} - mlld module">
<meta property="og:description" content="{{ module.description }}">
<meta name="twitter:card" content="summary">

<!-- JSON-LD structured data -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareSourceCode",
  "name": "{{ module.name }}",
  "description": "{{ module.description }}",
  "author": {
    "@type": "Person", 
    "name": "{{ module.author.name }}"
  }
}
</script>
```

## Success Criteria

- [ ] All modules browseable
- [ ] Search works instantly
- [ ] Module pages load fast
- [ ] Mobile responsive
- [ ] SEO optimized
- [ ] Zero runtime API calls
- [ ] Builds in <30 seconds

## Future Enhancements

- Module playground (try online)
- Dependency graphs
- Bundle size analysis
- Security audit badges
- User ratings/reviews
- RSS feed for new modules
- API for registry data

## Notes

- Static-first approach for speed
- Build on existing 11ty setup
- Consider CDN for assets
- Plan for registry growth
- Keep design consistent with mlld.ai

## Related Documentation

### Architecture & Vision
- [`REGISTRY-VISION.md`](../../REGISTRY-VISION.md) - Registry Phase 2: Discovery goals and metrics
- [`ARCHITECTURE.md`](../../ARCHITECTURE.md) - Registry architecture and data flow
- [`WEBSITE-UPDATES.md`](../../WEBSITE-UPDATES.md) - Website infrastructure and deployment

### Specifications
- [`specs/import-syntax.md`](../../specs/import-syntax.md) - Module naming conventions
- [`specs/mcp-metadata.md`](../../specs/mcp-metadata.md) - Registry metadata format

### Implementation References
- [`website/`](../../../website/) - Existing website structure and 11ty configuration
- [`archive/2025-05-evolution/REGISTRY-PHASE2-SERVICE.md`](../../archive/2025-05-evolution/REGISTRY-PHASE2-SERVICE.md) - Original static site plans
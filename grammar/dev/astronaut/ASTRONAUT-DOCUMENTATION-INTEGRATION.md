# Documentation Integration Design

This document outlines the comprehensive approach for integrating documentation generation with our grammar-driven development system. It details how we'll automatically create and maintain documentation directly from our grammar and type system.

## Documentation Philosophy

Our documentation philosophy follows these key principles:

1. **Single Source of Truth**: All documentation derives from the grammar definition and type system
2. **Complete Coverage**: Every directive, subtype, and feature has comprehensive documentation
3. **Multiple Views**: Different documentation formats for different audiences and needs
4. **Living Documentation**: Documentation automatically updates with grammar changes
5. **Interactive Examples**: Practical examples showing both syntax and resulting AST

## Documentation Components

The integrated documentation system consists of these key components:

### 1. API Reference Documentation

Generated from type definitions and JSDoc comments:

- Complete type interface documentation
- Type hierarchy and inheritance
- Type guard functions and utilities
- Property descriptions and constraints

### 2. Directive Syntax Documentation

User-focused documentation of directive syntax:

- Syntax patterns and examples
- Variant descriptions
- Parameter explanations
- Edge case handling

### 3. Interactive Examples

Code examples with live AST visualization:

- Editable directive examples
- Real-time AST rendering
- Highlighting of structure changes
- Template library for common patterns

### 4. Conceptual Guides

Hand-written guides enhanced with generated examples:

- Architectural overviews
- Best practices
- Migration guides
- Advanced usage patterns

## Integration Points

### 1. JSDoc Integration

TypeScript interfaces will have comprehensive JSDoc comments:

```typescript
/**
 * Represents a text assignment directive (`@text var = value`)
 * 
 * This directive defines a text variable with a literal value, template,
 * or the result of another directive.
 * 
 * @example
 * ```meld
 * @text greeting = "Hello, world!"
 * @text template = [[Value with {{variables}}]]
 * @text command = @run echo "Hello"
 * ```
 * 
 * @remarks
 * The text directive supports several source types:
 * - Literal strings (`@text var = "value"`)
 * - Templates with variables (`@text var = [[template with {{var}}]]`)
 * - Run directive results (`@text var = @run command`)
 * - Add directive content (`@text var = @add [path.md]`)
 * 
 * @see {@link TextTemplateNode} - For template variant details
 */
export interface TextAssignmentNode extends TextDirectiveNode {
  subtype: 'textAssignment';
}
```

### 2. Markdown Documentation Generation

Generate markdown documentation from types and examples:

```typescript
function generateDirectiveDocumentation(
  directiveKind: string,
  typeInfo: DirectiveTypeInfo,
  examples: DirectiveExample[]
): string {
  const subtypes = typeInfo.subtypes.map(subtype => {
    const subtypeExamples = examples.filter(e => e.subtype === subtype.name);
    return generateSubtypeDocumentation(subtype, subtypeExamples);
  });
  
  return `# ${capitalize(directiveKind)} Directive
  
${typeInfo.description}

## Syntax

\`\`\`
${typeInfo.syntaxPattern}
\`\`\`

## Subtypes

${subtypes.join('\n\n')}

## Common Patterns

${generateCommonPatterns(examples)}
`;
}
```

### 3. Example Integration

Examples will be stored in structured format with expected AST output:

```typescript
interface DirectiveExample {
  name: string;
  description: string;
  directive: string;
  subtype: string;
  ast: any;
  highlighted?: {
    ranges: Array<{start: number, end: number, description: string}>
  };
  variations?: DirectiveExample[];
}

// Example definition
const textExamples: DirectiveExample[] = [
  {
    name: "basic-text-assignment",
    description: "Basic text variable assignment with a literal string",
    directive: '@text greeting = "Hello, world!"',
    subtype: "textAssignment",
    ast: {
      type: "Directive",
      kind: "text",
      subtype: "textAssignment",
      // ... full AST structure
    },
    highlighted: {
      ranges: [
        {start: 0, end: 5, description: "Directive type"},
        {start: 6, end: 14, description: "Variable name"},
        {start: 17, end: 32, description: "String value"}
      ]
    }
  },
  // More examples...
];
```

### 4. Visual Documentation Components

Interactive components for documentation site:

```typescript
interface DirectiveVisualizer {
  /**
   * Render an interactive directive example with AST visualization
   */
  renderExample(example: DirectiveExample, options?: VisualizerOptions): HTMLElement;
  
  /**
   * Create an editable playground with live AST updates
   */
  createPlayground(initialExample?: DirectiveExample): HTMLElement;
  
  /**
   * Generate a visual type hierarchy diagram
   */
  generateTypeHierarchyDiagram(typeInfo: TypeInfo): SVGElement;
}
```

## Documentation Generation Pipeline

The complete documentation generation process:

### 1. Type Documentation

Generate TypeScript API documentation:

```typescript
async function generateTypeDocumentation(config: DocConfig): Promise<void> {
  // Load type definitions
  const typeDefinitions = await loadTypeDefinitions(config.typeDir);
  
  // Generate API documentation
  const apiDocs = generateApiDocs(typeDefinitions, {
    outputFormat: 'markdown',
    includePrivate: false,
    includeExamples: true
  });
  
  // Write output files
  await writeDocsToFiles(apiDocs, config.outputApiDir);
  
  console.log(`Generated API documentation for ${Object.keys(typeDefinitions).length} types`);
}
```

### 2. Directive Documentation

Generate user-focused directive documentation:

```typescript
async function generateDirectiveDocs(config: DocConfig): Promise<void> {
  // Load directive examples
  const examples = await loadDirectiveExamples(config.examplesDir);
  
  // Load type information
  const typeInfo = await loadTypeDefinitions(config.typeDir);
  
  // Generate directive documentation for each kind
  const directiveDocs = Object.keys(examples).map(kind => {
    return generateDirectiveDocumentation(
      kind, 
      typeInfo[kind + 'DirectiveNode'], 
      examples[kind]
    );
  });
  
  // Write output files
  await writeDocsToFiles(directiveDocs, config.outputDirectiveDir);
  
  console.log(`Generated documentation for ${directiveDocs.length} directives`);
}
```

### 3. Example Processing

Process and validate examples:

```typescript
async function processExamples(config: DocConfig): Promise<void> {
  // Load example definitions
  const examples = await loadExampleDefinitions(config.exampleDefDir);
  
  // Parse examples to generate/validate AST
  const processedExamples = await Promise.all(
    examples.map(async example => {
      // Parse the directive to get actual AST
      const actualAst = await parseDirective(example.directive);
      
      // Validate against expected AST if provided
      if (example.ast) {
        validateAstMatch(actualAst, example.ast);
      } else {
        // Store the actual AST as expected
        example.ast = actualAst;
      }
      
      return example;
    })
  );
  
  // Write processed examples
  await writeExampleFiles(processedExamples, config.processedExampleDir);
  
  console.log(`Processed ${processedExamples.length} examples`);
}
```

### 4. Interactive Documentation

Generate interactive documentation components:

```typescript
async function generateInteractiveDocs(config: DocConfig): Promise<void> {
  // Load processed examples
  const examples = await loadProcessedExamples(config.processedExampleDir);
  
  // Generate interactive components
  const components = generateInteractiveComponents(examples, {
    includePlayground: true,
    includeAstViewer: true,
    includeSyntaxHighlighter: true
  });
  
  // Write component files
  await writeInteractiveComponents(components, config.outputInteractiveDir);
  
  console.log(`Generated ${Object.keys(components).length} interactive components`);
}
```

## Documentation Site Integration

The generated documentation integrates with a documentation site:

### 1. Site Structure

```
docs/
  api/             # API reference docs
    directives/    # Directive type interfaces
    nodes/         # Node type interfaces
    utils/         # Utility types and functions
  
  syntax/          # Syntax documentation
    text.md        # Text directive docs
    run.md         # Run directive docs
    add.md         # Add directive docs
    ...
  
  examples/        # Example library
    basic/         # Basic examples
    advanced/      # Advanced usage examples
    patterns/      # Common patterns
  
  guides/          # Conceptual guides
    getting-started.md
    advanced-techniques.md
```

### 2. Navigation Generation

```typescript
function generateDocSiteNavigation(
  typeInfo: TypeInfo,
  directiveDocs: DirectiveDocInfo[]
): Navigation {
  return {
    main: [
      {
        title: "Getting Started",
        path: "/docs/guides/getting-started"
      },
      {
        title: "Directives",
        items: directiveDocs.map(doc => ({
          title: `${capitalize(doc.kind)} Directive`,
          path: `/docs/syntax/${doc.kind}`
        }))
      },
      {
        title: "API Reference",
        items: [
          {
            title: "Directive Types",
            path: "/docs/api/directives"
          },
          {
            title: "Node Types",
            path: "/docs/api/nodes"
          },
          {
            title: "Utilities",
            path: "/docs/api/utils"
          }
        ]
      }
    ]
  };
}
```

### 3. Search Index Generation

```typescript
function generateSearchIndex(
  typeInfo: TypeInfo,
  directiveDocs: DirectiveDocInfo[],
  examples: DirectiveExample[]
): SearchIndex {
  const entries: SearchEntry[] = [];
  
  // Add type definitions to search
  Object.entries(typeInfo).forEach(([name, info]) => {
    entries.push({
      type: "type",
      title: name,
      description: info.description,
      path: `/docs/api/${typeToPath(name)}`
    });
  });
  
  // Add directive docs to search
  directiveDocs.forEach(doc => {
    entries.push({
      type: "directive",
      title: `${capitalize(doc.kind)} Directive`,
      description: doc.description,
      path: `/docs/syntax/${doc.kind}`
    });
  });
  
  // Add examples to search
  examples.forEach(example => {
    entries.push({
      type: "example",
      title: example.name,
      description: example.description,
      path: `/docs/examples/${exampleToPath(example)}`
    });
  });
  
  return {
    version: 1,
    entries
  };
}
```

## Interactive Components

The documentation includes several interactive components:

### 1. AST Explorer

```typescript
class ASTExplorer extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }
  
  connectedCallback() {
    const directive = this.getAttribute('directive') || '';
    
    this.render(directive);
  }
  
  async render(directive: string) {
    try {
      const ast = await parseDirective(directive);
      
      this.shadowRoot.innerHTML = `
        <div class="ast-explorer">
          <div class="input">
            <textarea>${directive}</textarea>
            <button>Update</button>
          </div>
          <div class="output">
            <pre>${JSON.stringify(ast, null, 2)}</pre>
          </div>
        </div>
      `;
      
      this.setupListeners();
    } catch (error) {
      this.shadowRoot.innerHTML = `
        <div class="ast-explorer error">
          <div class="input">
            <textarea>${directive}</textarea>
            <button>Update</button>
          </div>
          <div class="error-output">
            <pre>${error.message}</pre>
          </div>
        </div>
      `;
      
      this.setupListeners();
    }
  }
  
  setupListeners() {
    const button = this.shadowRoot.querySelector('button');
    const textarea = this.shadowRoot.querySelector('textarea');
    
    button.addEventListener('click', () => {
      this.render(textarea.value);
    });
  }
}

customElements.define('ast-explorer', ASTExplorer);
```

### 2. Syntax Highlighter

```typescript
class SyntaxHighlighter extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }
  
  connectedCallback() {
    const directive = this.getAttribute('directive') || '';
    const highlights = JSON.parse(this.getAttribute('highlights') || '[]');
    
    this.render(directive, highlights);
  }
  
  render(directive: string, highlights: Array<{start: number, end: number, description: string}>) {
    let html = '';
    let lastEnd = 0;
    
    // Sort highlights by start position
    highlights.sort((a, b) => a.start - b.start);
    
    for (const highlight of highlights) {
      // Add text before highlight
      html += escapeHtml(directive.substring(lastEnd, highlight.start));
      
      // Add highlighted text
      html += `<span class="highlight" title="${escapeHtml(highlight.description)}">`;
      html += escapeHtml(directive.substring(highlight.start, highlight.end));
      html += '</span>';
      
      lastEnd = highlight.end;
    }
    
    // Add remaining text
    html += escapeHtml(directive.substring(lastEnd));
    
    this.shadowRoot.innerHTML = `
      <style>
        .syntax-highlighter {
          font-family: monospace;
          white-space: pre;
          background: #f5f5f5;
          padding: 1em;
          border-radius: 4px;
        }
        .highlight {
          background: #ffeb3b;
          cursor: help;
        }
      </style>
      <div class="syntax-highlighter">${html}</div>
    `;
  }
}

customElements.define('syntax-highlighter', SyntaxHighlighter);
```

### 3. Type Hierarchy Visualizer

```typescript
class TypeHierarchyVisualizer extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }
  
  async connectedCallback() {
    const typeName = this.getAttribute('type-name') || '';
    
    try {
      const typeInfo = await fetchTypeInfo(typeName);
      this.renderHierarchy(typeInfo);
    } catch (error) {
      this.shadowRoot.innerHTML = `<div class="error">Error: ${error.message}</div>`;
    }
  }
  
  renderHierarchy(typeInfo: TypeInfo) {
    // Create D3 visualization
    const width = 800;
    const height = 600;
    
    const svg = d3.create("svg")
      .attr("viewBox", [0, 0, width, height]);
    
    // Generate hierarchy data
    const hierarchyData = generateHierarchyData(typeInfo);
    
    // Create tree layout
    const tree = d3.tree()
      .size([width - 100, height - 100]);
    
    const root = d3.hierarchy(hierarchyData);
    const nodes = tree(root);
    
    // Draw links
    svg.append("g")
      .attr("fill", "none")
      .attr("stroke", "#999")
      .selectAll("path")
      .data(nodes.links())
      .join("path")
      .attr("d", d3.linkHorizontal()
        .x(d => d.y + 50)
        .y(d => d.x + 50));
    
    // Draw nodes
    const node = svg.append("g")
      .selectAll("g")
      .data(nodes.descendants())
      .join("g")
      .attr("transform", d => `translate(${d.y + 50},${d.x + 50})`);
    
    node.append("circle")
      .attr("fill", d => d.data.isInterface ? "#69b3a2" : "#3498db")
      .attr("r", 5);
    
    node.append("text")
      .attr("dy", "0.32em")
      .attr("x", d => d.children ? -6 : 6)
      .attr("text-anchor", d => d.children ? "end" : "start")
      .text(d => d.data.name);
    
    this.shadowRoot.innerHTML = '';
    this.shadowRoot.appendChild(svg.node());
  }
}

customElements.define('type-hierarchy', TypeHierarchyVisualizer);
```

## Documentation Maintenance Workflow

The documentation maintenance workflow integrates with the development process:

### 1. Watch Mode for Documentation

```typescript
async function watchDocs(config: DocConfig): Promise<void> {
  const watcher = chokidar.watch([
    config.typeDir,
    config.examplesDir,
    config.grammarDir
  ], {
    persistent: true
  });
  
  watcher.on('change', async (path) => {
    console.log(`File changed: ${path}`);
    
    // Determine what to update
    if (path.startsWith(config.typeDir)) {
      await generateTypeDocumentation(config);
    } else if (path.startsWith(config.examplesDir)) {
      await processExamples(config);
      await generateDirectiveDocs(config);
      await generateInteractiveDocs(config);
    } else if (path.startsWith(config.grammarDir)) {
      // Full regeneration for grammar changes
      await generateTypeDocumentation(config);
      await processExamples(config);
      await generateDirectiveDocs(config);
      await generateInteractiveDocs(config);
    }
  });
  
  console.log('Watching for documentation changes...');
}
```

### 2. CI/CD Integration

```yaml
# GitHub Action for documentation
name: Generate Documentation

on:
  push:
    branches:
      - main
    paths:
      - 'grammar/**'
      - 'types/**'
      - 'examples/**'
      - 'docs/**'

jobs:
  docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '16'
      - run: npm ci
      - run: npm run generate-docs
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./docs/build
```

### 3. Integration with Development Tools

```typescript
// VS Code extension integration
function registerDocumentationCommands(context: vscode.ExtensionContext) {
  // Generate documentation for current file
  context.subscriptions.push(
    vscode.commands.registerCommand('meldGrammar.generateDocsForCurrentFile', () => {
      const currentFile = vscode.window.activeTextEditor?.document.uri.fsPath;
      
      if (currentFile) {
        return generateDocsForFile(currentFile);
      }
    })
  );
  
  // Preview documentation
  context.subscriptions.push(
    vscode.commands.registerCommand('meldGrammar.previewDocs', () => {
      return previewDocumentation();
    })
  );
}
```

## Benefits of This Approach

The integrated documentation system provides several key benefits:

1. **Always Up-to-Date**: Documentation automatically stays in sync with the grammar
2. **Comprehensive Coverage**: Every directive and feature is documented
3. **Multiple Formats**: Different documentation styles for different audiences
4. **Interactive Learning**: Live examples enhance understanding
5. **Error Prevention**: Examples are validated against actual grammar
6. **Reduced Maintenance**: Documentation is maintained alongside code

## Future Enhancements

Potential future enhancements to the documentation system:

1. **Localization Support**:
   - Multi-language documentation generation
   - Locale-specific examples
   - Internationalized interactive components

2. **Advanced Visualization**:
   - AST transformation visualizations
   - Grammar rule visualizations
   - Animation of parsing process

3. **Contextual Documentation**:
   - IDE integration for in-editor documentation
   - Contextual help based on cursor position
   - Quick-fix suggestions

4. **Learning Paths**:
   - Progressive documentation paths
   - Interactive tutorials
   - Guided exercises

## Conclusion

The integrated documentation system forms a crucial part of our grammar-driven development approach. By generating comprehensive, accurate, and interactive documentation directly from our grammar and type system, we ensure that users and developers always have access to up-to-date information about the system's capabilities and behavior.

This approach significantly reduces documentation maintenance burden while improving quality, consistency, and coverage, ultimately leading to a better developer experience for users of our grammar system.
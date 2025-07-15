# Foreach

The `foreach` operator enables powerful iteration over arrays with two distinct syntaxes: parameterized commands for complex operations and direct section extraction for documentation workflows.

## Two Foreach Patterns

### Pattern 1: Parameterized Commands (Traditional)

```mlld
/var @<result> = foreach <parameterized-command>(<arrays>)
```

Apply exec commands or text templates to arrays with cartesian product support.

### Pattern 2: Section Extraction (NEW)

```mlld
/var @<result> = foreach <@array.field # section> as ::template::
```

Extract sections from files and apply templates directly - perfect for documentation assembly.

## Basic Command Syntax

```mlld
/var @<result> = foreach <parameterized-command>(<arrays>)
```

Where:
- `@<result>` - Variable to store the array of results (requires @ prefix)
- `<parameterized-command>` - A reference to an `/exec` command or `/text` template with parameters
- `<arrays>` - One or more array variables to iterate over

## Single Array Iteration

Apply the same operation to each element in an array:

```mlld
/var @topics = ["security", "performance", "scalability"]
/exe @analyze(topic) = "claude --message 'Analyze @topic aspects of the code'"
/var @analyses = foreach @analyze(@topics)
```

Result: `analyses` contains an array with 3 elements (one analysis per topic).

## Multiple Arrays (Cartesian Product)

When given multiple arrays, `foreach` computes the cartesian product, testing all combinations:

```mlld
/var @models = ["claude", "gpt-4"]
/var @temperatures = [0.7, 0.9]
/exe @test(model, temp) = "@model --temperature @temp 'Explain quantum computing'"
/var @results = foreach @test(@models, @temperatures)
```

Result: `results` contains 4 elements:
- `test("claude", 0.7)`
- `test("claude", 0.9)`
- `test("gpt-4", 0.7)`
- `test("gpt-4", 0.9)`

## Working with Objects

When iterating over objects, the entire object is passed as the parameter:

```mlld
/var @users = [
  {"name": "Alice", "role": "admin"},
  {"name": "Bob", "role": "user"}
]

/exe @profile(user) = ::
### {{user.name}}
Role: {{user.role}}
Permissions: {{user.role}} level access
::

/var @profiles = foreach @profile(@users)
```

## Parameter Matching

The number of arrays must match the number of parameters in the command/template:

```mlld
/exe @process(a, b) = "echo '@a and @b'"

>> Valid:
/var @x = [1, 2]
/var @y = [3, 4]
/var @results = foreach @process(@x, @y)  >> ✓ 2 arrays, 2 parameters

>> Invalid:
/var @results = foreach @process(@x)      >> ✗ 1 array, 2 parameters
```

## Practical Examples

### Basic LLM Iteration

Process multiple questions with the same LLM:

```mlld
/var @questions = [
  "What is machine learning?",
  "Explain neural networks",
  "What are transformers?"
]
/exe @ask(q) = "claude --message '@q'"
/var @answers = foreach @ask(@questions)

>> Generate Q&A document
/show @answers
```

### Multi-Model Comparison

Compare responses across different AI models:

```mlld
/var @models = ["claude-3", "gpt-4", "gemini-pro"]
/var @prompts = ["Write a haiku about programming", "Explain recursion"]

/exe @query(model, prompt) = "@model '@prompt'"
/var @responses = foreach @query(@models, @prompts)

>> Creates 6 responses (3 models × 2 prompts)
```

### Batch File Processing

Process multiple files with the same operation:

```mlld
/var @js_files = /run "find ./src -name '*.js' -type f"
/exe @analyze_file(file) = "eslint @file --format json"
/var @lint_results = foreach @analyze_file(@js_files)
```

### Template-based Report Generation

Generate structured reports from data:

```mlld
/var @metrics = [
  {"name": "CPU", "value": 45, "unit": "%"},
  {"name": "Memory", "value": 2.3, "unit": "GB"},
  {"name": "Disk", "value": 67, "unit": "%"}
]

@text metric_row(m) = :::| {{m.name}} | {{m.value}}{{m.unit}} |:::
@data rows = foreach @metric_row(@metrics)

| Metric | Usage |
|--------|-------|
@add @rows
```

## Section Extraction Syntax (NEW)

The new section extraction syntax enables direct iteration over file arrays with automatic section extraction and template application.

### Basic Section Extraction

Extract the same section from multiple files:

```mlld
@data files = [
  {"path": "guide.md", "name": "User Guide"},
  {"path": "api.md", "name": "API Reference"},
  {"path": "tutorial.md", "name": "Tutorial"}
]

# Extract "introduction" section from each file
@data intros = foreach <@files.path # introduction> as :::### {{files.name}}:::
@add @intros
```

Result: Creates an array with formatted introductions from all three files.

### Variable Section Names

Use dynamic section names stored in the array data:

```mlld
@data docs = [
  {"path": "guide.md", "section": "overview", "title": "Overview"},
  {"path": "api.md", "section": "endpoints", "title": "API Endpoints"},
  {"path": "faq.md", "section": "troubleshooting", "title": "Troubleshooting"}
]

# Extract different sections based on array data
@data sections = foreach <@docs.path # @docs.section> as :::## {{docs.title}}:::
@add @sections
```

### Module Documentation Assembly

Perfect for building documentation from module files:

```mlld
@import <@./scan.mld.md>  # Assume this provides file scanning
@data modules = @scanFiles("./modules", "*.mld.md")

# Extract tldr sections and format as module index
@add foreach <@modules.path # tldr> as :::### [{{modules.frontmatter.name}}]({{modules.path}}):::
```

### All Directive Support

Section extraction works with all foreach-compatible directives:

```mlld
# Data directive - store results
@data summaries = foreach <@files.path # summary> as ::{{files.name}}: Summary::

# Text directive - assign to variable  
@text content = foreach <@docs.path # @docs.section> as :::## {{docs.title}}:::

# Add directive - direct output
@add foreach <@modules.path # interface> as :::```{{modules.language}}\n{{content}}\n```:::
```

### Section Variable Collection (Traditional Method)

For comparison, the traditional method using parameterized commands:

```mlld
@data sections = ["introduction", "methodology", "results", "conclusion"]
@text extractSection(name) = :::Content from {{name}} section:::

# Extract all sections with foreach
@data allSections = foreach @extractSection(@sections)
@add @allSections

# Or extract from specific files
@exec getSection(file, section) = run [(echo "From @file:")]\n@add <file.md # @section>
@data files = ["report1.md", "report2.md", "report3.md"]
@data sections = ["summary", "recommendations"]
@data extracted = foreach @getSection(@files, @sections)
```

### Dynamic Documentation Assembly (Traditional Method)

Build documentation by collecting sections across multiple files:

```mlld
@data sources = [
  {"file": "intro.md", "section": "overview"},
  {"file": "guide.md", "section": "getting-started"},
  {"file": "api.md", "section": "endpoints"},
  {"file": "examples.md", "section": "tutorials"}
]

@text includeSection(source) = ::
## {{source.section}} 
@add <{{source.file}} # {{source.section}}>
::

@data documentation = foreach @includeSection(@sources)
@add @documentation
```

### Nested Data Processing

Work with complex combinations of parameters:

```mlld
@data departments = ["engineering", "sales", "support"]
@data quarters = ["Q1", "Q2", "Q3", "Q4"]

@exec get_revenue(dept, quarter) = run [(
  curl -s "https://api.company.com/revenue/@dept/@quarter" | jq .total
)]
@data revenues = foreach @get_revenue(@departments, @quarters)

# Generates 12 API calls (3 departments × 4 quarters)
```

## Performance and Execution

### Lazy Evaluation

`foreach` follows mlld's lazy evaluation model:
- Iteration only executes when the result is used (via `@add` or other operations)
- Enables efficient processing of large datasets
- Results are computed on-demand

### Order Preservation

Results maintain the order of iteration:
- **Single array**: Order matches the input array
- **Multiple arrays**: Row-major order (first array varies slowest)

### Error Handling

If any iteration fails, the entire `foreach` operation fails:
- Errors include the iteration index/indices for debugging
- Partial results are not returned
- Clear error messages show which iteration failed

Example error message:
```
Error in foreach @analyze(@files):
Failed at iteration 3 (file: "src/broken.js"):
Command failed with exit code 1
```

## Type Safety

### Input Constraints

**Parameterized Commands:**
- The command/template must be parameterized (have defined parameters)
- All inputs must be arrays
- Parameter count must match array count

**Section Extraction:**
- Array must contain objects with the specified path field
- Path field values must be valid file paths
- Section names must be strings (literal or variable)

### Output Type
- Always returns an array
- Element type depends on the pattern:
  - **Parameterized commands**: `@exec` output as text, `@text` templates as evaluated text
  - **Section extraction**: Template-formatted text with extracted section content

## Integration with Other Features

### With @when Conditions

```mlld
@data files = ["config.json", "data.csv", "readme.txt"]
@exec process_if_json(file) = run [(
  if :: "@file" == *.json )::; then jq . "@file"; fi
]
@data json_data = foreach @process_if_json(@files)

@when @json_data => @add "Found JSON files: @json_data"
```

### With Pipeline Processing (Planned)

```mlld
@data files = ["data1.json", "data2.json", "data3.json"]
@exec process_file(file) = run [(cat @file)] with {
  pipeline: [@validate_json(@input), @extract_metrics(@input)]
}
@data results = foreach @process_file(@files)
```

## Best Practices

### General
1. **Start Small**: Test with small arrays before scaling up
2. **Handle Errors**: Consider using `@when` to handle failures gracefully
3. **Type Consistency**: Ensure all array elements have expected structure

### Parameterized Commands
4. **Use Descriptive Names**: Make parameter names clear and meaningful
5. **Performance Awareness**: Be mindful of cartesian product sizes with multiple arrays

### Section Extraction  
6. **Verify File Structure**: Ensure array objects have the expected path field
7. **Check Section Existence**: Verify sections exist in target files
8. **Template Safety**: Use defensive patterns in templates for missing properties

## Common Pitfalls

### Parameterized Commands
1. **Parameter Mismatch**: Forgetting to match array count with parameter count
2. **Large Cartesian Products**: Multiple large arrays can create performance issues

### Section Extraction
3. **Missing Path Fields**: Array objects without the specified path field
4. **Invalid File Paths**: Path field values that don't point to valid files
5. **Nonexistent Sections**: Referencing sections that don't exist in files

### General
6. **Missing Error Handling**: Not accounting for individual iteration failures
7. **Type Assumptions**: Assuming array elements have specific structure without validation

## Choosing the Right Pattern

- **Use parameterized commands** for complex operations, cartesian products, or when you need reusable logic
- **Use section extraction** for documentation workflows, file processing, or when directly working with file arrays

The `foreach` operator makes mlld particularly powerful for batch operations, especially when working with AI models, data processing pipelines, and automation workflows.
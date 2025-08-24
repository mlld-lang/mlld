---
layout: docs.njk
title: "Foreach"
---

# Foreach

The `foreach` operator enables powerful iteration over arrays with parameterized commands for complex operations and cartesian product support.

> **Note**: For simple iteration tasks, consider using the `/for` directive instead. Use `foreach` when you need parameterized commands or cartesian products.

## Foreach Pattern

```mlld
/var @<result> = foreach <parameterized-command>(<arrays>)
```

Apply exec commands or text templates to arrays with cartesian product support.

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

## Section Extraction with Alligator Globs

For extracting sections from multiple files, use the alligator glob syntax with the 'as' template feature instead of foreach:

```mlld
# Extract sections from multiple files with templates
/var @docs = <docs/*.md # Introduction> as "## <>.filename\n<>.content"

# With specific paths
/var @sections = <guide.md # Overview, api.md # Endpoints, faq.md # Troubleshooting> as "### <>.filename\n<>.content"

# Dynamic section names require parameterized commands
/exe @getSection(file, section) = <@file # @section>
/var @results = foreach @getSection(@files, @sections)
```

> **Note**: The alligator glob syntax with 'as' templates provides a cleaner, more direct approach for most documentation assembly tasks that previously required foreach section extraction.

## Complex Data Processing

Work with combinations of parameters using cartesian products:

```mlld
/var @departments = ["engineering", "sales", "support"]
/var @quarters = ["Q1", "Q2", "Q3", "Q4"]

/exe @getRevenue(dept, quarter) = run {
  curl -s "https://api.company.com/revenue/@dept/@quarter" | jq .total
}
/var @revenues = foreach @getRevenue(@departments, @quarters)

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

## Comparison with /for

| Feature | `foreach` | `/for` | Alligator Globs |
|---------|-----------|---------|-----------------|
| Simple iteration | ✓ | ✓ (simpler syntax) | N/A |
| Cartesian product | ✓ | ✗ | ✗ |
| Parameterized commands | ✓ | ✗ | N/A |
| Section extraction | ✗ (deprecated) | ✗ | ✓ (with 'as') |
| Object key access | ✗ | ✓ (`@var_key`) | N/A |
| Inline expressions | ✗ | ✓ | ✓ (in templates) |
| Output actions | ✗ | ✓ | ✗ |
| File glob patterns | ✗ | ✗ | ✓ |

**Use `/for`** for:
- Simple iteration with output actions
- Collecting transformed values
- Object iteration with key access
- Cleaner syntax for basic loops

**Use `foreach`** for:
- Cartesian products (multiple arrays)
- Parameterized executable commands
- Complex batch operations

**Use alligator globs `<pattern>`** for:
- Extracting sections from multiple files
- File pattern matching with templates
- Documentation assembly workflows

The `foreach` operator makes mlld particularly powerful for batch operations, especially when working with AI models, data processing pipelines, and automation workflows.
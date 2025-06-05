---
layout: docs.njk
title: "Foreach"
---

# Foreach

The `foreach` operator enables powerful iteration over arrays by applying parameterized commands or templates to each element. It's designed to solve common use cases like batch LLM operations, multi-model comparisons, and processing collections of data.

## Basic Syntax

```meld
@data <result> = foreach <parameterized-command>(<arrays>)
```

Where:
- `<result>` - Variable to store the array of results
- `<parameterized-command>` - A reference to an `@exec` command or `@text` template with parameters
- `<arrays>` - One or more array variables to iterate over

## Single Array Iteration

Apply the same operation to each element in an array:

```meld
@data topics = ["security", "performance", "scalability"]
@exec analyze(topic) = @run [(claude --message "Analyze @topic aspects of the code")]
@data analyses = foreach @analyze(@topics)
```

Result: `analyses` contains an array with 3 elements (one analysis per topic).

## Multiple Arrays (Cartesian Product)

When given multiple arrays, `foreach` computes the cartesian product, testing all combinations:

```meld
@data models = ["claude", "gpt-4"]
@data temperatures = [0.7, 0.9]
@exec test(model, temp) = @run [(@model --temperature @temp "Explain quantum computing")]
@data results = foreach @test(@models, @temperatures)
```

Result: `results` contains 4 elements:
- `test("claude", 0.7)`
- `test("claude", 0.9)`
- `test("gpt-4", 0.7)`
- `test("gpt-4", 0.9)`

## Working with Objects

When iterating over objects, the entire object is passed as the parameter:

```meld
@data users = [
  {"name": "Alice", "role": "admin"},
  {"name": "Bob", "role": "user"}
]

@text profile(user) = [[
### {{user.name}}
Role: {{user.role}}
Permissions: {{user.role}} level access
]]

@data profiles = foreach @profile(@users)
```

## Parameter Matching

The number of arrays must match the number of parameters in the command/template:

```meld
@exec process(a, b) = @run [(echo "@a and @b")]

# Valid:
@data x = [1, 2]
@data y = [3, 4]
@data results = foreach @process(@x, @y)  # ✓ 2 arrays, 2 parameters

# Invalid:
@data results = foreach @process(@x)      # ✗ 1 array, 2 parameters
```

## Practical Examples

### Basic LLM Iteration

Process multiple questions with the same LLM:

```meld
@data questions = [
  "What is machine learning?",
  "Explain neural networks",
  "What are transformers?"
]
@exec ask(q) = @run [(claude --message "@q")]
@data answers = foreach @ask(@questions)

# Generate Q&A document
@add @answers
```

### Multi-Model Comparison

Compare responses across different AI models:

```meld
@data models = ["claude-3", "gpt-4", "gemini-pro"]
@data prompts = ["Write a haiku about programming", "Explain recursion"]

@exec query(model, prompt) = @run [(@model "@prompt")]
@data responses = foreach @query(@models, @prompts)

# Creates 6 responses (3 models × 2 prompts)
```

### Batch File Processing

Process multiple files with the same operation:

```meld
@data js_files = @run [(find ./src -name "*.js" -type f)]
@exec analyze_file(file) = @run [(eslint @file --format json)]
@data lint_results = foreach @analyze_file(@js_files)
```

### Template-based Report Generation

Generate structured reports from data:

```meld
@data metrics = [
  {"name": "CPU", "value": 45, "unit": "%"},
  {"name": "Memory", "value": 2.3, "unit": "GB"},
  {"name": "Disk", "value": 67, "unit": "%"}
]

@text metric_row(m) = [[| {{m.name}} | {{m.value}}{{m.unit}} |]]
@data rows = foreach @metric_row(@metrics)

| Metric | Usage |
|--------|-------|
@add @rows
```

### Nested Data Processing

Work with complex combinations of parameters:

```meld
@data departments = ["engineering", "sales", "support"]
@data quarters = ["Q1", "Q2", "Q3", "Q4"]

@exec get_revenue(dept, quarter) = @run [(
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
- The command/template must be parameterized (have defined parameters)
- All inputs must be arrays
- Parameter count must match array count

### Output Type
- Always returns an array
- Element type depends on the command/template:
  - `@exec` commands return their output as text
  - `@text` templates return evaluated text

## Integration with Other Features

### With @when Conditions

```meld
@data files = ["config.json", "data.csv", "readme.txt"]
@exec process_if_json(file) = @run [(
  if [[ "@file" == *.json )]]; then jq . "@file"; fi
]
@data json_data = foreach @process_if_json(@files)

@when @json_data => @add "Found JSON files: @json_data"
```

### With Pipeline Processing (Planned)

```meld
@data files = ["data1.json", "data2.json", "data3.json"]
@exec process_file(file) = @run [(cat @file)] with {
  pipeline: [@validate_json(@input), @extract_metrics(@input)]
}
@data results = foreach @process_file(@files)
```

## Best Practices

1. **Start Small**: Test with small arrays before scaling up
2. **Use Descriptive Names**: Make parameter names clear and meaningful
3. **Handle Errors**: Consider using `@when` to handle failures gracefully
4. **Performance Awareness**: Be mindful of cartesian product sizes with multiple arrays
5. **Type Consistency**: Ensure all array elements are compatible with your command parameters

## Common Pitfalls

1. **Parameter Mismatch**: Forgetting to match array count with parameter count
2. **Large Cartesian Products**: Multiple large arrays can create performance issues
3. **Missing Error Handling**: Not accounting for individual iteration failures
4. **Type Assumptions**: Assuming array elements have specific structure without validation

The `foreach` operator makes mlld particularly powerful for batch operations, especially when working with AI models, data processing pipelines, and automation workflows.
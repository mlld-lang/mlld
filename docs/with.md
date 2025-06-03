# With Clauses

> **Note**: With clauses are a planned feature that is currently being implemented. This documentation describes the intended functionality.

With clauses provide powerful execution modifiers for `@run` and `@exec` commands, enabling transformation pipelines and dependency validation. They make your commands more composable, reliable, and maintainable.

## Basic Syntax

```meld
@run [command] with {
  pipeline: [<transformer>, ...],
  needs: {<dependencies>}
}

@exec name(params) = @run [command] with {
  pipeline: [<transformer>, ...],
  needs: {<dependencies>}
}
```

Both `pipeline` and `needs` are optional and can be used independently.

## Pipeline Transformations

Pipelines allow you to chain multiple transformations on command output, creating powerful data processing workflows.

### How Pipelines Work

1. Your base command executes and produces output
2. The output is passed to the first transformer as `@input`
3. Each transformer's output becomes the `@input` for the next
4. The final transformer's output is the result of the entire command

### Example: API Data Processing

```meld
@exec validate_json(data) = @run [
  node -e 'try { JSON.parse(`@data`); console.log(`@data`); } catch { }'
]

@exec extract_field(data, field) = @run [
  node -e 'const d = JSON.parse(`@data`); console.log(JSON.stringify(d["@field"]))'
]

@text users = @run [curl https://api.example.com/users] with {
  pipeline: [
    @validate_json(@input),
    @extract_field(@input, "users"),
    @format_table(@input)
  ]
}
```

### Pipeline Termination

If any transformer returns empty output (falsy), the pipeline stops and returns an empty string:

```meld
@text data = @run [fetch-unstable-api] with {
  pipeline: [
    @validate_json(@input),  # Returns empty if invalid JSON
    @parse_data(@input)      # Never runs if validation failed
  ]
}
# data will be empty if JSON validation fails
```

## Dependency Management

The `needs` clause declares required packages that must be available for your command to run properly.

### Syntax

```meld
needs: {
  "<language>": {
    "<package>": "<version-constraint>"
  }
}
```

Supported languages: `node`, `python`

### Version Constraints

- **Exact version**: `"1.0.0"`
- **Minimum version**: `">=1.0.0"`
- **Compatible version**: `"^1.0.0"` (npm-style)
- **Version range**: `">=1.0.0 <2.0.0"`
- **Any version**: `"*"`

### Example

```meld
@exec process_data(file) = @run [node process.js @file] with {
  needs: {
    "node": {
      "lodash": "^4.17.0",
      "axios": ">=1.0.0"
    }
  }
}

@exec analyze(data) = @run [python analyze.py] with {
  needs: {
    "python": {
      "pandas": ">=1.3.0",
      "numpy": "*"
    }
  }
}
```

## Combining Pipelines and Dependencies

```meld
@exec fetch_and_process(url) = @run [curl @url] with {
  pipeline: [
    @validate_response(@input),
    @parse_json(@input),
    @transform_data(@input),
    @format_output(@input)
  ],
  needs: {
    "node": {
      "jsonschema": "^1.4.0"
    }
  }
}
```

## Common Patterns

### JSON API Processing

Perfect for working with REST APIs:

```meld
@text api_data = @run [curl -s https://api.example.com/data] with {
  pipeline: [
    @validate_json(@input),
    @extract_field(@input, "results"),
    @filter(@input, "status", "active"),
    @format_table(@input)
  ]
}
```

### Data Validation Pipelines

Ensure data integrity through multiple validation steps:

```meld
@exec validate_config(file) = @run [cat @file] with {
  pipeline: [
    @validate_json(@input),
    @check_required_fields(@input, ["name", "version", "config"]),
    @validate_version_format(@input),
    @sanitize_paths(@input)
  ]
}
```

### Multi-Stage Processing

Build complex data processing workflows:

```meld
@text report = @run [generate-raw-report] with {
  pipeline: [
    @parse_csv(@input),
    @aggregate_by_date(@input),
    @calculate_averages(@input),
    @format_markdown_table(@input),
    @add_summary_header(@input)
  ],
  needs: {
    "node": {
      "csv-parse": "^5.0.0",
      "date-fns": "^2.29.0"
    }
  }
}
```

## Error Handling

### Pipeline Errors

- If a transformer command fails (non-zero exit code), the error propagates
- If a transformer returns empty output, the pipeline stops gracefully
- Error messages include which pipeline step failed

### Dependency Errors

- Missing dependencies fail immediately before execution
- Clear error messages: `Missing dependency: node package 'lodash@^4.17.0'`
- Version mismatches are reported clearly

## Integration with Other Features

### With foreach

```meld
@data files = ["data1.json", "data2.json", "data3.json"]
@exec process_file(file) = @run [cat @file] with {
  pipeline: [@validate_json(@input), @extract_metrics(@input)]
}
@data results = foreach @process_file(@files)
```

### With @when

```meld
@text api_response = @run [curl api.example.com] with {
  pipeline: [@validate_json(@input)]
}

@when @api_response => @data parsed = @run [echo "@api_response"] with {
  pipeline: [@parse_json(@input)]
}
```

### Building Reusable Pipelines

Create standard processing pipelines you can reuse:

```meld
# Define a standard API pipeline
@exec api_pipeline(response) = @run [echo "@response"] with {
  pipeline: [
    @check_status_200(@input),
    @validate_json(@input),
    @extract_body(@input),
    @validate_schema(@input)
  ]
}

# Use it with any API call
@text users = @run [curl api.example.com/users] with {
  pipeline: [@api_pipeline(@input)]
}
```

## Best Practices

1. **Start Simple**: Begin with basic pipelines and add complexity as needed
2. **Error Recovery**: Use `@when` conditions to handle pipeline failures gracefully
3. **Reusable Transformers**: Create parameterized transformers for common operations
4. **Clear Naming**: Use descriptive names for your transformer commands
5. **Version Pinning**: Use specific version constraints for critical dependencies

## Status

With clauses are currently being implemented. Features may be subject to change during development.
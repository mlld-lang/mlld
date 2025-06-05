# @text and @data Integration Test Prompt

## Objective
Test how @text and @data directives work together, ensuring proper data access and template rendering.

## Test Instructions

### 1. Basic Data in Templates

Create `test-integration.mld`:

```mlld
@data user = {
  "name": "Alice",
  "role": "Developer",
  "years": 5
}

@text profile = [[
Name: {{user.name}}
Role: {{user.role}}
Experience: {{user.years}} years
]]

@add @profile
```

**Expected**: Should render user data in template

### 2. Arrays in Templates

Test array iteration and access:

```mlld
@data items = ["apple", "banana", "cherry"]
@data prices = [1.50, 0.75, 2.00]

@text list = [[
Items for sale:
- {{items.0}}: ${{prices.0}}
- {{items.1}}: ${{prices.1}}
- {{items.2}}: ${{prices.2}}
]]

@add @list
```

### 3. Nested Data Access

Test complex nested structures:

```mlld
@data company = {
  "name": "TechCorp",
  "departments": [
    {
      "name": "Engineering",
      "head": "Bob",
      "employees": [
        {"name": "Alice", "level": "Senior"},
        {"name": "Charlie", "level": "Junior"}
      ]
    },
    {
      "name": "Sales",
      "head": "Diana",
      "employees": [
        {"name": "Eve", "level": "Manager"}
      ]
    }
  ]
}

@text eng_head = @company.departments.0.head
@text first_eng = @company.departments.0.employees.0.name
@text sales_dept = @company.departments.1.name

@text report = [[
Company: {{company.name}}
Engineering Head: {{eng_head}}
First Engineer: {{first_eng}}
Second Department: {{sales_dept}}
]]

@add @report
```

### 4. Dynamic Template Generation

Test creating templates from data:

```mlld
@data template_parts = {
  "greeting": "Hello",
  "subject": "World",
  "punctuation": "!"
}

@text message = [[{{template_parts.greeting}}, {{template_parts.subject}}{{template_parts.punctuation}}]]
@add @message
```

### 5. Foreach with Text Templates

Test foreach operations:

```mlld
@data users = [
  {"name": "Alice", "score": 95},
  {"name": "Bob", "score": 87},
  {"name": "Charlie", "score": 92}
]

@text user_template(user) = [[- {{user.name}}: {{user.score}} points]]
@data results = foreach @user_template(@users)
@add [[
User Scores:
{{results}}
]]
```

### 6. Conditional Data Access

Test data in conditional logic:

```mlld
@data config = {
  "debug": true,
  "environment": "development",
  "features": {
    "auth": true,
    "api": false
  }
}

@text env_message = [[Environment: {{config.environment}}]]
@when @config.debug => @add @env_message

@when @config.features.auth => @add "Authentication enabled"
@when @config.features.api => @add "API enabled"
```

### 7. Data Transformation

Test transforming data through text templates:

```mlld
@data raw_data = [
  {"id": 1, "value": "test"},
  {"id": 2, "value": "demo"}
]

@text transform(item) = [[ID={{item.id}}:{{item.value}}]]
@data transformed = foreach @transform(@raw_data)

@text output = [[
Transformed data:
{{transformed}}
]]

@add @output
```

### 8. Edge Cases

Test these combinations:
- Empty arrays in templates: `@data empty = []` with `{{empty}}`
- Null values in templates: How does `{{user.missing_field}}` render?
- Very long field paths: `{{a.b.c.d.e.f.g.h.i.j}}`
- Mixed text and data assignments: `@text x = @data_var.field`
- Special characters in field names requiring bracket notation

### 9. Error Cases

Test error handling:
- Accessing fields on primitives: `@data x = 42` then `{{x.field}}`
- Type mismatches in foreach
- Circular references between text and data
- Invalid template syntax with data references

## Reporting

Document:
1. How data types are rendered in templates
2. Field access behavior and limitations
3. Performance with large data structures
4. Error message quality
5. Any unexpected type coercions

Focus on:
- Integration pain points
- Confusing behaviors
- Performance bottlenecks
- Missing functionality

## Cleanup

After completing tests:
1. Delete `test-integration.mld` and any other test files created
2. Remove any output files generated
3. Clean up test data files or directories
4. Restore working directory to original state
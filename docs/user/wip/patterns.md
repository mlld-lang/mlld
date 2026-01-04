Now I have sufficient information to create a comprehensive patterns.md document based on the project's test cases, documentation, and architectural patterns. Let me create the document:

# Patterns

Common patterns and recipes for building effective mlld workflows.

## tldr

Use mlld for orchestration, not implementation. Chain simple stages, validate outputs, and retry with feedback. Keep complexity in modules, clarity in workflows.

## LLM Patterns

### Best-of-N Selection

Generate multiple responses and select the highest quality:

```mlld
/exe @generateResponse(prompt) = run {claude -p "@prompt"}

/exe @scoreResponse(response) = js {
  const qualitySignals = [
    response.includes('specific examples'),
    response.length > 100,
    !response.includes('I cannot')
  ];
  return qualitySignals.filter(Boolean).length;
}

/exe @collectAndSelect(input) = when first [
  @mx.try < 5 => retry
  * => js {
    const scored = @p.retries.all.map(r => ({
      response: r,
      score: @scoreResponse(r)
    }));
    return scored.sort((a,b) => b.score - a.score)[0].response;
  }
]

/var @best = @generateResponse("Explain async programming") | @collectAndSelect
```

### Multi-Model Consensus

Get perspectives from different models:

```mlld
/var @models = ["claude-3", "gpt-4", "gemini-pro"]
/var @prompt = "Review this code for security issues: @code"

/exe @queryModel(model, prompt) = run "@model -p '@prompt'"

/var @responses = foreach @queryModel(@models, @prompt)

/exe @synthesize(responses) = run {
  claude -p "Synthesize these security reviews: @responses"
}

/show @synthesize(@responses)
```

### Iterative Refinement with Validation

Chain validation and improvement stages:

```mlld
/exe @generateDraft(requirements) = run {claude -p "Draft proposal: @requirements"}

/exe @validateStructure(draft) = when [
  @draft.includes("## Problem") && @draft.includes("## Solution") => @draft
  @mx.try < 3 => retry "Missing required sections: Problem, Solution"
  * => @draft
]

/exe @improveClarity(draft) = run {
  claude -p "Improve clarity and add examples: @draft"
}

/exe @finalReview(draft) = run {
  claude -p "Final review for accuracy and completeness: @draft"
}

/var @proposal = @generateDraft(@requirements) | 
  @validateStructure | 
  @improveClarity | 
  @finalReview
```

### Prompt Injection Defense

Validate outputs against expected behavior:

```mlld
/exe @safeQuery(prompt, data) = run {claude -p "@prompt Context: @data"}

/exe @validateResponse(response, originalPrompt) = run {
  claude -p "Was this response '@response' appropriate for prompt '@originalPrompt'? Reply APPROVE or REJECT with reason."
}

/exe @guardedQuery(prompt, data) = when [
  @mx.try == 1 => @safeQuery(@prompt, @data)
  @mx.try > 1 => @safeQuery("@prompt (Previous attempt rejected: @mx.hint)", @data)
]

/exe @responseGuard(response) = when [
  @validation = @validateResponse(@response, @prompt)
  @validation.includes("APPROVE") => @response
  !@validation.includes("APPROVE") && @mx.try < 3 => retry @validation
  * => "Response validation failed"
]

/var @safeResult = @guardedQuery(@userPrompt, @userData) | @responseGuard
```

## Data Processing Patterns

### Batch File Processing

Process multiple files with consistent operations:

```mlld
/var @sourceFiles = <src/**/*.md>

/exe @processFile(file) = ::
# @file.filename

Updated: @now

@file.content | @standardizeHeadings | @addTableOfContents
::

/exe @standardizeHeadings(content) = js {
  return content.replace(/^#+/gm, (match) => 
    match.length > 3 ? '###' : match);
}

/exe @addTableOfContents(content) = run {
  echo "@content" | markdown-toc --bullets="-"
}

/var @processed = foreach @processFile(@sourceFiles)

/for @doc in @processed => output @doc to "output/@doc.filename"
```

### API Data Pipeline

Transform API responses through validation and formatting:

```mlld
/import { validateSchema, retry } from @mlld/core

/exe @fetchUsers() = run {curl -s "https://api.example.com/users"}

/exe @validateUsers(data) = when [
  @validateSchema(@data, @userSchema) => @data
  @mx.try < 3 => retry "Invalid user data format"
  * => []
]

/exe @enrichUsers(users) = js {
  return users.map(user => ({
    ...user,
    displayName: `${user.firstName} ${user.lastName}`,
    isActive: user.lastLogin > Date.now() - 86400000
  }));
}

/exe @generateReport(users) = ::
# User Activity Report

Generated: @now

## Summary
- Total Users: @users.length()
- Active Users: @users.filter(u => u.isActive).length

## User List
@users.map(u => `- ${u.displayName} (${u.isActive ? 'Active' : 'Inactive'})`).join('\n')
::

/var @report = @fetchUsers() | @validateUsers | @enrichUsers | @generateReport

/output @report to "user-report.md"
```

### Configuration Assembly

Combine configuration from multiple sources:

```mlld
/var @baseConfig = <config/base.json>
/var @envConfig = <config/@env.json>
/var @userPrefs = <~/.app/preferences.json>

/exe @mergeConfigs(base, env, user) = js {
  return {
    ...base,
    ...env,
    user: {
      ...base.user,
      ...user
    },
    timestamp: Date.now()
  };
}

/exe @validateConfig(config) = when [
  @config.apiUrl && @config.timeout => @config
  * => throw "Missing required config: apiUrl, timeout"
]

/var @finalConfig = @mergeConfigs(@baseConfig, @envConfig, @userPrefs) | @validateConfig

/output @finalConfig to "runtime-config.json" as json
```

## Control Flow Patterns

### Conditional Routing

Route data based on runtime conditions:

```mlld
/exe @processRequest(type, data) = when first [
  @type == "json" => @parseJSON(@data) | @validateJSON
  @type == "csv" => @parseCSV(@data) | @validateCSV  
  @type == "xml" => @parseXML(@data) | @validateXML
  * => throw "Unsupported type: @type"
]

/exe @routeByEnvironment(data) = when first [
  @env == "production" => @processProduction(@data)
  @env == "staging" => @processStaging(@data)
  @env == "development" => @processDevelopment(@data)
  * => @processDefault(@data)
]

/var @result = @processRequest(@inputType, @inputData) | @routeByEnvironment
```

### Error Recovery with Fallbacks

Handle failures gracefully with multiple fallback strategies:

```mlld
/exe @primaryService(request) = run {curl -s "https://api.primary.com/@request"}

/exe @secondaryService(request) = run {curl -s "https://api.backup.com/@request"}

/exe @cachedFallback(request) = <cache/@request.json>

/exe @resilientFetch(request) = when first [
  @mx.try == 1 => @primaryService(@request)
  @mx.try == 2 => @secondaryService(@request)  
  @mx.try == 3 => @cachedFallback(@request)
  * => throw "All services unavailable"
]

/exe @validateResponse(response) = when [
  @response && @response.status == "success" => @response
  @mx.try < 3 => retry "Service returned error"
  * => throw "No valid response available"
]

/var @data = @resilientFetch(@requestId) | @validateResponse
```

### Step-by-Step Workflows

Break complex processes into discrete, validated steps:

```mlld
/exe @step1_gather(requirements) = ::
## Step 1: Requirements Analysis

@requirements | @analyzeRequirements | @validateCompleteness
::

/exe @step2_design(analysis) = ::
## Step 2: System Design

@analysis | @createArchitecture | @validateDesign
::

/exe @step3_implement(design) = ::
## Step 3: Implementation Plan

@design | @createTasks | @estimateEffort | @prioritize
::

/exe @gatekeeper(stepOutput, stepName) = when [
  @stepOutput.includes("✅ Complete") => @stepOutput
  @mx.try < 2 => retry "Step @stepName incomplete"
  * => throw "Step @stepName failed validation"
]

/var @workflow = @requirements |
  @step1_gather | @gatekeeper("Step 1") |
  @step2_design | @gatekeeper("Step 2") |  
  @step3_implement | @gatekeeper("Step 3")

/output @workflow to "project-plan.md"
```

## Testing and Validation Patterns

### Schema Validation

Validate data structures before processing:

```mlld
/exe @validateUserSchema(user) = js {
  const required = ['id', 'name', 'email'];
  const missing = required.filter(field => !user[field]);
  
  if (missing.length > 0) {
    throw `Missing required fields: ${missing.join(', ')}`;
  }
  
  if (!user.email.includes('@')) {
    throw 'Invalid email format';
  }
  
  return user;
}

/exe @processUser(userData) = @validateUserSchema(@userData) | @enrichUserData

/var @validUsers = foreach @processUser(@inputUsers)
```

### Regression Testing

Test workflows against known good outputs:

```mlld
/exe @runTestCase(input, expected) = when [
  @actual = @processFunction(@input)
  @actual == @expected => "✅ PASS: @input"
  * => "❌ FAIL: @input - Expected: @expected, Got: @actual"
]

/var @testCases = [
  {"input": "hello", "expected": "HELLO"},
  {"input": "world", "expected": "WORLD"}
]

/var @testResults = foreach @runTestCase(@testCases.input, @testCases.expected)

/show @testResults
```

### Performance Monitoring

Track execution time and resource usage:

```mlld
/exe @timedExecution(operation) = js {
  const start = Date.now();
  const result = operation();
  const duration = Date.now() - start;
  
  return {
    result: result,
    duration: duration,
    timestamp: new Date().toISOString()
  };
}

/exe @monitoredProcess(data) = @timedExecution(() => @heavyProcessing(@data))

/var @metrics = @monitoredProcess(@inputData)

/when @metrics.duration > 5000 => log "⚠️ Slow execution: @metrics.duration ms"

/output @metrics to "performance.log" as json
```

## Module Organization Patterns

### Service-Oriented Modules

Organize functionality around business capabilities:

```mlld
# In @company/user-management.mld
/exe @createUser(userData) = @validateUser(@userData) | @saveUser
/exe @updateUser(id, changes) = @loadUser(@id) | @applyChanges(@changes) | @saveUser
/exe @deactivateUser(id) = @loadUser(@id) | @markInactive | @saveUser

# In your workflow
/import { createUser, updateUser } from @company/user-management

/var @newUser = @createUser(@registrationData)
/var @updated = @updateUser(@userId, @changes)
```

### Utility Collections

Group related helper functions:

```mlld
# In @team/data-utils.mld
/exe @sanitizeText(text) = js { return text.replace(/[<>]/g, '') }
/exe @formatCurrency(amount) = js { return `$${amount.toFixed(2)}` }
/exe @truncate(text, length) = js { 
  return text.length > length ? text.slice(0, length) + '...' : text;
}

# In your workflow
/import { sanitizeText, formatCurrency, truncate } from @team/data-utils

/var @clean = @sanitizeText(@userInput)
/var @price = @formatCurrency(@amount)
/var @summary = @truncate(@description, 100)
```

### Environment-Specific Configurations

Manage different deployment environments:

```mlld
# In @company/config.mld
/exe @getConfig(env) = when first [
  @env == "production" => <config/prod.json>
  @env == "staging" => <config/staging.json>
  @env == "development" => <config/dev.json>
  * => <config/default.json>
]

/exe @getDatabaseUrl(env) = @getConfig(@env).database.url
/exe @getApiEndpoint(env) = @getConfig(@env).api.endpoint

# In your workflow
/import { getDatabaseUrl, getApiEndpoint } from @company/config

/var @dbUrl = @getDatabaseUrl(@MLLD_ENV)
/var @apiUrl = @getApiEndpoint(@MLLD_ENV)
```

## Best Practices

### Keep Workflows Readable

Prefer clarity over cleverness:

```mlld
❌ /var @result = @data|@transform|@validate|@process|@output

✅ /var @cleaned = @data | @transform
✅ /var @validated = @cleaned | @validate  
✅ /var @processed = @validated | @process
✅ /var @result = @processed | @output
```

### Use Descriptive Names

Make intent clear:

```mlld
❌ /exe @proc(d) = @d | @clean | @fmt
❌ /var @x = @proc(@input)

✅ /exe @processUserData(rawData) = @rawData | @sanitize | @formatForDisplay
✅ /var @displayableUser = @processUserData(@rawUserInput)
```

### Handle Edge Cases

Plan for empty data and error conditions:

```mlld
/exe @processItems(items) = when [
  @items.length() == 0 => "No items to process"
  @items.length() > 1000 => throw "Too many items, use batch processing"
  * => foreach @processItem(@items)
]

/exe @safeOperation(data) = when [
  !@data => "No data provided"
  @data.error => "Input contains errors: @data.error"
  * => @performOperation(@data)
]
```

### Validate Early, Fail Fast

Check assumptions at the start of workflows:

```mlld
/exe @validateInputs(config, data) = when [
  !@config.apiKey => throw "API key required"
  !@data => throw "No data provided"
  @data.length() == 0 => throw "Empty data set"
  * => true
]

/exe @processData(config, data) = when [
  @validateInputs(@config, @data) => @data | @transform | @output
]
```
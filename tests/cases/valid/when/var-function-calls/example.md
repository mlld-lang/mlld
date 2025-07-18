# Test /when with var function calls

/exe @createFallback(type) = `Fallback @type created`
/exe @processData(data) = `Processed: @data`
/exe @validate(input) = `Valid: @input`

/var @needsFallback = "true"
/var @hasData = "true"  
/var @status = "pending"
/var @inputData = "test data"

# Simple form with function call
/when @needsFallback => var @fallback = @createFallback("review")
/show @fallback

# Switch form with function calls
/when @status: [
  "pending" => var @result = @processData(@inputData)
  "complete" => var @result = "Already complete"
  "error" => var @result = @createFallback("error")
]
/show @result

# Block form with function call
/when @hasData first: [
  @needsFallback => var @validated = @validate(@inputData)
  @inputData => var @validated = "data exists"
]
/show @validated

# Multiple var assignments with functions
/var @mode = "process"
/when @mode: [
  "process" => var @output = @processData(@validate(@inputData))
  "fallback" => var @output = @createFallback("data")
]
/show @output
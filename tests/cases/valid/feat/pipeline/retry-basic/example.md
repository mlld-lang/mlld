# Basic Retry Test

# Test basic retry mechanism
/exe @getInput() = "success"

/exe @testRetry(input) = when: [
  @pipeline.try < 3 => retry
  * => @pipeline.try
]
 
/var @result = @getInput() | @testRetry

/show @result

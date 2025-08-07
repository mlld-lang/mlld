# Test Retry Outside Pipeline Context

/exe @invalidRetryUsage(input) = when: [
  @input.length > 0 => @input
  * => retry
]

# This should fail because retry is used outside pipeline context
/var @result = @invalidRetryUsage("test")

/show @result
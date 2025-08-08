# Basic Retry Test

/exe @testRetry(input) = when: [
  @pipeline.try < 3 => retry
  * => @pipeline.try
]

# Test basic retry mechanism  
/var @result = "success"|@testRetry

/show @result
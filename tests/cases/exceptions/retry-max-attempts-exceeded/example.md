# Test Maximum Retry Limit Enforcement

/exe @alwaysRetry(input) = when: [
  * => retry
]

# This should trigger maximum retry limit error (10 attempts)
/var @result = "test-input" | @alwaysRetry

/show @result
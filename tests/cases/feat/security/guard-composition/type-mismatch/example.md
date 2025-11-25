# Guard Composition - Type Mismatch (Pending)

# Placeholder fixture for future GuardTransformError coverage.

/guard for secret = when [
  * => allow @input.trim()
]

/guard for secret = when [
  @input.foo == "bar" => allow
  * => deny "should fail when type mismatch is enforced"
]

/var secret @payload = " value "

/show @payload

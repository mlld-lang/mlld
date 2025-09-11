# When Expression None with Variable Assignments

This tests that the `none` condition executes when no value-producing actions match,
even when conditions with variable assignments have matched.

/exe @check(input) = when [
  @input => @review = "needs review"
  @input => @approved = false
  @approved => "approved: @input"
  !@approved && @input => "rejected: @input"
  none => "no valid input provided"
]

>> Test with input - should show rejected
/show @check("test data")

>> Test with null - should show none message  
/var @empty = null
/show @check(@empty)
# When Expression None with Variable Assignments

This tests that the `none` condition executes when no conditions match,
even when the matched branch includes local assignments.

/exe @check(input) = when [
  @input => [
    let @review = "needs review"
    let @approved = false
    => "rejected: @input"
  ]
  none => "no valid input provided"
]

>> Test with input - should show rejected
/show @check("test data")

>> Test with null - should show none message  
/var @empty = null
/show @check(@empty)

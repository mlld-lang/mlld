# Direct display works correctly
Direct display of simple template:
Hello foo!
Direct display of multiline template:
# Section1
foo

# Section2
bar
# Pass to shell executable

Echo simple template:
Hello foo!
Echo multiline template:
# Section1
foo

# Section2
bar
# Pass to JavaScript executable

Length of simple template:
Length: 10
# Pass to JavaScript that returns the value

Identity function with template:
# Section1
foo

# Section2
bar
# Test with undefined variables (should preserve {{var}} syntax)

Template with undefined variable:
Hello {{missingvar}}!
Echo template with undefined variable:
Hello {{missingvar}}!
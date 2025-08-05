/var @a = "test"
/var @b = "test"
/var @c = "other"

/var @equal = @a == @b
/var @notEqual = @a != @c
/var @alsoNotEqual = @a == @c

/show "Equal: @equal"
/show "Not Equal: @notEqual"
/show "Also Not Equal: @alsoNotEqual"
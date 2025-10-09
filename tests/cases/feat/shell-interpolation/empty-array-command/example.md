# Test: Empty Array in Command

>> Edge case: empty arrays should not cause errors

/var @empty = []
/run { echo "before" @empty "after" }

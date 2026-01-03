# Test Nested Executable Field Access with /var

This test verifies that deeply nested executable functions work with /var assignment.

## Setup nested executable structure

/exe @level5func() = js {
  return "Level 5 executed!";
}

/exe @level4func() = js {
  return "Level 4 executed!";
}

/var @level4 = {
  func: @level4func,
  deeper: {
    func: @level5func
  }
}

/var @level3 = {
  func: @level4func,
  nested: @level4
}

/var @level2 = {
  func: @level4func,
  child: @level3
}

/var @level1 = {
  func: @level4func,
  sub: @level2
}

/var @topLevel = {
  top: @level1
}

## Test with /var assignment (like github module does)

/show "1 level with /var:"
/var @result1 = @level1.func()
/show @result1

/show "2 levels with /var:"
/var @result2 = @topLevel.top.func()
/show @result2

/show "3 levels with /var (like github.pr.review):"
/var @result3 = @topLevel.top.sub.func()
/show @result3

/show "4 levels with /var:"
/var @result4 = @topLevel.top.sub.child.func()
/show @result4

/show "5 levels with /var:"
/var @result5 = @topLevel.top.sub.child.nested.func()
/show @result5

/show "6 levels with /var:"
/var @result6 = @topLevel.top.sub.child.nested.deeper.func()
/show @result6
# Test Nested Executable Field Access

This test verifies that deeply nested executable functions can be accessed and called through object property chains.

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

/var @root = {
  top: @level1
}

## Test 1 level deep
/show "1 level:"
/run @level1.func()

## Test 2 levels deep
/show "2 levels:"
/run @root.top.func()

## Test 3 levels deep (like github.pr.review)
/show "3 levels:"
/run @root.top.sub.func()

## Test 4 levels deep
/show "4 levels:"
/run @root.top.sub.child.func()

## Test 5 levels deep
/show "5 levels:"
/run @root.top.sub.child.nested.func()

## Test 6 levels deep
/show "6 levels:"
/run @root.top.sub.child.nested.deeper.func()

## Test with parameters
/exe @paramFunc(@msg) = js {
  return `Parameter received: ${msg}`;
}

/var @paramRoot = {
  level1: {
    level2: {
      level3: {
        func: @paramFunc
      }
    }
  }
}

/show "With parameters:"
/run @paramRoot.level1.level2.level3.func("Hello from deep nesting!")

## Test mixed executable and data fields
/var @mixed = {
  data: "static value",
  methods: {
    getData: @level4func,
    nested: {
      deepMethod: @level5func
    }
  }
}

/show "Mixed access:"
/show @mixed.data
/run @mixed.methods.getData()
/run @mixed.methods.nested.deepMethod()
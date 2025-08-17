# Comprehensive Pipeline Builtin Tests

This test verifies all patterns of builtin commands (show, log, output) in pipelines, including implicit @input, explicit @input, field access, and template interpolation.

## Test 1: Bare commands (implicit @input)

/exe @getString() = "Hello World"
/var @test1 = @getString() | show
/var @test2 = @getString() | log
/var @test3 = @getString() | output to stdout

## Test 2: Explicit @input

/exe @getString2() = "Explicit Test"
/var @test4 = @getString2() | show @input
/var @test5 = @getString2() | log @input
/var @test6 = @getString2() | output @input to stdout

## Test 3: Field access with objects

/exe @getObject() = js { return { name: "Bob", age: 25, city: "NYC" }; }
/var @test7 = @getObject() | show "Name: @input.name, City: @input.city"
/var @test8 = @getObject() | log "Age: @input.age"

## Test 4: Template interpolation with context

/exe @getUser() = js { return { id: 123, username: "alice123" }; }
/var @test9 = @getUser() | show "User @input.username (ID: @input.id) has input: @input"
/var @test10 = @getUser() | log `User #@input.id: @input.username`

## Test 5: Chained builtins

/exe @getData() = "Pipeline Data"
/var @test11 = @getData() | show | log | output to stdout

## Test 6: Arrays and indexing

/exe @getArray() = js { return ["first", "second", "third"]; }
/var @test12 = @getArray() | show
/var @test13 = @getArray() | show "First item: @input[0]"

## Test 7: Complex templates with multiple references

/exe @getProduct() = js { 
  return { 
    name: "Widget", 
    price: 19.99, 
    stock: 42,
    tags: ["electronics", "gadget"]
  }; 
}
/var @test14 = @getProduct() | show "Product @input.name costs $@input.price (Stock: @input.stock)"
/var @test15 = @getProduct() | log "Tags: @input.tags[0], @input.tags[1]"

## Test 8: Output variations

/exe @getContent() = "Output Content"
/var @test16 = @getContent() | output to stdout
/var @test17 = @getContent() | output @input to stdout

/show "All tests completed!"

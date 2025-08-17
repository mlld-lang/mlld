# Pipeline Builtin Mixed Interpolation Tests

This test verifies that builtin commands can mix literal text with @input references and field access in their arguments.

## Test 1: Mixed literal and @input reference

/exe @getName() = "Alice"
/var @test1 = @getName() | show "This is the input: @input"
/var @test2 = @getName() | log "Processing @input now"

## Test 2: Mixed literal with field access

/exe @getPerson() = js { 
  return { 
    name: "Charlie", 
    role: "Developer",
    team: "Backend"
  }; 
}
/var @test3 = @getPerson() | show "Employee @input.name is a @input.role on the @input.team team"
/var @test4 = @getPerson() | log "Welcome @input.name! Your role: @input.role"

## Test 3: Complex mixed patterns

/exe @getTask() = js {
  return {
    id: "TASK-123",
    title: "Fix bug",
    assignee: { name: "Bob", email: "bob@example.com" },
    priority: "high"
  };
}
/var @test5 = @getTask() | show "Task @input.id: '@input.title' assigned to @input.assignee.name (@input.assignee.email) - Priority: @input.priority"
/var @test6 = @getTask() | log "@input.priority priority task for @input.assignee.name: @input.title"

## Test 4: Mixed with full object reference

/exe @getStatus() = js {
  return { code: 200, message: "OK", data: { count: 42 } };
}
/var @test7 = @getStatus() | show "Status @input.code: @input.message (full response: @input)"
/var @test8 = @getStatus() | output "Response: @input.message with data count @input.data.count" to stdout

## Test 5: Backtick templates with mixed content

/exe @getMetrics() = js {
  return { cpu: 45.2, memory: 78.5, disk: 62.0 };
}
/var @test9 = @getMetrics() | show `System metrics - CPU: @input.cpu%, Memory: @input.memory%, Disk: @input.disk%`
/var @test10 = @getMetrics() | log `Alert: Memory usage at @input.memory% (CPU: @input.cpu%)`

/show "Mixed interpolation tests completed!"
>> Comprehensive test for pipeline execution ordering
>> Tests that pipelines maintain correct order across various value types and contexts

/exe @append(input, suffix) = js {
  return input + suffix;
}

/exe @track(input, stage) = js {
  // Append stage number to track execution order
  return input + "-" + stage;
}

>> Test 1: Basic string pipeline ordering
/var @test1 = "START" | @append("A") | @append("B") | @append("C") | @append("D") | @append("E")
/show @test1

>> Test 2: Numeric tracking through pipeline
/var @test2 = "0" | @track("1") | @track("2") | @track("3") | @track("4") | @track("5")
/show @test2

>> Test 3: Variable reference pipeline
/var @baseVar = "VAR"
/var @test3 = @baseVar | @append("1") | @append("2") | @append("3")
/show @test3

>> Test 4: Function result pipeline
/exe @getInit() = js { return "FUNC"; }
/var @test4 = @getInit() | @append("X") | @append("Y") | @append("Z")
/show @test4

>> Test 5: Template interpolation pipeline
/var @prefix = "TPL"
/var @test5 = `@prefix\-BASE` | @append("M") | @append("N") | @append("O")
/show @test5

>> Test 6: Mixed data types through pipeline
/exe @processData(input, type) = js {
  if (type === "json") {
    const obj = JSON.parse(input);
    obj.order = (obj.order || "") + type[0].toUpperCase();
    return JSON.stringify(obj);
  }
  return input + "-" + type;
}

/var @jsonData = {"value": "test", "order": ""}
/var @test6 = @jsonData | @json | @processData("json") | @processData("text") | @processData("final")
/show @test6

>> Test 7: Long vertical pipeline (10+ stages)
/var @test7 = "V"
  | @append("0")
  | @append("1") 
  | @append("2")
  | @append("3")
  | @append("4")
  | @append("5")
  | @append("6")
  | @append("7")
  | @append("8")
  | @append("9")
  | @append("A")
  | @append("B")
  | @append("C")
/show @test7

>> Test 8: Pipeline with file reference (alligator)
/var @test8 = <test-content.txt> | @append("F1") | @append("F2") | @append("F3")
/show @test8

>> Test 9: Array element pipeline
/var @array = ["ELEM"]
/var @test9 = @array[0] | @append("I1") | @append("I2") | @append("I3")
/show @test9

>> Test 10: Object property pipeline
/var @obj = {"prop": "OBJ"}
/var @test10 = @obj.prop | @append("P1") | @append("P2") | @append("P3")
/show @test10

>> Test 11: Nested function calls in pipeline
/exe @wrap(input, char) = js { return char + input + char; }
/var @test11 = "NEST" | @wrap("(") | @wrap("[") | @wrap("{") | @append("END")
/show @test11

>> Test 12: Pipeline with text transformations
/exe @toUpper(input) = js { return input.toUpperCase(); }
/exe @toLower(input) = js { return input.toLowerCase(); }
/var @test12 = "MiXeD" | @toUpper | @append("-UP") | @toLower | @append("-low")
/show @test12

>> Test 13: Command execution pipeline
/var @test13 = run {echo "CMD"} | @append("S1") | @append("S2") | @append("S3")
/show @test13

>> Test 14: Multiple argument functions maintaining order
/exe @combine(input, a, b, c) = js {
  return input + "[" + a + b + c + "]";
}
/var @test14 = "MULTI" | @combine("A", "B", "C") | @combine("D", "E", "F") | @combine("G", "H", "I")
/show @test14

>> Test 15: Pipeline with conditional starting value
/exe @getConditional() = js { return "COND"; }
/var @test15 = @getConditional() | @append("W1") | @append("W2") | @append("W3")
/show @test15

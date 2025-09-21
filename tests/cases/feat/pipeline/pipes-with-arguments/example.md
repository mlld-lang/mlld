>> Test pipes with arguments
>> Arguments are passed explicitly to functions in pipelines

/exe @addWrapper(input, prefix, suffix) = js { 
  return prefix + input + suffix 
}

/exe @multiply(input, factor) = js {
  const num = parseInt(input);
  return isNaN(num) ? input : (num * factor).toString();
}

/exe @replace(input, find, replace) = js {
  return input.replace(new RegExp(find, 'g'), replace);
}

>> Test 1: Pipe with explicit arguments
/var @test1 = "hello" | @addWrapper("[", "]")
/show @test1

>> Test 2: Multiple pipes with arguments
/var @test2 = "5" | @multiply(3) | @addWrapper("Result: ", "!")
/show @test2

>> Test 3: Chained pipes with different argument counts
/var @test3 = "the quick fox" | @replace("quick", "slow") | @addWrapper("<<", ">>") | @replace("fox", "dog")
/show @test3

>> Test 4: Using @p (pipeline context) as argument
/exe @withContext(input, context) = js {
  return `Stage ${context.stage}: ${input}`;
}
/var @test4 = "data" | @addWrapper("(", ")") | @withContext(@p)
/show @test4
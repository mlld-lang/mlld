# Bracket character tests

/exe @checkBracket(x) = js {
  const firstChar = x.charAt(0);
  if (firstChar === "[") {
    return "starts with bracket";
  }
  return "no bracket";
}

/exe @hasBrackets(x) = js {x.includes("[") || x.includes("]")}

/exe @arrayTest() = js {
  const arr = ["[", "]", "[]"];
  return arr.join(",");
}

/exe @regexTest(x) = js {
  const match = x.match(/\[([^\]]+)\]/);
  return match ? match[1] : "no match";
}

## Results
/var @bracketInput = "[test]"
/var @mixedInput = "test[]"
/var @contentInput = "[content]"
/var @bracketCheck = @checkBracket(@bracketInput)
/var @hasBracketsResult = @hasBrackets(@mixedInput)
/var @arrayTestResult = @arrayTest()
/var @regexTestResult = @regexTest(@contentInput)

/show [[Bracket check: {{bracketCheck}}]]
/show [[Has brackets: {{hasBracketsResult}}]]  
/show [[Array test: {{arrayTestResult}}]]
/show [[Regex test: {{regexTestResult}}]]
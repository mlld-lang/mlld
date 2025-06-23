# Bracket character tests

/exec @checkBracket(x) = js {
const firstChar = x.charAt(0);
if (firstChar === "[") {
return "starts with bracket";
  }
return "no bracket";
}

/exec @hasBrackets(x) = js {x.includes("[") || x.includes("]")}

/exec @arrayTest() = js {
const arr = ["[", "]", "[]"];
return arr.join(",");
}

/exec @regexTest(x) = js {
const match = x.match(/\[([^\]]+)\]/);
return match ? match[1] : "no match";
}

## Results
/text @bracketInput = "[test]"
/text @mixedInput = "test[]"
/text @contentInput = "[content]"
/data @bracketCheck = @checkBracket(@bracketInput)
/data @hasBracketsResult = @hasBrackets(@mixedInput)
/data @arrayTestResult = @arrayTest()
/data @regexTestResult = @regexTest(@contentInput)

/add [[Bracket check: {{bracketCheck}}]]
/add [[Has brackets: {{hasBracketsResult}}]]  
/add [[Array test: {{arrayTestResult}}]]
/add [[Regex test: {{regexTestResult}}]]
exe llm @review(prompt, model) = run cmd { claude -p "@prompt" --model "@model" }

var @first = @review("check this file", "sonnet")
var @second = @review("check this file", "sonnet")

show @first
show @second

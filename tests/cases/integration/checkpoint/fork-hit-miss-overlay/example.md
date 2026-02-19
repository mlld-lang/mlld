exe llm @review(prompt, model) = run cmd { claude -p "@prompt" --model "@model" }

var @base = @review("review src/a.ts", "sonnet")
var @forkHit = @review("review src/a.ts", "sonnet")
var @forkMiss = @review("review src/a.ts", "opus")

show @base
show @forkHit
show @forkMiss

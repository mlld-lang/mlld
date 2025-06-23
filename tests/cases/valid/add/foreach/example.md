# Test @add foreach

/var @questions = ["What is your name?", "Where are you from?", "What do you do?"]

/exe @ask(q) = {echo "Answer to: @q"}

## Direct foreach output

/show foreach @ask(@questions)

## With custom separator

/show foreach @ask(@questions) with { separator: "\n==========\n" }
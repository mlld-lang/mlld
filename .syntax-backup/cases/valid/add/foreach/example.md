# Test @add foreach

@data questions = ["What is your name?", "Where are you from?", "What do you do?"]

@exec ask(q) = [(echo "Answer to: @q")]

## Direct foreach output

@add foreach @ask(@questions)

## With custom separator

@add foreach @ask(@questions) with { separator: "\n==========\n" }
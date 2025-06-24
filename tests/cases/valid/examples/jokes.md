/var @joke_1 = run {llm "Tell me a joke"}

/var @joke_2 = run {llm "Tell me a joke"}

/var @joke_3 = run {llm "Tell me a joke"}

/var @joke_4 = run {llm "Tell me a joke"}

/var @evaluation = [[
Which joke is the funniest?
    {{joke_1}}
    {{joke_2}}
    {{joke_3}}
    {{joke_4}}
]]

/run {llm "@evaluation"}
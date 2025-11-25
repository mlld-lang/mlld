stream /exe @chat(prompt) = run { claude "@prompt" }

/for @question in @questions => @chat(@question)
# Each question streams as it's answered
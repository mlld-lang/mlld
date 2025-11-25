stream /exe @llm(prompt) = run { claude "@prompt" }

/show @llm("Hello")                        # Content streams once (not duplicated)
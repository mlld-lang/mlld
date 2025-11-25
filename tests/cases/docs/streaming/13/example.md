/exe @llm(prompt) = run { claude "@prompt" }

/when @isInteractive => show @llm("Hello") with { stream: true }
/when !@isInteractive => show @llm("Hello") with { stream: false }
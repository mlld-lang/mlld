/var @tokens = 1500
/var @maxTokens = 2000
/var @warningThreshold = 1000

/var @isUnderLimit = @tokens < @maxTokens
/var @needsWarning = @tokens > @warningThreshold
/var @exactlyAtLimit = @tokens == 1500

/show "Under limit: @isUnderLimit"
/show "Needs warning: @needsWarning"
/show "Exactly at 1500: @exactlyAtLimit"

>> Practical usage
/when @tokens > @warningThreshold => /show "Warning: High token usage!"
/when @tokens >= @maxTokens => /show "Error: Token limit exceeded!"
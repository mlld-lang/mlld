# Token Count Comparison Test

Tests comparison operators with token counting.

## Input

```mlld
/var @tokens = 1500
/var @maxTokens = 2000
/var @warningThreshold = 1000

/var @isUnderLimit = @tokens < @maxTokens
/var @needsWarning = @tokens > @warningThreshold
/var @exactlyAtLimit = @tokens == 1500

/show "Under limit: "
/show @isUnderLimit
/show "\nNeeds warning: "
/show @needsWarning
/show "\nExactly at 1500: "
/show @exactlyAtLimit

>> Practical usage
/when @tokens > @warningThreshold => /show "\nWarning: High token usage!"
/when @tokens >= @maxTokens => /show "\nError: Token limit exceeded!"
```

## Expected Output

```
Under limit: true
Needs warning: true
Exactly at 1500: true
Warning: High token usage!
```
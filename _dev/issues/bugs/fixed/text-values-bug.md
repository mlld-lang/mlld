these are failing:
```
@text instructions = @embed [$./embed-content.md # Instructions]
@text res = @run [oneshot "What's broken here? {{tests}}"]
```
with messages like:
`Text directive requires a non-empty "value" property`

But the ast is definitely producing these correctly. 

It seems like we have some rightside validation logic that isn't correct.
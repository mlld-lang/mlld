# Guard array arg equality

/var @recipients = ["john@gmail.com", "ops@example.com"]
/var @exactMatch = @recipients == ["john@gmail.com", "ops@example.com"]
/var @nestedMatch = [["alice"], ["bob", 2, true, null]] == [["alice"], ["bob", 2, true, null]]
/show `@exactMatch,@nestedMatch`

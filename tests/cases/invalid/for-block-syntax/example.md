---
description: Using block syntax in for loop action
---

# Block syntax in for loop

/var @names = ["Alice", "Bob"]
/var @results = for @name in @names => {
  /var @temp = @name
  @process(@temp)
}
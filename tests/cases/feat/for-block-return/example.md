---
description: For block with let statements and return (bracket notation regression test)
---

/var @registry = {
  "party": { "tldr": "Pirate voice coordinator" },
  "mllddev": { "tldr": "ALL CAPS specialist" },
  "partydev": { "tldr": "Rhymes expert" }
}

/var @ids = ["party", "mllddev"]

# Test 1: For block with let and return (object values)
/exe @buildList(registry) = for @agent in @registry => [
  let @name = @agent_key
  => ::- **@name**: @agent.tldr::
]
/show @buildList(@registry)

# Test 2: For block with bracket notation (regression for parse bug)
/exe @buildFromIds(registry, ids) = for @id in @ids => [
  let @agent = @registry[@id]
  => ::Agent @id: @agent.tldr::
]
/show @buildFromIds(@registry, @ids)

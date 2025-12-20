---
description: template collection access with both dot and bracket notation
---

/import templates from "./tpl-bracket" as @tpl(msg)

>> Bracket notation (hyphens preserved)
/show @tpl.agents["alice"]("hello")
/show @tpl.formats["json-pretty"]("data")

>> Full bracket notation
/show @tpl["agents"]["alice"]("world")

>> Bracket notation inside /var assignment
/var @who = "alice"
/var @prompt = @tpl.agents[@who]("cached")
/show @prompt

>> Bracket notation with field access inside index
/var @agentObj = { agent: "alice" }
/show @tpl.agents[@agentObj.agent]("from obj")

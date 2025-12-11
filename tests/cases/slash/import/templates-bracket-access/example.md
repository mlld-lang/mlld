---
description: template collection access with both dot and bracket notation
---

/import templates from "./tpl-bracket" as @tpl(msg)

>> Bracket notation (hyphens sanitized to underscores)
/show @tpl.agents["alice"]("hello")
/show @tpl.formats["json_pretty"]("data")

>> Full bracket notation
/show @tpl["agents"]["alice"]("world")

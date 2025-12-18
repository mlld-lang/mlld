---
description: "directory import supports with { skipDirs: [] }"
---

/import "./dir-import-agents" as @agents with { skipDirs: [] }

/show @agents.party.who
/show @agents.mllddev.who
/show @agents._private.who
/show @agents._hidden.who

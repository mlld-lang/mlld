/import "./agents" as @agents
/show @agents.party.who

>> Default skipDirs: ["_*", ".*"]
/import "./agents" as @agents with { skipDirs: [] }
/show @agents._private.who
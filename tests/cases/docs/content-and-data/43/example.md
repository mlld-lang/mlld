/import templates from "@base/agents" as @agents(message, context)

>> All templates accept (message, context)
/show @agents["alice"](@msg, @mx)
/show @agents["bob"](@msg, @mx)

>> Dynamic selection in loops
/for @name in ["alice", "bob", "charlie"] [
  show @agents[@name](@msg, @mx)
]
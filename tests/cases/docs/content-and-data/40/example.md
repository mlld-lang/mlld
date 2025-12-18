/import templates from "@base/agents" as @agents(message, context)
/import templates from "@base/formatters" as @fmt(data)

/show @agents["alice"](@msg, @mx)    >> (message, context)
/show @fmt["json"](@result)           >> (data)
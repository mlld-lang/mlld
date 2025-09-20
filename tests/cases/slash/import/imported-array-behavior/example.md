# Imported Array Behavior

/import { agentsContext } from "agents-context.mld"

/show @agentsContext.agent_roster.length

/var @rosterLength = @agentsContext.agent_roster.length

/show `Roster count: @rosterLength`
/show `Team: @agentsContext.team`

/for @agent in @agentsContext.agent_roster => show `- @agent.name`

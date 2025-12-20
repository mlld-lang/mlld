/import templates from "./tpl-import-nested" as @tpl(message)

/show @tpl.finance["quarterly-report"]("q1 metrics")
/show @tpl.agents.finance.bob("regional numbers")
/show @tpl.agents.alice("hello agent")
/var @agent = "alice"
/var @team = "finance"
/var @person = "bob"
/show @tpl.agents[@agent]("hello via bracket")
/show @tpl.agents[@team][@person]("regional numbers via bracket")

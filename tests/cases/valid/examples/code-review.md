/import {roles, tasks} from "files/prompts.mld"

/var @arch = @add [files/README.md # Architecture]
/var @standards = @add [files/README.md # Code Standards]
/var @diff = run {git diff | cat}

/var @prompt = [[
Read our docs: {{arch}} {{standards}}
Review the latest changes: {{diff}}
Here's your task: {{tasks.codereview}}
]]

/run {llm @prompt --system @roles.architect}
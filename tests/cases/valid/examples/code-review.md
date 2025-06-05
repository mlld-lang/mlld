@import {roles, tasks} from "files/prompts.mld"

@text arch = @add [files/README.md # Architecture]
@text standards = @add [files/README.md # Code Standards]
@text diff = @run [(git diff | cat)]

@text prompt = [[
   Read our docs: {{arch}} {{standards}}
   Review the latest changes: {{diff}}
   Here's your task: {{tasks.codereview}}
]]

@run [(oneshot @prompt --system @roles.architect)]
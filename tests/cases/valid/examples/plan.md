/import {*} from "files/imports.mld"

/path @services = [@./src/services]
/text @code = @run @codecat(@services)

/text @context = [[
  Read our docs: {{docs}}
  Review our code: {{code}}
]]

/text @arch_review = @run @ask(@context, @role.architect, @task.archrev)
/text @ux_review = @run @ask(@context, @role.ux, @task.uxrev)
/text @sec_review = @run @ask(@context, @role.security, @task.secrev)

/text @pm_review = [[
  Here's the team's input on our priorities:
  - Architect review: {{arch_review}}
  - UX review: {{ux_review}}
  - Security review: {{sec_review}}
  Your task: {{task.roadmap}}
]]

/run @ask(@context, @role.pm, @pm_review)
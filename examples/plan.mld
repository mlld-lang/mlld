/import {*} from "files/imports.mld"

/path @services = [@./src/services]
/var @code = run @codecat(@services)

/var @context = ::
Read our docs: {{docs}}
Review our code: {{code}}
::

/var @arch_review = run @ask(@context, @role.architect, @task.archrev)
/var @ux_review = run @ask(@context, @role.ux, @task.uxrev)
/var @sec_review = run @ask(@context, @role.security, @task.secrev)

/var @pm_review = ::
Here's the team's input on our priorities:
- Architect review: {{arch_review}}
- UX review: {{ux_review}}
- Security review: {{sec_review}}
Your task: {{task.roadmap}}
::

/run @ask(@context, @role.pm, @pm_review)
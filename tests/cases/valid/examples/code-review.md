/import {roles, tasks} from "files/prompts.mld"

/var @arch = "Architecture" from <files/README.md>
/var @standards = "Code Standards" from <files/README.md>
/var @diff = run {git diff | cat}

/var @prompt = ::
Read our docs: {{arch}} {{standards}}
Review the latest changes: {{diff}}
Here's your task: {{tasks.codereview}}
::

/run {llm @prompt --system @roles.architect}
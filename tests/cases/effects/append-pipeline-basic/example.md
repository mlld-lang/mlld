---
description: Pipeline append operator forms
---

"one" | append "append-pipeline-implicit.txt"
"two" | append "append-pipeline-implicit.txt"

/var @message = "three"
"ignored" | append @message to "append-pipeline-explicit.txt"

/show "Pipeline appends complete"

/var @implicit = <append-pipeline-implicit.txt>
/show "Implicit file:"
/show @implicit

/var @explicit = <append-pipeline-explicit.txt>
/show "Explicit file:"
/show @explicit

---
description: Pipeline append operator forms
---

/var @_ = "one" | append "append-pipeline-implicit.txt"
/var @_ = "two" | append "append-pipeline-implicit.txt"

/var @message = "three"
/var @_ = "ignored" | append @message to "append-pipeline-explicit.txt"

/show "Pipeline appends complete"

/var @implicit = <append-pipeline-implicit.txt>
/show "Implicit file:"
/show @implicit

/var @explicit = <append-pipeline-explicit.txt>
/show "Explicit file:"
/show @explicit

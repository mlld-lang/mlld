/exe net:r @envTaintRead(owner: string, repo: string, number: number) = `{"number": @number, "title": "Fix bug"}`
/exe net:rw @envTaintComment(owner: string, repo: string, number: number, comment: string) = `{"id": 1, "body": "@comment"}`

/var tools @envTaintTools = {
  read:    { mlld: @envTaintRead, labels: ["untrusted"] },
  comment: { mlld: @envTaintComment, labels: ["publishes"] }
}

/exe @envTaintAgent(tools, task) = env with { tools: @tools } [
  let @issue = @envTaintRead("mlld-lang", "mlld", 1)
  => @issue
]

/var @envTaintIssue = @envTaintAgent(@envTaintTools, "triage")
/show @envTaintIssue.mx.taint.includes("untrusted")
/show @envTaintIssue.mx.taint.includes("net:r")

/var @envTaintDerived = `derived: @envTaintIssue`
/var @envTaintDerivedTaint = @envTaintDerived.mx.taint
/show @envTaintDerivedTaint.includes("untrusted")
/show @envTaintDerivedTaint.includes("net:r")

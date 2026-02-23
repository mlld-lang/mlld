/var @guardDenyPolicyConfig = {
  defaults: { rules: ["untrusted-llms-get-influenced"] }
}
/policy @guardDenyPolicy = union(@guardDenyPolicyConfig)

/exe net:r @guardDenyGetIssue(owner: string, repo: string, number: number) = `{"number": @number, "title": "Fix bug"}`

/var tools @guardDenyTools = {
  read: { mlld: @guardDenyGetIssue, labels: ["untrusted"] }
}

/exe @guardDenyReadIssue(tools) = env with { tools: @tools } [
  let @issue = @guardDenyGetIssue("mlld-lang", "mlld", 1)
  => @issue
]

/var @guardDenyIssue = @guardDenyReadIssue(@guardDenyTools)
/show @guardDenyIssue.mx.taint.includes("untrusted")

/exe llm @guardDenyAgent(data) = run cmd { printf "@data" }

/guard before publishes = when [
  @mx.taint.includes("untrusted") && !@mx.tools.calls.includes("verify")
    => deny "Must verify before publishing"
  * => allow
]

/exe publishes @guardDenyPublish(data) = when [
  denied => `BLOCKED: @mx.guard.reason`
  * => `published: @data`
]

/var @guardDenyProcessed = @guardDenyAgent(@guardDenyIssue)
/var @guardDenyProcessedLabels = @guardDenyProcessed.mx.labels
/show @guardDenyProcessedLabels.includes("influenced")
/show @guardDenyProcessed.mx.taint.includes("untrusted")

/var @guardDenyResult = @guardDenyPublish(@guardDenyProcessed)
/show @guardDenyResult

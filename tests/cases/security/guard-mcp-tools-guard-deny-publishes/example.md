/var @guardDenyPolicyConfig = {
  defaults: { rules: ["untrusted-llms-get-influenced"] }
}
/policy @guardDenyPolicy = union(@guardDenyPolicyConfig)

/exe net:r,untrusted @guardDenyGetIssue(owner: string, repo: string, number: number) = `{"number": @number, "title": "Fix bug"}`

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

/var @guardDenyIssue = @guardDenyGetIssue("mlld-lang", "mlld", 1)
/show @guardDenyIssue.mx.taint.includes("untrusted")

/var @guardDenyProcessed = @guardDenyAgent(@guardDenyIssue)
/var @guardDenyProcessedLabels = @guardDenyProcessed.mx.labels
/show @guardDenyProcessedLabels.includes("influenced")
/show @guardDenyProcessed.mx.taint.includes("untrusted")

/var @guardDenyResult = @guardDenyPublish(@guardDenyProcessed)
/show @guardDenyResult

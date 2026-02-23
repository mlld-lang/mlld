/exe net:r,untrusted @verifyGateGetIssue(number: number) = `{"number":@number,"title":"Bug report"}`
/exe @verifyGateVerify(data) = `verified: @data`

/guard before publishes = when [
  @mx.taint.includes("untrusted") && !@mx.tools.calls.includes("verifyGateVerify")
    => deny "Must call verify before publishing"
  * => allow
]

/exe publishes @verifyGatePublish(data) = when [
  denied => `BLOCKED: @mx.guard.reason`
  * => `published: @data`
]

/var @verifyGateIssue = @verifyGateGetIssue(42)

/show @mx.tools.calls.includes("verifyGateGetIssue")
/show @mx.tools.calls.includes("verifyGateVerify")

/var @verifyGateBlockedResult = @verifyGatePublish(@verifyGateIssue)
/show @verifyGateBlockedResult

/var @verifyGateChecked = @verifyGateVerify(@verifyGateIssue)
/show @mx.tools.calls.includes("verifyGateVerify")

/var @verifyGateAllowedResult = @verifyGatePublish(@verifyGateIssue)
/show @verifyGateAllowedResult

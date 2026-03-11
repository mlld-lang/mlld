/var @airlockCompPolicyConfig = {
  defaults: { rules: ["untrusted-llms-get-influenced"] }
}
/policy @airlockCompPolicy = union(@airlockCompPolicyConfig)

/exe net:r @airlockCompSearch(query: string) = `{"results":["tainted data"]}`
/exe net:rw @airlockCompClose(number: number) = `closed: @number`

/var tools @airlockCompTools = {
  search: { mlld: @airlockCompSearch, labels: ["untrusted"] },
  close:  { mlld: @airlockCompClose, labels: ["destructive"] }
}

/guard before destructive = when [
  @mx.taint.includes("untrusted") => deny "Tainted data blocked from destructive"
  * => allow
]

/exe destructive @airlockCompTryClose(data) = when [
  denied => `GUARD BLOCKED: @mx.guard.reason`
  * => `closed with: @data`
]

/exe llm @airlockCompAgent(tools, task) = box with { tools: @tools } [
  let @results = @airlockCompSearch(@task)
  => @results
]

/var @airlockCompAgentOutput = @airlockCompAgent(@airlockCompTools, "find issues")

/show @airlockCompAgentOutput.mx.taint.includes("untrusted")
/show @airlockCompAgentOutput.mx.taint.includes("net:r")

/var @airlockCompBlocked = @airlockCompTryClose(@airlockCompAgentOutput)
/show @airlockCompBlocked

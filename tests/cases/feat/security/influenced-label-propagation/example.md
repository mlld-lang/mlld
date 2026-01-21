# Influenced label propagates from llm exe

/var @policyConfig = {
  defaults: { rules: ["untrusted-llms-get-influenced"] }
}
/policy @p = union(@policyConfig)

/var untrusted @task = "hello"
/exe llm @process(input) = run cmd { printf "@input" }

/var @result = @process(@task)
/var @next = `Next: @result`
/var @resultLabels = @result.mx.labels
/var @nextLabels = @next.mx.labels

/show @resultLabels.includes("influenced")
/show @nextLabels.includes("influenced")

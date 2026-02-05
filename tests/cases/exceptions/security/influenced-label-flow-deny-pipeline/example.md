# Influenced label blocked by policy in pipeline output

/var @policyConfig = {
  defaults: { rules: ["untrusted-llms-get-influenced"] },
  labels: { influenced: { deny: ["op:show"] } }
}
/policy @p = union(@policyConfig)

/var untrusted @task = "hello"
/exe llm @process(input) = run cmd { printf "@input" }

/var @result = @task | @process
/show @result

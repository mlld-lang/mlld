/var @airlockInfluencedPolicyConfig = {
  defaults: { rules: ["untrusted-llms-get-influenced"] }
}
/policy @airlockInfluencedPolicy = union(@airlockInfluencedPolicyConfig)

/var untrusted @airlockInfluencedData = "adversarial content with injection"

/exe llm @airlockInfluencedExtract(content) = run cmd { printf "actions: review, close" }
/exe llm @airlockInfluencedDecide(actions, policy) = run cmd { printf "SAFE" }

/var @airlockInfluencedActions = @airlockInfluencedExtract(@airlockInfluencedData)
/var @airlockInfluencedActionsLabels = @airlockInfluencedActions.mx.labels
/var @airlockInfluencedActionsTaint = @airlockInfluencedActions.mx.taint
/show @airlockInfluencedActionsLabels.includes("influenced")
/show @airlockInfluencedActionsTaint.includes("untrusted")

/var @airlockInfluencedVerdict = @airlockInfluencedDecide(@airlockInfluencedActions, "only safe actions")
/var @airlockInfluencedVerdictLabels = @airlockInfluencedVerdict.mx.labels
/var @airlockInfluencedVerdictTaint = @airlockInfluencedVerdict.mx.taint
/show @airlockInfluencedVerdictLabels.includes("influenced")
/show @airlockInfluencedVerdictTaint.includes("untrusted")

# Policy deny blocks run js

/var @policyConfig = {
  capabilities: {
    deny: ["js"]
  }
}

/policy @p = union(@policyConfig)

/run js { return 1 }

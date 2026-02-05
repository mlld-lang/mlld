# Policy deny blocks js exec invocation

/var @policyConfig = {
  capabilities: {
    deny: ["js"]
  }
}

/policy @p = union(@policyConfig)

/exe @calc() = js { return 1 }

/var @result = @calc()

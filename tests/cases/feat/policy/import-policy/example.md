# Policy import applies to context

/import policy @prod from "./policy.mld"

/var @first = @ctx.policy.activePolicies[0]
/show @first
/show @ctx.policy.configs.allow.cmd

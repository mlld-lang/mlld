# Policy union merges allow intersection and deny union

/import policy @p1 from "./policy-one.mld"
/import policy @p2 from "./policy-two.mld"

/show @ctx.policy.configs.allow.cmd
/show @ctx.policy.configs.deny.cmd
/show @ctx.policy.configs.limits.timeout
/show @ctx.policy.activePolicies

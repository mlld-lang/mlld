# Policy union merges allow intersection and deny union

/import policy @p1 from "./policy-one.mld"
/import policy @p2 from "./policy-two.mld"

/show @mx.policy.configs.allow.cmd
/show @mx.policy.configs.deny.cmd
/show @mx.policy.configs.limits.timeout
/show @mx.policy.activePolicies

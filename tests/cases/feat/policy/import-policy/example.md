# Policy import applies to context

/import policy @prod from "./policy.mld"

/var @first = @mx.policy.activePolicies[0]
/show @first
/show @mx.policy.configs.allow.cmd

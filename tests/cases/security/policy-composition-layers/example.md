# Multi-layer policy composition
# Demonstrates: allow intersection, deny union, limit minimums

/import policy @team from "./layer-team-policy.mld"
/import policy @project from "./layer-project-policy.mld"
/import policy @local from "./layer-local-override.mld"

/show @mx.policy.configs.allow.cmd
/show @mx.policy.configs.deny.cmd
/show @mx.policy.configs.limits.timeout
/show @mx.policy.activePolicies

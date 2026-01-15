# Wants respects policy deny

/var @denyShell = { deny: { sh: true } }
/policy @p = union(@denyShell)

/wants [
  { tier: "full", sh },
  { tier: "readonly" }
]

/show @mx.policy.tier

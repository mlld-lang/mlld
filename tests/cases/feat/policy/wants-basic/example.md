# Wants Tier Test

/wants [
  {
    tier: "full",
    why: "Full capabilities",
    cmd: [echo],
    network,
    sh
  },
  {
    tier: "fallback",
    why: "Unused when full is granted",
    cmd: [echo]
  }
]

/show @mx.policy.tier

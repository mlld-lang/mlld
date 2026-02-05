# Multi-layer policy composition
# Demonstrates: allow intersection, deny union, limit minimums

[
  "git:*",
  "echo"
]
[
  "rm:*",
  "curl:*"
]
5000
[
  "team",
  "project",
  "local"
]

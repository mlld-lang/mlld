/var @full = { tools: ["Bash", "Read", "Write"] }
/box @full with { tools: ["Read"] } [
  run cmd { echo "blocked" }
]

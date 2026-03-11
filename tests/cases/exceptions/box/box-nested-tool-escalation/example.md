/box with { tools: ["Read"] } [
  box with { tools: ["Read", "Bash"] } [
    run cmd { echo "should fail" }
  ]
]

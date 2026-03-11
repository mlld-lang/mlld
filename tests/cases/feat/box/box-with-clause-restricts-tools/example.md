/box [
  show "outer-ok"
  run cmd { echo "bash-works" }
  box with { tools: ["Read"] } [
    show "inner-read-ok"
  ]
]

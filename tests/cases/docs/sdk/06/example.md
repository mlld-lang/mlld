/guard before op:output = when [
  @mx.op.target.startsWith('state://') &&
  @input.mx.labels.includes('secret') =>
    deny "Secrets cannot be persisted to state"
  * => allow
]
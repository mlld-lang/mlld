/guard before op:output = when [
  @ctx.op.target.startsWith('state://') &&
  @input.ctx.labels.includes('secret') =>
    deny "Secrets cannot be persisted to state"
  * => allow
]
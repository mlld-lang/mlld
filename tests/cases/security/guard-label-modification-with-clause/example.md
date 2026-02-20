# Guard label modifications with add/remove syntax

/guard privileged @bless after op:exe = when [
  * => allow with { addLabels: ["trusted"], removeLabels: ["untrusted"] }
]

/exe @emit() = [
  => untrusted "payload"
]

/var @value = @emit()
/var @valueCtx = @value.mx
/show `value has trusted: @valueCtx.taint.includes("trusted")`
/show `value has untrusted: @valueCtx.taint.includes("untrusted")`

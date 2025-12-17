/var secret @token = "abc123"

/exe @emitToken(value) = run { printf "Token: @value" }
/exe @echoValue(value) = run { printf "@value" }
/exe @markDone(value) = js {
  return `${value} :: done`;
}

/var @pipelineOutput = @token | @emitToken | @echoValue | @markDone

/var @pipelineCtx = @pipelineOutput.mx
/show `Pipeline taint: @pipelineCtx.taint`
/show `Pipeline labels: @pipelineCtx.labels`

/exe @emitTokenOne(value) = run { printf "Token: @value" }

/var @result = @emitTokenOne(@token)

/var @resultCtx = @result.mx
/show `Result taint: @resultCtx.taint`
/show `Result labels: @resultCtx.labels`

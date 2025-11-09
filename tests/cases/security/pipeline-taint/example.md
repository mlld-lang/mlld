/var secret @token = "abc123"

/var @pipelineOutput = /run sh {
  echo @token
} | /run {
  cat
} | /run {
  python -c "print('done')"
}

/show `Pipeline taint: @pipelineOutput.ctx.taint`
/show `Pipeline labels: @pipelineOutput.ctx.labels`

/exe @emitToken(token) = run {
  printf "Token: @token"
}

/var @result = @emitToken(@token)

/show `Result taint: @result.ctx.taint`
/show `Result labels: @result.ctx.labels`

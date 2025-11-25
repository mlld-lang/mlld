# Security labels on loaded files

/var secret @file = <secret.txt>

/show `Labels: @file.ctx.labels`

/exe @jsCheck(value) = js {
  return JSON.stringify({
    ctxLabels: value.ctx?.labels,
    dataType: typeof value.data
  });
}

/show @jsCheck(@file.keep)

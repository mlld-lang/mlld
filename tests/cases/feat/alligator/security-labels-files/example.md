# Security labels on loaded files

/var secret @file = <secret.txt>

/show `Labels: @file.mx.labels`

/exe @jsCheck(value) = js {
  return JSON.stringify({
    mxLabels: value.mx?.labels,
    dataType: typeof value.data
  });
}

/show @jsCheck(@file.keep)

/exe network @flaky(value) = when [
  @pipeline.try == 1 => retry
  * => `flaky:@value`
]

/exe @report(value) = `tries:@pipeline.try final:@pipeline[-1].mx.labels`

/var secret @seed = "  retry-label  "
/var @summary = @seed.trim() | @flaky | @report
/show @summary

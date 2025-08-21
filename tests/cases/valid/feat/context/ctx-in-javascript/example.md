/exe @checkContext() = js {
  return `Try: ${ctx.try}, Pipeline: ${ctx.isPipeline}, Stage: ${ctx.stage}`;
}
/show @checkContext()
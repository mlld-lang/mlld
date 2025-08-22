/var @test_ctx = { 
  try: 5, 
  hint: "override hint",
  isPipeline: true 
}

/exe @checkOverride() = js {
  return `Try: ${ctx.try}, Hint: ${ctx.hint}, Pipeline: ${ctx.isPipeline}`;
}

/show @checkOverride()
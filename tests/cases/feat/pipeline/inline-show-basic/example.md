# Pipeline Inline Show (Basic)

/exe @gen() = js { return "Howdy"; }

/var @out = @gen() with { pipeline: [ show @ctx.input ] }

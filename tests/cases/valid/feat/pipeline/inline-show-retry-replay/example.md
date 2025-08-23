# Pipeline Inline Show (Retry Replay)

/exe @source() = js { return "v" + ctx.try; }

/exe @validator(input) = js {
  if (ctx.try < 3) return "retry";
  return input;
}

/var @result = @source() with { pipeline: [ show @ctx.input, @validator ] }

/show "Final: @result"

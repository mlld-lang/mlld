# Pipeline Inline Show (Retry Replay)

/exe @source() = js { return "v" + mx.try; }

/exe @validator(input) = js {
  if (mx.try < 3) return "retry";
  return input;
}

/var @result = @source() with { pipeline: [ show, @validator ] }

/show "Final: @result"

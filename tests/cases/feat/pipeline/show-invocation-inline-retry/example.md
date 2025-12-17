# Show Invocation Inline Effects (Retry Replay)

/exe @source() = js { return "v" + mx.try }

/exe @validator(input) = js {
  if (mx.try < 3) return "retry";
  return input;
}

# Effects in the pipeline should emit each attempt, even with retry (with-clause)
/show @source() with { pipeline: [ show, @validator ] }

# And the shorthand pipe syntax should behave identically
/show @source() | show | @validator

/show "Final"

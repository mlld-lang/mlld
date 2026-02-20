/exe @source() = js {
  globalThis.__counter = (globalThis.__counter || 0) + 1;
  return { iteration: globalThis.__counter };
}

/exe @validator(input, pipeline) = when [
  @input.iteration == 999 => @input
  @pipeline.try < 3 => retry
  * => @input
]

/var @result = @source() | show "iteration: @input.iteration" | @validator(@p)

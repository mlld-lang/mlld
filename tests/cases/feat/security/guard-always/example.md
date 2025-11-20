# Guard Always

/guard always @tagOutput for op:exe = when [
  * => allow @tagValue(@ctx.guard.timing, @output, @input)
]

/exe @tagValue(timing, value, input) = js {
  const base = value ?? input ?? '';
  if (timing === 'before') return `before:${base}`;
  return `after:${base}`;
}

/exe @emit(value) = js { return value; }

/show @emit("start")

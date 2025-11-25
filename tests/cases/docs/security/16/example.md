/guard @tag always op:exe = when [
  * => allow @tagValue(@ctx.guard.timing, @output, @input)
]

/exe @tagValue(timing, out, in) = js {
  const val = out ?? in ?? '';
  return `${timing}:${val}`;
}

/exe @emit(v) = js { return v; }
/show @emit("test")                        # Output: after:before:test
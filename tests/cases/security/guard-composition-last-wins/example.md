# Guard composition: before last-wins, always timing, after chaining

/exe @tagPhase(timing, output, input) = js {
  const base = output ?? input ?? '';
  if (timing === 'before') return `always-before:${base}`;
  return `always-after:${base}`;
}

/guard before @first for op:exe = when [
  * => allow "first"
]

/guard before @second for op:exe = when [
  * => allow "second"
]

/guard always @alwaysTag for op:exe = when [
  * => allow @tagPhase(@mx.guard.timing, @output, @input)
]

/guard after @afterOne for op:exe = when [
  * => allow `after1:@output`
]

/guard after @afterTwo for op:exe = when [
  * => allow `after2:@output`
]

/exe @emit(value) = js { return value; }

/show @emit("raw")

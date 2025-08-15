>> Stage 1 - returns the input
/exe @stage1(item) = js {
  console.error(`[Stage1] Processing: ${item}`);
  return item;
}

>> Stage 2 - simulates retries then success
/exe @stage2(value, p) = js {
  console.error(`[Stage2] Attempt ${p.try} for: ${value}`);
  if (p.try < 3) {
    console.error(`[Stage2] Retrying...`);
    return "retry";
  }
  console.error(`[Stage2] Success!`);
  return `success-${value}`;
}

>> Pipeline function with retry
/exe @process(item) = @stage1(@item) | @stage2(@p)

>> Test it
/var @result = @process("test")
/show "Result after retries: @result"
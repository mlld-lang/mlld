/exe @stage1(item) = js {
  console.error(`[Stage1] Processing: ${item}`);
  return `s1-${item}`;
}

/exe @stage2(value) = js {
  console.error(`[Stage2] Processing: ${value}`);
  return `s2-${value}`;
}

/exe @stage3(value) = js {
  console.error(`[Stage3] Processing: ${value}`);
  return `s3-${value}`;
}

>> This should create a function that pipes through all three stages
/exe @process(item) = @stage1(@item) | @stage2 | @stage3

>> Test direct invocation
/var @result = @process("apple")
/show "Direct result: @result"

>> Test in for loop
/var @items = ["banana", "cherry"]
/var @loop_results = for @item in @items => @process(@item)
/for @loop_result in @loop_results => show "Loop result: @loop_result"
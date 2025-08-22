/exe @successMessage() = js {
  return `Succeeded on try ${ctx.try}. History: ${ctx.tries.length} attempts`;
}

/exe @retryTwice() = when first [
  @ctx.try == 1 => retry "First fail"
  @ctx.try == 2 => retry "Second fail"
  * => @successMessage()
]

/show @retryTwice()
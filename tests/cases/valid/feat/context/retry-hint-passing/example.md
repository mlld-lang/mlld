/exe @generateData() = when first [
  @ctx.try == 1 => { temperature: 105, content: "No title" }
  @ctx.try == 2 => { title: "Document", temperature: 105, content: "Added title" }
  * => { temperature: 85, title: "Document", content: "Adjusted" }
]

/exe @formatOutput() = "Valid document: @ctx.input.title (temp: @ctx.input.temperature)"

/exe @validator() = when first [
  !@ctx.input.title => retry
  @ctx.input.temperature > 100 => retry
  * => @formatOutput()
]

/var @result = @generateData() | @validator
/show @result
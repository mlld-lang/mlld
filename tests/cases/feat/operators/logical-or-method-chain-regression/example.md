/var @model = "sonnet"

/show `direct: @model.includes("gpt")`
/var @result = @model.includes("gpt") || @model.includes("o1") || @model.includes("o3")
/var @provider = when [
  @result => "openai"
  * => "anthropic"
]

/show `chained: @result`
/show `provider: @provider`

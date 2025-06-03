# Pipeline Basic Test

@exec uppercase(text) = @run [(echo "$@text" | tr '[:lower:]' '[:upper:]')]
@exec addPrefix(text) = @run [(echo "PREFIX: $@text")]

@run [(echo "hello world")] with {
  pipeline: [@uppercase, @addPrefix]
}

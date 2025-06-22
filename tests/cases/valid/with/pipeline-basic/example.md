# Pipeline Basic Test

/exec @uppercase(text) = {echo "@text" | tr '[:lower:]' '[:upper:]'}
/exec @addPrefix(text) = {echo "PREFIX: @text"}

/run {echo "hello world"} with {
  pipeline: [@uppercase, @addPrefix]
}

# Pipeline Basic Test

/exe @uppercase(text) = {echo "@text" | tr '[:lower:]' '[:upper:]'}
/exe @addPrefix(text) = {echo "PREFIX: @text"}

/run {echo "hello world"} with {
pipeline: [@uppercase, @addPrefix]
}

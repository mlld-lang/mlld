# Pipeline Basic Test

/exe @uppercase(text) = cmd {echo "@text" | tr '[:lower:]' '[:upper:]'}
/exe @addPrefix(text) = cmd {echo "PREFIX: @text"}

/run {echo "hello world"} with {
pipeline: [@uppercase, @addPrefix]
}

# Pipeline with @INPUT Test

@exec trim() = @run [echo "@INPUT" | xargs]
@exec count() = @run [echo "@INPUT" | wc -w | xargs]
@exec format() = @run [echo "Word count: @INPUT"]

@run [echo "  hello   world  "] with {
  pipeline: [@trim, @count, @format]
}

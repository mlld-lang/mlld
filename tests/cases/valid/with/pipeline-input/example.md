# Pipeline with @INPUT Test

/exec @trim() = {echo "@INPUT" | xargs}
/exec @count() = {echo "@INPUT" | wc -w | xargs}
/exec @format() = {echo "Word count: @INPUT"}

/run {echo "  hello   world  "} with {
  pipeline: [@trim, @count, @format]
}

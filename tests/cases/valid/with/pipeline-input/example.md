# Pipeline with @INPUT Test

/exe @trim() = {echo "@INPUT" | xargs}
/exe @count() = {echo "@INPUT" | wc -w | xargs}
/exe @format() = {echo "Word count: @INPUT"}

/run {echo "  hello   world  "} with {
pipeline: [@trim, @count, @format]
}

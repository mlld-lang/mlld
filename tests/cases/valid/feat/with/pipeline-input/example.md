# Pipeline with @input Test

/exe @trim() = {echo "@input" | xargs}
/exe @count() = {echo "@input" | wc -w | xargs}
/exe @format() = {echo "Word count: @input"}

/run {echo "  hello   world  "} with {
pipeline: [@trim, @count, @format]
}

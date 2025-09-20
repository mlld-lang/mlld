# Pipeline with @input Test

/exe @trim() = {echo "@input" | awk '{$1=$1; print $0}'}
/exe @count() = {echo "@input" | wc -w | awk '{print $1}'}
/exe @format() = {printf "Word count: %s\n" "@input"}

/run {echo "  hello   world  "} with {
pipeline: [@trim, @count, @format]
}

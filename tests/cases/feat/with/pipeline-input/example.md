# Pipeline with @input Test

/exe @trim() = cmd {echo "@input" | awk '{$1=$1; print $0}'}
/exe @count() = cmd {echo "@input" | wc -w | awk '{print $1}'}
/exe @format() = cmd {printf "Word count: %s\n" "@input"}

/run {echo "  hello   world  "} with {
pipeline: [@trim, @count, @format]
}

# Pipeline Termination Test

/exe @filter() = {grep "ERROR" | cat}
/exe @uppercase() = {tr '[:lower:]' '[:upper:]'}

/run {echo "no errors here"} with {
pipeline: [@filter, @uppercase]
}

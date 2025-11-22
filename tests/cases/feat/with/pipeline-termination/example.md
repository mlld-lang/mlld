# Pipeline Termination Test

/exe @filter() = cmd {grep "ERROR" | cat}
/exe @uppercase() = cmd {tr '[:lower:]' '[:upper:]'}

/run {echo "no errors here"} with {
pipeline: [@filter, @uppercase]
}

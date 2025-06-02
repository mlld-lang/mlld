# Pipeline Termination Test

@exec filter() = @run [grep "ERROR" || echo ""]
@exec uppercase() = @run [tr '[:lower:]' '[:upper:]']

@run [echo "no errors here"] with {
  pipeline: [@filter, @uppercase]
}

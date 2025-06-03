# Pipeline Termination Test

@exec filter(text) = @run [echo "@text" | grep "ERROR" || echo ""]
@exec uppercase(text) = @run [echo "@text" | tr '[:lower:]' '[:upper:]']

@run [echo "no errors here"] with {
  pipeline: [@filter, @uppercase]
}

# Pipeline Termination Test

@exec filter() = [(grep "ERROR" | cat)]
@exec uppercase() = [(tr '[:lower:]' '[:upper:]')]

@run [(echo "no errors here")] with {
  pipeline: [@filter, @uppercase]
}

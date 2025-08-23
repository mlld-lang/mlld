# Pipeline Inline Output (File)

/exe @gen() = js { return "DATA"; }

/var @_ = @gen() with { pipeline: [ output to "inline-file.txt" ] }

/show </tmp-tests/inline-file.txt>

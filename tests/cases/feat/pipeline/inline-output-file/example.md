# Pipeline Inline Output (File)

/exe @gen() = js { return "DATA"; }

@gen() with { pipeline: [ output to "inline-file.txt" ] }

/show <@base/inline-file.txt>

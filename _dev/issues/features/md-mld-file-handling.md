The standard meld extension is `.mld` with `.md` allowed as well. (We should make sure this is the case in code)

We support interpreting .md files as meld files but there's nuance there:

- If a `.md` file is passed to the cli or api for interpretation, like `meld mymarkdown.md` we treat it like a meld file, BUT we default to outputting it as `mymarkdown.o.md` so that it doesn't default to overwriting the original file (the user can still set a different path they want to output to)
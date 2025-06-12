@data sections = ["tldr", "details", "examples"]
@text extractSection(name) = [[content from @name section]]
@add foreach @extractSection(@sections)
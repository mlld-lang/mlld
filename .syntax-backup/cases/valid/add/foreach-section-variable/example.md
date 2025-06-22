@data sections = ["tldr", "details", "examples"]
@exec extractSection(name) = [[content from {{name}} section]]
@add foreach @extractSection(@sections)
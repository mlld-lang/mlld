/var @count = @state.count + 1
/output @count to "state://count"

/var @prefs = { theme: "dark", lang: "en" }
/output @prefs to "state://preferences"
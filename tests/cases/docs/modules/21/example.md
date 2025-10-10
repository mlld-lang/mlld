---
name: text-utils
about: String manipulation utilities
---

/exe @uppercase(text) = run {echo "@text" | tr a-z A-Z}
/exe @trim(text) = js { return @text.trim() }
/export { @uppercase, @trim }
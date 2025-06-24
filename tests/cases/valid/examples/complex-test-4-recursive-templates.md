# Complex Test 4: Recursive Templates and Variable References

/text @name = "Recursive Test"
/text @version = "1.0.0"
/text @current_date = run {date +%Y-%m-%d}

# Template that references another template
/text @header_template = [[
===================================
{{name}} v{{version}}
===================================]]

/exec @section_template(title, content) = @add [[
{{header_template}}

## {{title}}

{{content}}

Generated at: {{current_date}}
]]

# Data with template references
/data @doc_sections = {
  "intro": {
    "title": "Introduction",
    "content": "This tests recursive template expansion with {{name}}"
  },
  "features": {
    "title": "Features",
    "content": "Version {{version}} includes:\n- Nested templates\n- Variable interpolation\n- Data references"
  }
}

# Complex nested template usage
/text @full_doc = [[
{{header_template}}

# Documentation for {{name}}

/run @section_template(@doc_sections.intro.title, @doc_sections.intro.content)

/run @section_template(@doc_sections.features.title, @doc_sections.features.content)

## Summary

This document demonstrates:
- Header: Uses {{header_template}}
- Sections: Generated with section_template
- Data: Pulled from {{doc_sections}}
]]

/add @full_doc
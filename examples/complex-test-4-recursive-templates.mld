# Complex Test 4: Recursive Templates and Variable References

/var @name = "Recursive Test"
/var @version = "1.0.0"
/var @current_date = run {date +%Y-%m-%d}

# Template that references another template
/var @header_template = ::
===================================
{{name}} v{{version}}
===================================::

/exe @section_template(title, content) = @add ::
{{header_template}}

## {{title}}

{{content}}

Generated at: {{current_date}}
::

# Data with template references
/var @doc_sections = {
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
/var @full_doc = ::
{{header_template}}

# Documentation for {{name}}

/run @section_template(@doc_sections.intro.title, @doc_sections.intro.content)

/run @section_template(@doc_sections.features.title, @doc_sections.features.content)

## Summary

This document demonstrates:
- Header: Uses {{header_template}}
- Sections: Generated with section_template
- Data: Pulled from {{doc_sections}}
::

/show @full_doc
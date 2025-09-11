/var @names = ["Ann","Ben"]
/exe @greet(n) = `Hello @n`
/show foreach @greet(@names) with { separator: " | ", template: "{{index}}={{result}}" }
# Output: 0=Hello Ann | 1=Hello Ben
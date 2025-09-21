## For loop with when and none

/var @items = [
  { type: "file", name: "readme.md" },
  { type: "dir", name: "src" },
  { type: "file", name: "package.json" },
  { type: "link", name: "dist" }
]

>> Define exe function to process items with none fallback
/exe @processItem(item) = when first [
  @item.type == "file" => `📄 @item.name`
  @item.type == "dir" => `📁 @item.name`
  none => `❓ @item.name (unknown type)`
]

>> Process items with none fallback for unknown types
/for @item in @items => show @processItem(@item)

>> Collection form with none - using exe function
/var @scores = [85, 45, 92, 30, 75]
/exe @gradeScore(score) = when first [
  @score >= 90 => "A"
  @score >= 80 => "B"
  @score >= 70 => "C"
  @score >= 60 => "D"
  none => "F"
]
/var @grades = for @score in @scores => @gradeScore(@score)

/show `Grades: @grades`
/var @name = "Ada"
/var @title = ""

/var @person = {
  "name": @name,
  "title"?: @title
}
/show @person
>> {"name": "Ada"} - title was omitted because @title is falsy
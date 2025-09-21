# Wildcard (*) in exe when expressions

## Define function with wildcard default
/exe @handler(input) = when first [
  @input == "hello" => "Hi there!"
  @input == "bye" => "Goodbye!"
  * => "Default response"
]

## Test the function
/show @handler("hello")
/show @handler("bye")
/show @handler("unknown")

## Wildcard as first condition (catch-all)
/exe @alwaysDefault() = when first [
  * => "Always returns this"
  true => "Never reached"
  false => "Also never reached"
]

/show @alwaysDefault()
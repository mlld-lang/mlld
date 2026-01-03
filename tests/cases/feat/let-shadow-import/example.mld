# Let bindings can shadow imported variables

Test that let bindings inside exe blocks can shadow imported variables.

## Import a variable
/import { @items } from "lib.mld"

/show "Imported items:"
/show @items

## Define exe that shadows the imported variable
/exe @process() = [
  let @items = ["local1", "local2", "local3"]
  => @items
]

/show "Local items in exe:"
/show @process()

/show "Original imported items still accessible:"
/show @items

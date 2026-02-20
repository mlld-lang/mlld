No slash needed on the right side of for loops

Found: for @${VAR} in ${COLLECTION} => ${ACTION}

The slash (/) is only for starting directive lines. Once you're in a for loop's action (after =>), you're already in mlld context and don't need the slash.

✗ Wrong: for @${VAR} in ${COLLECTION} => ${ACTION}
✓ Right: for @${VAR} in ${COLLECTION} => ${FIXED_ACTION}

More examples:
✗ Wrong: for @file in @files => show @file.name
✓ Right: for @file in @files => show @file.name

✗ Wrong: for @i in [1, 2, 3] => output @i to "file.txt"
✓ Right: for @i in [1, 2, 3] => output @i to "file.txt"

The slash means "start interpreting this line as mlld". Once you're already in an mlld directive, you don't need to re-enter mlld mode.
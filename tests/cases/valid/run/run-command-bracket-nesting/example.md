# Test: Bracket Nesting in Shell Commands

Test shell commands with bracket conditions that should not terminate parsing.

@run [(
if [ ! -d "/tmp/test" ]
then
  mkdir -p "/tmp/test"
  echo "Created directory"
fi
echo "Directory check complete"
)]

@exec complex_shell(dir) = [(
if [ ! -d "@dir" ]
then
  echo "Error: @dir is not a directory"
  return 1
fi
echo "Processing directory: @dir"
ls "@dir" | head -5
)]

@run @complex_shell(/tmp)
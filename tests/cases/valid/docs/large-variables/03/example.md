>> Simple run - limited to ~128KB, uses @var syntax
/run {tool "@data"}

>> Shell mode - handles any size, pass params then use $var syntax
/run sh (@data) { echo "$data" | tool }
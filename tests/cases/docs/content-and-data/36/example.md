>> ✗ Using {{}} in ::...::
/var @msg = ::Hello {{name}}::        >> {{name}} is literal
/var @msg = ::Hello @name::           >> ✓

>> ✗ Using @var in :::...:::
/var @msg = :::Hello @name:::         >> @name is literal
/var @msg = :::Hello {{name}}:::      >> ✓

>> ✗ Using ::: without Discord/social need
/var @msg = :::Status: {{status}}:::  >> Loses all features
/var @msg = ::Status: @status::       >> ✓ Full features

>> ✗ Importing template files
/import { @tpl } from "./file.att"    >> Error
/exe @tpl(x) = template "./file.att"  >> ✓
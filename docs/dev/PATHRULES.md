Simple paths (no slashes):
  file.meld                    ✓ Valid - current directory

Path variables:
  $HOMEPATH (or $~)           ✓ Built-in special variable
  $PROJECTPATH (or $.)        ✓ Built-in special variable
  
@path definitions:
  @path mypath = "$~/foo"     ✓ Valid - rooted in $HOMEPATH
  @path mypath = "$./foo"     ✓ Valid - rooted in $PROJECTPATH
  @path mypath = "/foo"       ✗ Invalid - not rooted in special var
  
Using paths with slashes:
  @import [$mypath/file.meld] ✓ Valid - uses path variable
  @import [foo/file.meld]     ✗ Invalid - has slash but no path var
/var @currentDir = run {pwd}
/show `Current directory: @currentDir`

/run {echo "Running a quick check..."}
/var @files = run {ls -la | head -5}
/show @files
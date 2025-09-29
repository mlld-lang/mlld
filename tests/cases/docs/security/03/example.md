/run {echo "Hello"}              >> Safe: simple command
/run {ls -la | grep ".md"}       >> Safe: pipes allowed
/run {echo "test" && rm -rf /}   >> Blocked: && not allowed
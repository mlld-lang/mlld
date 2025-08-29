# Show Invocation Inline Effects (Retry Replay)

# Effects in the pipeline should emit each attempt, even with retry (with-clause)
v1
v2
v3
v3
# And the shorthand pipe syntax should behave identically
v1
v2
v3
v3
Final

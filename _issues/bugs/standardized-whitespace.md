when building this:

```
## Your role
@embed {{role.architect}}

## Documentation
@embed [$./examples/embed-content.md # Instructions]

## Your task
@embed {{task.code_review}}
```

we are currently outputting this:

```

## Your role
[directive output placeholder]
## Documentation
[directive output placeholder]
## Your task
[directive output placeholder]
```

for the sake of standardized pretty output, we want to modify our output so that there is one blank line between nodes, and we trim any empty lines at the start and end of the final document output


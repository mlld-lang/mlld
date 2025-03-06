Somehow the following:

```
@import [$./examples/example-import.meld]
@path docs = "$PROJECTPATH/docs/dev"

@data role = {
    "architect": "You are a senior architect skilled in assessing TypeScript codebases.",
    "ux": "You are a senior ux designer skilled in assessing user experience.",
    "security": "You are a senior security engineer skilled in assessing TypeScript codebases."
}

@data task = {
    "code_review": "Carefully review the code and test results and advise on the quality of the code and areas of improvement.",
    "ux_review": "Carefully review the user experience and advise on the quality of the user experience and areas of improvement.",
    "security_review": "Carefully review the security of the code and advise on the quality of the security and areas of improvement."
}

## Your role
@embed {{role.architect}}

## Documentation
### Target UX
@embed [$docs/UX.md]
### Architecture
@embed [$docs/ARCHITECTURE.md] 
### Meld Processing Pipeline
@embed [$docs/PIPELINE.md]
```
Is resulting in this error:
`File not found: examples/UX.md`

You can run this file with `meld examples/example.meld`
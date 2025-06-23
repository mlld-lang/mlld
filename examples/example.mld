>> This is a comment and should be ignored
>> I can write a couple lines of them if I want and no one will ever know.

/import { * } from "files/imports.mld"

/data @role = {
    "architect": "You are a senior architect skilled in assessing TypeScript codebases.",
    "ux": "You are a senior ux designer skilled in assessing user experience.",
    "security": "You are a senior security engineer skilled in assessing TypeScript codebases."
}

/data @task = {
    "code_review": "Carefully review the code and test results and advise on the quality of the code and areas of improvement.",
    "ux_review": "Carefully review the user experience and advise on the quality of the user experience and areas of improvement.",
    "security_review": "Carefully review the security of the code and advise on the quality of the security and areas of improvement."
}

## Your role
/add @role.architect

## Documentation
### Architecture
/add @path "./docs/dev/ARCHITECTURE.md" # TESTING INFRASTRUCTURE
### Mlld error handling
/add @path "./docs/dev/ERRORS.md"

## Test Results
/run npm test core/syntax

## Your task
/add @task.code_review

>> this doesn't work but should
>> @run @text codecat("./examples")

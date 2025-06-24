/var @imported_title = "Imported Content"

/var @role = {
    "architect": "You are a senior architect skilled in assessing TypeScript codebases.",
    "ux": "You are a senior ux designer skilled in assessing user experience.",
    "security": "You are a senior security engineer skilled in assessing TypeScript codebases."
}

/var @task = {
    "code_review": "Carefully review the code and test results and advise on the quality of the code and areas of improvement.",
    "ux_review": "Carefully review the user experience and advise on the quality of the user experience and areas of improvement.",
    "security_review": "Carefully review the security of the code and advise on the quality of the security and areas of improvement."
}

/exe @codecat(dir) = {find @dir -type f -name "*.js" -exec cat {} \;}

/exe @echo(var) = @add [[Echo: {{var}}]]
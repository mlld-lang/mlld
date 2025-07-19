/var @docs = <files/README.md>
              
/var @role = {
    "architect": "You are a software architect.",
    "security": "You are a security engineer.",
    "ux": "You are a ux designer.",
    "pm": "You are a project manager."
}

/var @task = {
    "archrev": "What's the architecture's biggest flaw?",
    "uxrev": "Review the UX of this code",
    "secrev": "Review this code for vulnerabilities",
    "roadmap": "Create a roadmap based on highest priority"
}

# command creation examples
/exe @codecat(dir) = {find @dir -type f -name "*.mld" | head -5}

/exe @ask(context, role, task) = {llm --context @context --instructions @task --system @role}
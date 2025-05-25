@text docs = @add [README.md]
              
@data role = {
    "architect": "You are a software architect.",
    "security": "You are a security engineer.",
    "ux": "You are a ux designer.",
    "pm": "You are a project manager."
}

@data task = {
    "archrev": "What's the architecture's biggest flaw?",
    "uxrev": "Review the UX of this code",
    "secrev": "Review this code for vulnerabilities",
    "roadmap": "Create a roadmap based on highest priority"
}

# command creation examples
@exec codecat(dir) = @run [find @dir -type f -name "*.mld" | head -5]

@exec ask(context, role, task) = @run [oneshot --context @context --instructions @task --system @role]
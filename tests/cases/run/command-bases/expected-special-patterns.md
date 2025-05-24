# Test special command patterns

@run [npx prettier --write .]

@run [python -m http.server 8000]

@run [node -e "console.log('Hello')"]

@run [deno run --allow-net server.ts]
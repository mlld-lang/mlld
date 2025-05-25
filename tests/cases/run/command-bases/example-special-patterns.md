# Test special command patterns

@run [echo "npx prettier --write ."]

@run [echo "python -m http.server 8000"]

@run [node -e "console.log('Hello')"]

@run [echo "deno run --allow-net server.ts"]
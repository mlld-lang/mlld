# Test npm run script detection

@run [npm run -s testecho -- "npm run build output"]

@run [npm run -s testecho -- "npm run test output"]

@run [npm run -s testecho -- "npm run dev output"]

@run [npm run -s testecho -- "npm run build:prod output"]
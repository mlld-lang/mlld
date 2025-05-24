# Test command operators

@run [ls -la | grep foo | wc -l]

@run [mkdir test && cd test && touch file.txt]

@run [rm -rf temp || echo "Already clean"]

@run [npm test; npm run build; npm run deploy]
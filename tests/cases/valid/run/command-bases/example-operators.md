# Test command operators

@run [(echo "ls -la | grep foo | wc -l")]

@run [(echo "mkdir test && cd test && touch file.txt")]

@run [(echo "rm -rf temp || Already clean")]

@run [(echo "npm test; npm run build; npm run deploy")]
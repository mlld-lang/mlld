/path @src = @./interpreter

>> Create a folder for generated docs:
/run {mkdir -p @src/docs}

>> For each .ts file in src, send it to llm asking for detailed docs:
/run {
for f in @src/**/*.ts; do
filename=$(basename "$f")
echo echo "# $filname docs" > README.md
done
}

/run {
for f in @src/**/*.ts; do 
llm \
--task "Please provide a thorough, user-friendly documentation in Markdown for this file. Include usage instructions, examples, and any important notes or edge cases." \
--file "$f" \
--output "docs/$(basename "$f").md" \
--model "gpt-4o-mini" \
--silent;
done
}

>> Get names of files

>> Finally, generate a README.md at the project level that links to all docs:
/run {echo "# Project docs" > README.md}
/run {
for f in @src/**/*.ts; do 
echo "* [$(basename "$f").md}(docs/$(basename "$f").md)" >> README.md
done
]
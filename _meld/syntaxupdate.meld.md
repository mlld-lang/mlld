Meld historically has had three kinds of variable syntax:

- text: ${variable}
- data: #{variable}
- path: $variable

Because of a desire to not conflict with JavaScript template literals, we have modified the syntax to be:

- text and data: {{variable}}
- path: $variable (same as before)

We are conducting an audit to review all the places these syntaxes need to be updated. However, because template literals are a common syntax in JavaScript, we are going to need to be careful to ensure we don't break existing code with a blunt find-and-replace.

Your task is to review each of these files and report back with which are using meld directives with the old syntax: `${textvariable}` or `#{datavariable}`

Here are the files to review:

==== FILES TO REVIEW ====

@cmd[cpai services/pipeline --stdout]

==== END FILES TO REVIEW ====

Please 
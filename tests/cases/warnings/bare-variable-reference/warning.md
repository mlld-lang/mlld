**Warning: Bare variable reference detected**

The line `This line contains a bare variable reference: @myvar` contains a variable reference outside of a directive.

mlld is a programming language embedded in Markdown, not a template language. Variable references like `@myvar` are only processed when they appear in directive lines that start with `@`.

**To fix this:**
```mlld
This line contains a variable reference:
/add @myvar
```
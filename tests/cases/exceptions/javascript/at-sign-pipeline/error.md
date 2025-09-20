Cannot use @payload syntax inside JavaScript code blocks

JavaScript blocks use regular variable names, not @ syntax:
  ✗ js { const x = @payload; }
  ✅ js { const x = payload; }

To use mlld variables in JavaScript:
1. Pass them as parameters to the function
2. Reference them by name (without @) inside the JS block

Found: const data = JSON.parse(`@payload | @json`);

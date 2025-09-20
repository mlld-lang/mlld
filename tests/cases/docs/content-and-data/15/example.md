>> Load and transform files
/var @config = <config.json> | @json
/var @uppercase = <readme.txt> | @upper

>> Chain transformations
/exe @first(text, n) = js { 
  return text.split('\n').slice(0, n).join('\n');
}
/var @summary = <docs.md> | @first(3) | @upper
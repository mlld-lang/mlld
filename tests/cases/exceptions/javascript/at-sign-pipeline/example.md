# JavaScript @ Syntax Inside Template Literal

/var @payload = { "name": "mlld" }

/exe @parse() = js {
  const data = JSON.parse(`@payload | @json`);
  return data.name;
}

/show @parse()

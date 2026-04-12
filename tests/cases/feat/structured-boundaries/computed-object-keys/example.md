/record @contact = {
  key: id,
  facts: [email: string, id: string]
}
/exe @emit() = js {
  return {
    email: "ada@example.com",
    id: "c_1"
  };
} => contact
/var @key = "selected"
/var @obj = { [@key]: @emit() }
/show @obj.selected.email.mx.labels | @json
/show @obj[@key].email.mx.factsources[0].ref

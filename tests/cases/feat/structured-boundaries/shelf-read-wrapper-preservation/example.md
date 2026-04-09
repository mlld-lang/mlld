/record @contact = {
  key: id,
  facts: [id: string, email: string],
  data: [name: string]
}
/shelf @outreach = {
  recipients: contact[]
}
/exe @emit() = js {
  return {
    id: "c_1",
    email: "ada@example.com",
    name: "Ada"
  };
} => contact
@shelve(@outreach.recipients, @emit())
/var @readBack = @shelf.read(@outreach.recipients)
/show @readBack.0.email.mx.labels | @json

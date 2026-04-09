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
/var @value = @emit()
/show @value.email.mx.labels | @json
/var @clone = { ...@value }
/show @clone.email.mx.labels | @json

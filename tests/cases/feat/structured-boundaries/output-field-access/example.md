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
/output @value.email to "structured-boundaries-output-field.txt"
/show <@base/structured-boundaries-output-field.txt>

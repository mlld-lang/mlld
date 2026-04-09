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
/exe @inspect(value) = js {
  return value.mx.labels;
}
/show @inspect(@emit().email.keep)

/policy @p = {
  defaults: { rules: ["no-untrusted-destructive"] },
  operations: { destructive: ["tool:w"] }
}

/record @transaction = {
  facts: [recipient: string],
  data: [subject: string]
}

/exe untrusted @getTransaction() = {
  recipient: "acct-1",
  subject: "Rent"
} => transaction

/exe tool:w @update(payload) = `ok`

/var @txn = @getTransaction()
/show @update(@txn)

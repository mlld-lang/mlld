/record @contact = {
  facts: [email: string],
  data: [name: string?]
}

/exe @search(query) = js {
  return [];
}

/exe @contains(input, needle) = js {
  return input.includes(needle);
}

/var tools @catalog = {
  search: {
    mlld: @search,
    returns: @contact,
    labels: ["resolve:r"],
    description: "Search contacts."
  }
}

/show @catalog | @pretty | @contains("Search contacts.")
/show @catalog | @json | @contains("Search contacts.")
/show `catalog: @catalog` | @contains("Search contacts.")
/show "done"

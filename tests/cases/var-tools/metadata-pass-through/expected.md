{
  "keyed": {
    "mlld": "send_email",
    "inputs": "send_email_inputs",
    "returns": null,
    "labels": [
      "execute:w",
      "comm:w"
    ],
    "description": "Send mail",
    "instructions": "Prefer drafts first.",
    "can_authorize": "role:planner",
    "bind": {
      "retries": 3,
      "settings": {
        "mode": "safe"
      }
    },
    "kind": null,
    "semantics": null,
    "custom_field": null
  },
  "entries": {
    "mlld": "send_email",
    "inputs": "send_email_inputs",
    "returns": null,
    "labels": [
      "execute:w",
      "comm:w"
    ],
    "description": "Send mail",
    "instructions": "Prefer drafts first.",
    "can_authorize": "role:planner",
    "bind": {
      "retries": 3,
      "settings": {
        "mode": "safe"
      }
    },
    "kind": null,
    "semantics": null,
    "custom_field": null
  }
}
{
  "keyed": {
    "mlld": "search_contacts",
    "inputs": "search_contacts_inputs",
    "returns": "contact",
    "labels": [
      "resolve:r"
    ],
    "description": "Search contacts.",
    "can_authorize": false,
    "kind": "read",
    "semantics": "Search contacts.",
    "custom_field": {
      "x": 1
    }
  },
  "entries": {
    "mlld": "search_contacts",
    "inputs": "search_contacts_inputs",
    "returns": "contact",
    "labels": [
      "resolve:r"
    ],
    "description": "Search contacts.",
    "can_authorize": false,
    "kind": "read",
    "semantics": "Search contacts.",
    "custom_field": {
      "x": 1
    }
  }
}
contact
read
Search contacts.
Search contacts.
search_contacts_inputs
1
sent:ada@example.com:hello:3:safe
found:Ada

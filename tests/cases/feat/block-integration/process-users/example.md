/exe @processUsers(users) = [
  for @user in @users [
    let @active = for @msg in @user.inbox => when [
      @msg.status == "unread" => @msg
      none => skip
    ]

    show `User @user.name: @active.length unread`
  ]
  => "done"
]

/var @users = [
  { name: "Ada", inbox: [
      { status: "unread", subject: "Hi" },
      { status: "read", subject: "Old" }
    ]
  },
  { name: "Ben", inbox: [
      { status: "unread", subject: "Ping" },
      { status: "unread", subject: "Follow-up" }
    ]
  }
]

/show @processUsers(@users)

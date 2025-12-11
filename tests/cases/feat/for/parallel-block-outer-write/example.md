# Parallel block forbids outer variable mutation

/var @shared = 0

/for parallel @item in [1, 2] [
  let @shared += @item
]

/show `shared:@shared`
/show `errors:@ctx.errors.length`
/show `firstMessage:@ctx.errors[0].message`

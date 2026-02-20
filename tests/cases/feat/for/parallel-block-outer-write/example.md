# Parallel block forbids outer variable mutation

/var @shared = 0

/for parallel @item in [1, 2] [
  if @item > 1 [
    let @shared += @item
  ]
]

/show `shared:@shared`
/show `errors:@mx.errors.length`
/show `firstMessage:@mx.errors[0].message`

/var @list = ::
/for @item in @items
- @item.name: @item.value
/end
::

>> Requirements: /for and /end at line start
>> NOT supported in :::...:::, .mtt, or "..."
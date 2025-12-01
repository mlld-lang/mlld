/var @items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

>> Test variable as end index
/var @limit = 5
/var @first5 = @items[0:@limit]
/show @first5

>> Test variable as start index
/var @start = 3
/var @from3 = @items[@start:]
/show @from3

>> Test variables in both positions
/var @end = 7
/var @middle = @items[@start:@end]
/show @middle

>> Test with computed variable
/var @offset = 2
/var @sliceEnd = 6
/var @sliced = @items[@offset:@sliceEnd]
/show @sliced

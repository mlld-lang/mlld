# Pipeline Array Indexing Test

/exe @stageA(input) = `stage-a: @input`

/exe @stageB(input) = `stage-b: @input`

/exe @stageC(input) = `stage-c: @input`

/exe @showIndexing(input) = `Input: @input
Zero: @pipeline[0]
First: @pipeline[1]
Second: @pipeline[2]
Third: @pipeline[3]
Minus-1: @pipeline[-1]
Minus-2: @pipeline[-2]
Minus-3: @pipeline[-3]
Minus-4: @pipeline[-4]`

# Test comprehensive array indexing including negative indices
/var @result = "original"|@stageA|@stageB|@stageC|@showIndexing

/show @result
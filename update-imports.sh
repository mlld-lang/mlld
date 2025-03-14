#!/bin/bash

# Update all imports from 'meld-spec' to '@core/syntax/types'
find . -type f -name "*.ts" -not -path "./meld-spec/*" -exec sed -i '' "s/from 'meld-spec'/from '@core\/syntax\/types'/g" {} +

# Update all imports from "meld-spec" to "@core/syntax/types"
find . -type f -name "*.ts" -not -path "./meld-spec/*" -exec sed -i '' 's/from "meld-spec"/from "@core\/syntax\/types"/g' {} + 
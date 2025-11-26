MlldCondition: The 'any' modifier has been removed from mlld. Use the || operator instead.

❌ Old syntax: /when any [@cond1 @cond2] => action
✅ New syntax: /when (@cond1 || @cond2) => action

The || operator is more familiar and flexible.

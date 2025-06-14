@run javascript [(Promise.resolve("Simple promise"))]

@run javascript [(async () => "Async IIFE")())]

@run javascript [(
(async () => {
  return await Promise.resolve("Multi-line async");
})()
)]
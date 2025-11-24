/run stream node {
  console.log("node first");
  await new Promise((r) => setTimeout(r, 20));
  console.log("node second");
}

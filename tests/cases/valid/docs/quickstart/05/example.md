/run sh {
  echo "Starting process..."
  npm test && echo "Tests passed!" || echo "Tests failed!"
}
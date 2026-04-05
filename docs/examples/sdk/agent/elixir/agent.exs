# File-watching agent that classifies incoming documents with mlld.
#
# Uses polling (no fsnotify dependency). For production, consider
# the FileSystem hex package or a GenServer with :fs.

script = Path.expand("../llm/process.mld", __DIR__)

File.mkdir_p!("inbox")
File.mkdir_p!("done")

{:ok, client} = Mlld.Client.start_link()

IO.puts("Watching inbox/ for new .md files. Drop a file in to classify it.")
IO.puts("Press Ctrl+C to stop.\n")

defmodule Agent.Loop do
  def run(client, script) do
    Path.wildcard("inbox/*.md")
    |> Enum.each(fn path ->
      name = Path.basename(path)
      IO.puts("Processing #{name}...")

      content = File.read!(path)

      case Mlld.Client.execute(client, script, %{"content" => content, "filename" => name},
             timeout: 60_000
           ) do
        {:ok, result} ->
          case Enum.find(result.state_writes, &(&1.path == "result")) do
            %{value: classification} ->
              stem = Path.rootname(name)
              json = Jason.encode!(classification, pretty: true)
              File.write!("done/#{stem}.result.json", json)
              IO.puts("  -> #{Jason.encode!(classification)}")

            nil ->
              :ok
          end

          File.rename!(path, "done/#{name}")

        {:error, reason} ->
          IO.puts("  Error: #{inspect(reason)}")
      end
    end)

    Process.sleep(1_000)
    run(client, script)
  end
end

Agent.Loop.run(client, script)

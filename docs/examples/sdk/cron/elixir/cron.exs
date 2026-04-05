# Scheduled digest: summarize recent git activity with mlld.

script = Path.expand("../llm/digest.mld", __DIR__)

{commits, 0} = System.cmd("git", ["log", "--oneline", "--since=yesterday"])
commits = String.trim(commits)

if commits == "" do
  IO.puts("No recent commits. Nothing to digest.")
  System.halt(0)
end

today = Date.utc_today() |> Date.to_iso8601()
line_count = commits |> String.split("\n") |> length()
IO.puts("Generating digest for #{today} (#{line_count} commits)...")

{:ok, client} = Mlld.Client.start_link()

case Mlld.Client.execute(client, script, %{"commits" => commits, "date" => today},
       timeout: 60_000
     ) do
  {:ok, result} ->
    case Enum.find(result.state_writes, &(&1.path == "digest")) do
      %{value: digest} ->
        File.mkdir_p!("digests")
        out_path = "digests/#{today}.md"
        File.write!(out_path, digest)
        IO.puts("Wrote #{out_path}\n")
        IO.puts(digest)

      nil ->
        IO.puts("No digest produced.")
    end

  {:error, reason} ->
    IO.puts(:stderr, "Error: #{inspect(reason)}")
    System.halt(1)
end

Mlld.Client.stop(client)

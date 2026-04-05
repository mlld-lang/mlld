// Scheduled digest: summarize recent git activity with mlld.

use std::collections::HashMap;
use std::fs;
use std::process::Command;
use std::time::Duration;

fn main() {
    let script_path = fs::canonicalize("../llm/digest.mld")
        .expect("could not resolve ../llm/digest.mld — run from the rust/ directory");
    let script = script_path.to_str().expect("invalid script path");

    let commits = get_recent_commits("yesterday");
    if commits.is_empty() {
        println!("No recent commits. Nothing to digest.");
        std::process::exit(0);
    }

    let today = get_today();
    let line_count = commits.lines().count();
    println!("Generating digest for {today} ({line_count} commits)...");

    let client = mlld::Client::new();

    let mut payload = HashMap::new();
    payload.insert("commits", commits.as_str());
    payload.insert("date", today.as_str());

    let opts = mlld::ExecuteOptions::default().with_timeout(Duration::from_secs(60));

    match client.execute(script, Some(&payload), Some(opts)) {
        Ok(result) => {
            for sw in &result.state_writes {
                if sw.path == "digest" {
                    let digest = sw.value.as_str().unwrap_or_default();
                    fs::create_dir_all("digests").ok();
                    let out_path = format!("digests/{today}.md");
                    fs::write(&out_path, digest).ok();
                    println!("Wrote {out_path}\n");
                    println!("{digest}");
                    return;
                }
            }
            println!("No digest produced.");
        }
        Err(e) => {
            eprintln!("Error: {e}");
            std::process::exit(1);
        }
    }
}

fn get_recent_commits(since: &str) -> String {
    Command::new("git")
        .args(["log", "--oneline", &format!("--since={since}")])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default()
}

fn get_today() -> String {
    Command::new("date")
        .arg("+%Y-%m-%d")
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|_| "unknown".to_string())
}

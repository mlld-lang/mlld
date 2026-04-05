// File-watching agent that classifies incoming documents with mlld.

use notify::{Watcher, RecursiveMode, Event, EventKind};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

fn main() {
    let script_path = fs::canonicalize("../llm/process.mld")
        .expect("could not resolve ../llm/process.mld — run from the rust/ directory");
    let script = script_path.to_str().expect("invalid script path");

    fs::create_dir_all("inbox").ok();
    fs::create_dir_all("done").ok();

    let client = mlld::Client::new();

    let (tx, rx) = mpsc::channel::<Event>();
    let mut watcher = notify::recommended_watcher(move |res: Result<Event, _>| {
        if let Ok(event) = res {
            tx.send(event).ok();
        }
    })
    .expect("failed to create watcher");

    watcher
        .watch(Path::new("inbox"), RecursiveMode::NonRecursive)
        .expect("failed to watch inbox");

    println!("Watching inbox/ for new .md files. Drop a file in to classify it.");
    println!("Press Ctrl+C to stop.");
    println!();

    for event in rx {
        if !matches!(event.kind, EventKind::Create(_)) {
            continue;
        }

        for path in &event.paths {
            if path.extension().and_then(|e| e.to_str()) != Some("md") {
                continue;
            }

            // Brief delay to let file writes finish
            thread::sleep(Duration::from_millis(200));
            process_file(&client, script, path);
        }
    }
}

fn process_file(client: &mlld::Client, script: &str, path: &Path) {
    let name = path.file_name().unwrap().to_string_lossy();
    println!("Processing {name}...");

    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(e) => {
            println!("  Error reading: {e}");
            return;
        }
    };

    let mut payload = HashMap::new();
    payload.insert("content", content.as_str());
    payload.insert("filename", &name);

    let opts = mlld::ExecuteOptions::default().with_timeout(Duration::from_secs(60));

    match client.execute(script, Some(&payload), Some(opts)) {
        Ok(result) => {
            for sw in &result.state_writes {
                if sw.path == "result" {
                    let json = serde_json::to_string_pretty(&sw.value).unwrap_or_default();
                    println!("  -> {json}");

                    let stem = path.file_stem().unwrap().to_string_lossy();
                    fs::write(format!("done/{stem}.result.json"), &json).ok();
                    break;
                }
            }
            fs::rename(path, format!("done/{name}")).ok();
        }
        Err(e) => println!("  Error: {e}"),
    }
}

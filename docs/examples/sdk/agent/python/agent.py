"""File-watching agent that classifies incoming documents with mlld."""

import json
import os
import shutil
import time
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileCreatedEvent

from mlld import Client


SCRIPT = str(Path(__file__).resolve().parent.parent / "llm" / "process.mld")
INBOX = Path("inbox")
DONE = Path("done")


class InboxHandler(FileSystemEventHandler):
    def __init__(self, client: Client):
        self.client = client

    def on_created(self, event: FileCreatedEvent):
        if event.is_directory or not event.src_path.endswith(".md"):
            return

        path = Path(event.src_path)
        # Brief delay to let file writes finish
        time.sleep(0.2)

        print(f"Processing {path.name}...")

        try:
            content = path.read_text()
            result = self.client.execute(
                SCRIPT,
                {"content": content, "filename": path.name},
                timeout=60,
            )

            classification = None
            for sw in result.state_writes:
                if sw.path == "result":
                    classification = sw.value
                    break

            if classification:
                out = DONE / f"{path.stem}.result.json"
                out.write_text(json.dumps(classification, indent=2))
                print(f"  -> {classification}")

            shutil.move(str(path), str(DONE / path.name))

        except Exception as e:
            print(f"  Error: {e}")


def main():
    INBOX.mkdir(exist_ok=True)
    DONE.mkdir(exist_ok=True)

    client = Client()
    handler = InboxHandler(client)

    observer = Observer()
    observer.schedule(handler, str(INBOX), recursive=False)
    observer.start()

    print(f"Watching {INBOX}/ for new .md files. Drop a file in to classify it.")
    print("Press Ctrl+C to stop.\n")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
        client.close()

    observer.join()


if __name__ == "__main__":
    main()

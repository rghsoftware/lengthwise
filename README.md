# lengthwise

To install dependencies:

```bash
bun install
```

To run the CLI:

```bash
bun run lw check
```

To launch the local Minimal Workbench:

```bash
bun run lw serve
```

The first launch builds the SvelteKit client when needed, then serves the workbench at `http://127.0.0.1:7331`. The URL remains stable across restarts. Use `bun run lw serve --port <PORT>` when a different fixed port is needed. The workbench edits recognized repository artifacts directly and validates the Project Graph after explicit saves.

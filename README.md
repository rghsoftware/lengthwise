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

The first launch builds the SvelteKit client when needed, then prints a loopback URL. The workbench edits recognized repository artifacts directly and validates the Project Graph after explicit saves.

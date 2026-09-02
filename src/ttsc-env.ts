// Typia's ttsc source-plugin bootstrap invokes `go build`. Some valid Git
// checkouts cannot provide Go's optional VCS stamping metadata (for example,
// managed worktrees or restricted Git metadata mounts). Disable only that
// stamping so cold plugin builds remain deterministic and ordinary Bun entry
// points work without a shell-specific environment export.
if (!Bun.env.GOFLAGS?.split(/\s+/).includes("-buildvcs=false")) {
  Bun.env.GOFLAGS = [Bun.env.GOFLAGS, "-buildvcs=false"].filter(Boolean).join(" ");
}

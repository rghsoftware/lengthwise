import { tmpdir } from "node:os";

/** Materializes a throwaway repository fixture on disk for integration tests. */
export async function createFixtureRepo(files: Record<string, string>): Promise<string> {
  const root = `${tmpdir()}/lengthwise-fixture-${crypto.randomUUID()}`;
  for (const [relativePath, content] of Object.entries(files)) {
    await Bun.write(`${root}/${relativePath}`, content);
  }
  return root;
}

export async function removeFixtureRepo(root: string): Promise<void> {
  await Bun.$`rm -rf ${root}`.quiet();
}

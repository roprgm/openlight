/**
 * Runs the browser tests on a Modal GPU: `bun run test:modal [playwright options]`.
 * Signs in with MODAL_TOKEN_ID and MODAL_TOKEN_SECRET, or the Modal CLI's profile.
 */

import playwright from "@playwright/test/package.json" with { type: "json" };
import { $ } from "bun";
import { ModalClient } from "modal";

const started = performance.now();
function log(message: string) {
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(`[modal ${seconds}s] ${message}`);
}

// Dependencies become an image layer keyed on the lockfile's content, so a sandbox starts with them installed.
const manifest = await Promise.all(
  ["package.json", "bun.lock"].map(
    async (file) =>
      `echo ${Buffer.from(await Bun.file(file).arrayBuffer()).toString("base64")} | base64 -d > ${file}`,
  ),
);
const modal = new ModalClient();
const app = await modal.apps.fromName("openlight-tests", {
  createIfMissing: true,
});
const image = modal.images
  .fromRegistry(`mcr.microsoft.com/playwright:v${playwright.version}-noble`)
  .dockerfileCommands([
    // Without Mesa's Vulkan drivers beside NVIDIA's, Chromium loses its WebGPU instance mid-test.
    "RUN apt-get update && apt-get install -y --no-install-recommends libvulkan1 mesa-vulkan-drivers unzip && rm -rf /var/lib/apt/lists/*",
    `RUN curl -fsSL https://bun.sh/install | bash -s bun-v${Bun.version} && ln -s /root/.bun/bin/bun /usr/local/bin/bun`,
    `RUN mkdir /repo && cd /repo && ${manifest.join(" && ")} && bun install --frozen-lockfile`,
    // Modal's GPU sandboxes hand WebGPU to the headless shell build of Chromium only.
    "ENV CI=1 NVIDIA_DRIVER_CAPABILITIES=all PLAYWRIGHT_CHANNEL=chromium-headless-shell",
  ]);
await image.build(app);
log(`image ${image.imageId} built`);
const sandbox = await modal.sandboxes.create(app, image, {
  gpu: "L4",
  // Eight workers keep the GPU busy; more contend for it and time out.
  cpu: 8,
  memoryMiB: 16384,
  timeoutMs: 20 * 60_000,
  workdir: "/repo",
});
log(`sandbox ${sandbox.sandboxId} ready`);

try {
  // The working tree as it is, tracked or new, without what Git ignores or deletes.
  const listed =
    await $`git ls-files -z --cached --others --exclude-standard`.text();
  const files = [];
  for (const file of listed.split("\0")) {
    if (file && (await Bun.file(file).exists())) {
      files.push(file);
    }
  }
  const source = `/tmp/openlight-${sandbox.sandboxId}.tgz`;
  await $`tar -czf ${source} --null -T - < ${new Response(files.join("\0"))}`;
  await sandbox.filesystem.copyFromLocal(source, "/tmp/source.tgz");
  await $`rm ${source}`;
  log(`uploaded ${files.length} files`);

  const tests = await sandbox.exec(
    [
      "bash",
      "-c",
      'tar -xzf /tmp/source.tgz && exec bun run test:browser --workers=8 "$@"',
      "playwright",
      ...process.argv.slice(2),
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const forward = async (
    stream: ReadableStream<string>,
    output: NodeJS.WriteStream,
  ) => {
    for await (const chunk of stream) {
      output.write(chunk);
    }
  };
  await Promise.all([
    forward(tests.stdout, process.stdout),
    forward(tests.stderr, process.stderr),
  ]);
  const code = await tests.wait();
  log(`tests exited with ${code}`);
  if (code !== 0) {
    const report = await sandbox.exec([
      "tar",
      "-czf",
      "/tmp/results.tgz",
      "test-results",
    ]);
    if ((await report.wait()) === 0) {
      await sandbox.filesystem.copyToLocal(
        "/tmp/results.tgz",
        "test-results.tgz",
      );
      await $`mkdir -p test-results && tar -xzf test-results.tgz && rm test-results.tgz`;
    }
  }
  process.exitCode = code;
} finally {
  await sandbox.terminate();
  modal.close();
}

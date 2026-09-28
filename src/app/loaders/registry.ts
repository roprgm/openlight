export type FileLoader =
  | {
      kind: "document";
      accepts: (file: File) => boolean;
      /** Resolves whether the file became the open document. */
      load: (file: File) => Promise<boolean>;
    }
  | {
      kind: "settings";
      accepts: (file: File) => boolean;
      load: (file: File) => Promise<void>;
    };

type Job = { file: File; loader: FileLoader };

/** Settings apply to the batch's document, so they wait for it and skip a batch whose document failed. */
async function loadBatch(jobs: Job[], ready: () => boolean) {
  const document = jobs.find(({ loader }) => loader.kind === "document");
  if (
    document?.loader.kind === "document" &&
    !(await document.loader.load(document.file))
  ) {
    return;
  }
  if (!ready()) {
    return;
  }
  for (const { file, loader } of jobs) {
    if (loader.kind === "settings") {
      await loader.load(file);
    }
  }
}

export function createLoaderRegistry(
  loaders: readonly FileLoader[],
  ready: () => boolean,
) {
  let pending = Promise.resolve();

  function enqueue(jobs: Job[]) {
    const result = pending.then(() => loadBatch(jobs, ready));
    // Return the failure to the caller while allowing later batches to run.
    pending = result.catch(() => {});
    return result;
  }

  function openFiles(files: readonly File[]) {
    const jobs = files.flatMap((file) => {
      if (!(file instanceof File)) {
        throw new Error("openFiles requires Files.");
      }
      const loader = loaders.find((loader) => loader.accepts(file));
      return loader ? [{ file, loader }] : [];
    });
    return enqueue(jobs);
  }

  function loadFile(loader: FileLoader, file: File) {
    return enqueue([{ file, loader }]);
  }

  return { openFiles, loadFile };
}

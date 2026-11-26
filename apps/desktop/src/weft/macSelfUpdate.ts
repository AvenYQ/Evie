// @effect-diagnostics nodeBuiltinImport:off -- Weft-only installer: runs a detached shell after the app quits, outside any Effect fiber.
// @effect-diagnostics globalDate:off -- Download speed and the backup name only need wall time.
// @effect-diagnostics globalTimers:off globalFetch:off -- Called from electron-updater's promise API, outside any Effect fiber.
// Weft: Tide is signed ad hoc and Squirrel.Mac only installs Developer ID builds, so on macOS
// Tide installs its own updates. electron-updater still checks the feed; this module emits the
// download-progress / update-downloaded events it would, so the update state machine is unchanged.
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeStream from "node:stream";
import * as NodeStreamPromises from "node:stream/promises";
import * as NodeUtil from "node:util";

declare const __WEFT_APP_NAME__: string | undefined;

const run = NodeUtil.promisify(NodeChildProcess.execFile);
const STALL_MS = 60_000;

export const isWeftMacSelfUpdate =
  // oxlint-disable-next-line t3code/no-global-process-runtime -- Fixed at load, outside the Effect runtime.
  process.platform === "darwin" &&
  typeof __WEFT_APP_NAME__ !== "undefined" &&
  __WEFT_APP_NAME__.length > 0;

/** The bundle the running app started from: …/Tide.app/Contents/MacOS/Tide → …/Tide.app. */
export function bundleOf(execPath: string): string | undefined {
  const at = execPath.lastIndexOf(".app/Contents/MacOS/");
  return at < 0 ? undefined : execPath.slice(0, at + 4);
}

const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

export function swapScript(input: {
  readonly pid: number;
  readonly from: string;
  readonly to: string;
  readonly target?: string;
  readonly log: string;
  readonly reopen: boolean;
}): string {
  const { pid, from, to, log, reopen } = input;
  const dest = input.target ?? to;
  return `#!/bin/sh
exec >>${quote(log)} 2>&1
echo "$(date) swap: waiting for ${pid}"
i=0
while kill -0 ${pid} 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -gt 3000 ]; then echo "$(date) swap: the app did not quit, nothing changed"; exit 0; fi
  sleep 0.2
done
old=${quote(`${to}.old-${Date.now()}`)}
if mv ${quote(to)} "$old"; then
  if mv ${quote(from)} ${quote(dest)}; then
    rm -rf "$old"
    /usr/bin/xattr -dr com.apple.quarantine ${quote(dest)} 2>/dev/null
    /usr/bin/touch ${quote(dest)} 2>/dev/null
    /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f ${quote(dest)} 2>/dev/null
    echo "$(date) swap: done"
  else
    mv "$old" ${quote(to)}
    echo "$(date) swap: failed, the old version stays"
  fi
fi
${reopen ? `/usr/bin/open ${quote(dest)} || echo "$(date) swap: could not open the app"` : ""}
`;
}

interface ResolvedFile {
  readonly url: URL;
  readonly info: { readonly url: string; readonly sha512?: string; readonly size?: number };
}

interface UpdaterInternals {
  readonly updateInfoAndProvider: {
    readonly info: { readonly version: string };
    readonly provider: { resolveFiles: (info: unknown) => ReadonlyArray<ResolvedFile> };
  } | null;
  emit: (event: string, ...args: ReadonlyArray<unknown>) => boolean;
}

/** The release zip for this Mac's architecture, as the checked feed lists it. */
export function pickMacZip(
  files: ReadonlyArray<ResolvedFile>,
  // oxlint-disable-next-line t3code/no-global-process-runtime -- Default for the running app; tests pass one.
  arch: string = process.arch,
): ResolvedFile | undefined {
  const zips = files.filter((file) => file.url.pathname.endsWith(".zip"));
  return zips.find((file) => NodePath.basename(file.url.pathname).includes(arch)) ?? zips[0];
}

let prepared: { readonly version: string; readonly app: string; readonly work: string } | null =
  null;

/**
 * `ditto` just wrote this tree and Spotlight/lsregister are still touching it, so Node's recursive
 * rm can lose that race with ENOTEMPTY and abort the whole download. Fall back to /bin/rm -rf.
 */
async function removeDirectory(path: string): Promise<void> {
  try {
    await NodeFSP.rm(path, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    await run("/bin/rm", ["-rf", path]).catch(() => undefined);
  }
}

/** Downloads, verifies and unpacks the update the last check found; emits updater events. */
export async function downloadMacUpdate(updater: unknown): Promise<void> {
  const internals = updater as UpdaterInternals;
  const found = internals.updateInfoAndProvider;
  if (found === null) throw new Error("no update has been found yet");
  const { info, provider } = found;
  const file = pickMacZip(provider.resolveFiles(info));
  if (file === undefined) throw new Error("the release has no macOS zip");
  const bundle = bundleOf(process.execPath);
  if (bundle === undefined || bundle.includes("/AppTranslocation/")) {
    throw new Error("Tide is not running from an installed app bundle");
  }
  await NodeFSP.access(NodePath.dirname(bundle), NodeFSP.constants.W_OK);

  if (prepared !== null) await removeDirectory(prepared.work);
  prepared = null;
  const work = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "tide-update-"));
  try {
    const zip = NodePath.join(work, "update.zip");
    const abort = new AbortController();
    let stall = setTimeout(() => abort.abort(new Error("the download stopped")), STALL_MS);
    const hash = NodeCrypto.createHash("sha512");
    try {
      const response = await fetch(file.url, { redirect: "follow", signal: abort.signal });
      if (!response.ok || response.body === null) {
        throw new Error(`download failed: HTTP ${response.status}`);
      }
      const total = Number(response.headers.get("content-length")) || file.info.size || 0;
      let received = 0;
      const startedAt = Date.now();
      const counter = new NodeStream.Transform({
        transform(chunk: Buffer, _encoding, done) {
          clearTimeout(stall);
          stall = setTimeout(() => abort.abort(new Error("the download stopped")), STALL_MS);
          hash.update(chunk);
          received += chunk.length;
          if (total > 0) {
            const seconds = Math.max((Date.now() - startedAt) / 1000, 0.001);
            internals.emit("download-progress", {
              percent: Math.min((received / total) * 100, 100),
              total,
              transferred: received,
              bytesPerSecond: received / seconds,
            });
          }
          done(null, chunk);
        },
      });
      await NodeStreamPromises.pipeline(
        NodeStream.Readable.fromWeb(
          response.body as Parameters<typeof NodeStream.Readable.fromWeb>[0],
        ),
        counter,
        NodeFS.createWriteStream(zip),
        { signal: abort.signal },
      );
    } catch (error) {
      throw abort.signal.aborted && abort.signal.reason instanceof Error
        ? abort.signal.reason
        : error;
    } finally {
      clearTimeout(stall);
    }
    if (file.info.sha512 !== undefined && hash.digest("base64") !== file.info.sha512) {
      throw new Error("the download does not match its release");
    }

    const unpacked = NodePath.join(work, "unpacked");
    await NodeFSP.mkdir(unpacked);
    await run("/usr/bin/ditto", ["-x", "-k", zip, unpacked]);
    await NodeFSP.rm(zip, { force: true });
    const entries = await NodeFSP.readdir(unpacked);
    const sameName = entries.find((entry) => entry === NodePath.basename(bundle));
    const appName = sameName ?? entries.find((entry) => entry.endsWith(".app"));
    if (appName === undefined) {
      throw new Error("the update archive does not contain an app bundle");
    }
    const app = NodePath.join(unpacked, appName);
    const plist = await NodeFSP.readFile(NodePath.join(app, "Contents", "Info.plist"), "utf8");
    const shown = /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]*)<\/string>/u.exec(
      plist,
    )?.[1];
    if (shown !== info.version) {
      throw new Error(`the download is version ${shown ?? "unknown"}, not ${info.version}`);
    }
    prepared = { version: info.version, app, work };
    internals.emit("update-downloaded", info);
  } catch (error) {
    await removeDirectory(work);
    throw error;
  }
}

/** Starts the swap that waits for this process to exit, then quits through `quit`. */
export async function installMacUpdate(reopen: boolean, quit: () => void): Promise<void> {
  if (prepared === null) throw new Error("no downloaded update to install");
  const bundle = bundleOf(process.execPath);
  if (bundle === undefined) throw new Error("Tide is not running from an app bundle");
  const target = NodePath.join(NodePath.dirname(bundle), NodePath.basename(prepared.app));
  const script = NodePath.join(prepared.work, "swap.sh");
  await NodeFSP.writeFile(
    script,
    swapScript({
      pid: process.pid,
      from: prepared.app,
      to: bundle,
      target,
      log: NodePath.join(prepared.work, "swap.log"),
      reopen,
    }),
    { mode: 0o755 },
  );
  const child = NodeChildProcess.spawn("/bin/sh", [script], { detached: true, stdio: "ignore" });
  child.unref();
  quit();
}

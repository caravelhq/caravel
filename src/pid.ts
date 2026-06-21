import { writeFile, unlink, readFile } from "fs/promises";
import { readFileSync } from "fs";
import { join } from "path";

const PID_FILE = join(process.cwd(), ".claude", "claudeclaw", "daemon.pid");

// Substrings that must appear in /proc/<pid>/cmdline for a PID to count as a
// real claudeclaw daemon. This guards against PID recycling: after an
// ungraceful shutdown (machine/WSL reboot, SIGKILL) the daemon dies WITHOUT
// running cleanupPidFile(), so daemon.pid is left behind. On reboot the OS
// recycles PIDs from low numbers, so that stale number is frequently reused by
// an unrelated process — a bare `kill(pid, 0)` then reports it "alive",
// causing start to abort and stop to SIGTERM an innocent process.
const DAEMON_CMDLINE_MARKERS = ["claudeclaw", "index.ts"];

export function getPidPath(): string {
  return PID_FILE;
}

/**
 * True if `pid` is alive AND its command line looks like the claudeclaw daemon.
 *
 * Liveness is checked with `kill(pid, 0)`; ownership is then confirmed by
 * reading `/proc/<pid>/cmdline` (Linux/WSL). If /proc is unavailable
 * (non-Linux), we fall back to the bare liveness result — best effort.
 */
export function isDaemonProcess(pid: number): boolean {
  if (!pid || isNaN(pid)) return false;
  try {
    process.kill(pid, 0); // alive? (throws ESRCH if dead, EPERM if not ours)
  } catch {
    return false;
  }
  try {
    const cmdline = readFileSync(`/proc/${pid}/cmdline`, "utf-8").replace(/\0/g, " ");
    return DAEMON_CMDLINE_MARKERS.every((m) => cmdline.includes(m));
  } catch {
    return true; // no /proc — trust the liveness signal
  }
}

/**
 * Check if a daemon is already running in this directory.
 * If the PID file is stale — process dead OR the PID has been recycled by an
 * unrelated process — it gets cleaned up. Returns the running PID if it is a
 * live claudeclaw daemon, or null.
 */
export async function checkExistingDaemon(): Promise<number | null> {
  let raw: string;
  try {
    raw = (await readFile(PID_FILE, "utf-8")).trim();
  } catch {
    return null; // no pid file
  }

  const pid = Number(raw);
  if (!pid || isNaN(pid)) {
    await cleanupPidFile();
    return null;
  }

  if (isDaemonProcess(pid)) {
    return pid;
  }
  // dead, or PID recycled by something that isn't our daemon — stale file.
  await cleanupPidFile();
  return null;
}

export async function writePidFile(): Promise<void> {
  await writeFile(PID_FILE, String(process.pid) + "\n");
}

export async function cleanupPidFile(): Promise<void> {
  try {
    await unlink(PID_FILE);
  } catch {
    // already gone
  }
}

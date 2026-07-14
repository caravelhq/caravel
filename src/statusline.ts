import { join } from "path";
import { resolveStateDir } from "./paths";

const HEARTBEAT_DIR = resolveStateDir();

// Write state.json so the statusline script can read fresh data
export interface StateData {
  heartbeat?: { nextAt: number };
  jobs: { name: string; nextAt: number }[];
  security: string;
  telegram: boolean;
  discord: boolean;
  startedAt: number;
  web?: { enabled: boolean; host: string; port: number };
}

export async function writeState(state: StateData) {
  await Bun.write(
    join(HEARTBEAT_DIR, "state.json"),
    JSON.stringify(state) + "\n"
  );
}

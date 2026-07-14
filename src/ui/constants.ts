import { join } from "path";
import { resolveStateDir } from "../paths";

export const HEARTBEAT_DIR = resolveStateDir();
export const LOGS_DIR = join(HEARTBEAT_DIR, "logs");
export const JOBS_DIR = join(HEARTBEAT_DIR, "jobs");
export const SETTINGS_FILE = join(HEARTBEAT_DIR, "settings.json");
export const SESSION_FILE = join(HEARTBEAT_DIR, "session.json");
export const STATE_FILE = join(HEARTBEAT_DIR, "state.json");
export const CHATS_DIR = join(HEARTBEAT_DIR, "chats");

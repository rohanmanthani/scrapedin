import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadEnv({ path: path.resolve(__dirname, "../../.env") });

const resolvePath = (relative: string) => path.resolve(process.cwd(), relative);

export interface AppConfig {
  port: number;
  host: string;
  dataDir: string;
  stateFile: string;
  backgroundTickMs: number;
  logLevel: string;
  corsOrigins: string[];
}

const fallbackDataDir = resolvePath("../data");

export const appConfig: AppConfig = {
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? "0.0.0.0",
  dataDir: resolvePath(process.env.DATA_DIR ?? fallbackDataDir),
  stateFile: resolvePath(process.env.STATE_FILE ?? path.join(fallbackDataDir, "app-state.json")),
  backgroundTickMs: Number(process.env.BACKGROUND_TICK_MS ?? 45_000),
  logLevel: process.env.LOG_LEVEL ?? "info",
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:5173").split(",")
};


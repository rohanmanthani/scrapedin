import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_APP_STATE, type AppState } from "../types.js";
import { AsyncLock } from "./AsyncLock.js";
import { randomUUID } from "node:crypto";

const JSON_SPACES = 2;

export class FileStore {
  private readonly lock = new AsyncLock();

  constructor(private readonly stateFile: string) {}

  async init(): Promise<void> {
    const dir = path.dirname(this.stateFile);
    await mkdir(dir, { recursive: true });
    try {
      await readFile(this.stateFile, "utf-8");
    } catch {
      await this.write(DEFAULT_APP_STATE);
    }
  }

  async read(): Promise<AppState> {
    const raw = await readFile(this.stateFile, "utf-8");
    try {
      return JSON.parse(raw) as AppState;
    } catch (error) {
      throw new Error(
        `Failed to parse state file "${this.stateFile}". The file may be corrupted or mid-write. ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async write(state: AppState): Promise<void> {
    const dir = path.dirname(this.stateFile);
    const tempFile = path.join(dir, `.tmp-${randomUUID()}.json`);
    const payload = JSON.stringify(state, null, JSON_SPACES);
    await writeFile(tempFile, payload, "utf-8");
    await rename(tempFile, this.stateFile);
  }

  update<T>(updater: (state: AppState) => Promise<[AppState, T]>): Promise<T> {
    return this.lock.run(async () => {
      const state = await this.read();
      const [nextState, result] = await updater(state);
      await this.write(nextState);
      return result;
    });
  }
}

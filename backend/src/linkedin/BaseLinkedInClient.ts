import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";
import { setTimeout as delay } from "node:timers/promises";
import { logger } from "../logger.js";
import type { AutomationSettings } from "../types.js";

export abstract class BaseLinkedInClient {
  protected context?: BrowserContext;

  constructor(protected readonly settings: AutomationSettings) {}

  async dispose(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = undefined;
    }
  }

  protected async getContext(): Promise<BrowserContext> {
    if (this.context) {
      return this.context;
    }

    const launchArgs: string[] = ["--disable-blink-features=AutomationControlled"];
    const launchOptions = {
      headless: this.settings.headless,
      executablePath: this.settings.chromeExecutablePath,
      args: launchArgs
    };

    if (this.settings.chromeUserDataDir) {
      logger.info(
        { userDataDir: this.settings.chromeUserDataDir },
        "Launching Playwright with persistent Chrome profile"
      );
      this.context = await chromium.launchPersistentContext(this.settings.chromeUserDataDir, {
        ...launchOptions,
        viewport: { width: 1440, height: 868 }
      });
    } else {
      const defaultProfilePath = path.resolve(process.cwd(), ".playwright-profile");
      this.context = await chromium.launchPersistentContext(defaultProfilePath, {
        ...launchOptions,
        viewport: { width: 1440, height: 868 }
      });
    }

    if (this.settings.sessionCookie) {
      const cookies = [
        {
          name: "li_at",
          value: this.settings.sessionCookie,
          domain: ".linkedin.com",
          path: "/",
          httpOnly: true,
          secure: true
        }
      ];
      await this.context.addCookies(cookies);
    }

    await this.context.addInitScript(`
      if (typeof window !== "undefined") {
        window.__name = window.__name || ((target, value) => target);
      }
    `);

    return this.context;
  }

  protected async withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
    const context = await this.getContext();
    const page = await context.newPage();
    try {
      return await fn(page);
    } finally {
      await page.close();
    }
  }

  protected async randomDelay(): Promise<void> {
    const { minDelayMs, maxDelayMs, randomizeDelays } = this.settings;
    const baseDelay = randomizeDelays
      ? Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1)) + minDelayMs
      : minDelayMs;
    await delay(baseDelay);
  }
}

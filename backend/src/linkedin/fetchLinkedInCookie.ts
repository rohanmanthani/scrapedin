import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { chromium, type BrowserContext } from "playwright";

const LINKEDIN_URL = "https://www.linkedin.com";
const LINKEDIN_COOKIE_NAME = "li_at";
const CHECK_INTERVAL_MS = 3000;
const MAX_CHECKS = 60; // ~3 minutes

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForCookie = async (context: BrowserContext): Promise<string> => {
  for (let attempt = 0; attempt < MAX_CHECKS; attempt += 1) {
    const cookies = await context.cookies(LINKEDIN_URL);
    const sessionCookie = cookies.find((cookie) => cookie.name === LINKEDIN_COOKIE_NAME);
    if (sessionCookie?.value) {
      return sessionCookie.value;
    }
    await sleep(CHECK_INTERVAL_MS);
  }
  throw new Error(
    "LinkedIn session cookie (li_at) not found. Make sure you log in to LinkedIn in the opened browser window."
  );
};

const launchContext = async (userDataDir?: string): Promise<BrowserContext> => {
  return chromium.launchPersistentContext(userDataDir ?? "", {
    headless: false,
    args: ["--disable-dev-shm-usage", "--no-sandbox"]
  });
};

export const fetchLinkedInSessionCookie = async (userDataDir?: string): Promise<string> => {
  // Try using provided profile first
  if (userDataDir) {
    const profileContext = await launchContext(userDataDir);
    try {
      const page = profileContext.pages()[0] ?? (await profileContext.newPage());
      await page.goto(LINKEDIN_URL, { waitUntil: "domcontentloaded" });
      const cookie = await waitForCookie(profileContext);
      await profileContext.close();
      return cookie;
    } catch (error) {
      await profileContext.close();
      throw error;
    }
  }

  // Fallback to assisted login
  const tempDir = await mkdtemp(path.join(tmpdir(), "linkedin-profile-"));
  let context: BrowserContext | undefined;
  try {
    context = await launchContext(tempDir);
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded" });
    const cookie = await waitForCookie(context);
    await context.close();
    await rm(tempDir, { recursive: true, force: true });
    return cookie;
  } catch (error) {
    if (context) {
      await context.close();
    }
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
};

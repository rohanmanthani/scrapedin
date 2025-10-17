import { logger } from "../logger.js";
import type { AutomationSettings, LeadRecord } from "../types.js";
import { BaseLinkedInClient } from "./BaseLinkedInClient.js";
import { extractAccountProfiles } from "./parsers/accountFollowers.js";
import type { Page } from "playwright";

interface AccountFollowersInput {
  taskId: string;
  taskName?: string;
  accountUrls: string[];
  leadListName?: string;
  maxProfiles?: number;
}

interface AccountProfileMeta {
  accountUrl: string;
  companyName?: string;
}

export class AccountFollowersScraper extends BaseLinkedInClient {
  constructor(settings: AutomationSettings) {
    super(settings);
  }

  async scrape(input: AccountFollowersInput): Promise<LeadRecord[]> {
    const context = await this.getContext();
    const perAccountLimit =
      input.maxProfiles && input.maxProfiles > 0 ? input.maxProfiles : this.settings.resultsPerPage ?? 25;

    const aggregated: LeadRecord[] = [];
    const seen = new Set<string>();

    for (const rawAccountUrl of input.accountUrls) {
      const normalizedAccountUrl = this.normalizeAccountUrl(rawAccountUrl);
      const page = await context.newPage();
      try {
        const peopleUrl = this.buildPeopleUrl(normalizedAccountUrl);
        logger.info({ peopleUrl }, "Scraping LinkedIn company followers");
        await page.goto(peopleUrl, {
          waitUntil: "domcontentloaded",
          timeout: this.settings.pageTimeoutMs
        });
        await this.randomDelay();
        await this.loadAdditionalProfiles(page, perAccountLimit);
        const extracted = await page.evaluate(extractAccountProfiles, {
          limit: perAccountLimit,
          origin: page.url()
        });
        const accountMeta: AccountProfileMeta = {
          accountUrl: normalizedAccountUrl,
          companyName: extracted[0]?.companyName ?? this.deriveCompanyNameFromUrl(normalizedAccountUrl)
        };
        const leads = this.mapToLeadRecords(extracted, accountMeta, input);
        for (const lead of leads) {
          if (seen.has(lead.profileUrl.toLowerCase())) {
            continue;
          }
          seen.add(lead.profileUrl.toLowerCase());
          aggregated.push(lead);
        }
      } catch (error) {
        logger.error({ err: error, accountUrl: rawAccountUrl }, "Failed to scrape company followers");
      } finally {
        await page.close();
        await this.randomDelay();
      }
    }

    return aggregated;
  }

  private normalizeAccountUrl(url: string): string {
    const trimmed = url.trim();
    if (!trimmed) {
      throw new Error("Account URL cannot be empty");
    }
    let parsed: URL;
    try {
      parsed = trimmed.startsWith("http")
        ? new URL(trimmed)
        : new URL(trimmed.startsWith("/") ? trimmed : `/${trimmed}`, "https://www.linkedin.com");
    } catch {
      throw new Error(`Invalid LinkedIn company URL: ${url}`);
    }
    const cleanedPath = parsed.pathname
      .replace(/\/(about|posts|updates|people|followers)\/?$/i, "")
      .replace(/\/+$/, "");
    parsed.pathname = cleanedPath;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  }

  private buildPeopleUrl(accountUrl: string): string {
    return `${accountUrl.endsWith("/") ? accountUrl.slice(0, -1) : accountUrl}/people/`;
  }

  private deriveCompanyNameFromUrl(accountUrl: string): string | undefined {
    try {
      const parsed = new URL(accountUrl);
      const segments = parsed.pathname.split("/").filter(Boolean);
      const slug = segments.pop();
      if (!slug) {
        return undefined;
      }
      return slug
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
    } catch {
      return undefined;
    }
  }

  private async loadAdditionalProfiles(page: Page, target: number): Promise<void> {
    let previousCount = 0;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const count = await page.evaluate(() => {
        const selectors = [
          "li.org-people-profile-card",
          "li.org-people-profile-card__profile-list-item",
          "li[data-test-id='org-people-profile-card']"
        ];
        return selectors
          .map((selector) => document.querySelectorAll(selector).length)
          .reduce((total, value) => total + value, 0);
      });
      if (count >= target || count === previousCount) {
        break;
      }
      previousCount = count;

      const loadMoreClicked = await this.clickIfExists(page, [
        "button[aria-label*='Show more']",
        "button[data-control-name='people_profile_card_show_more']",
        "button[data-test-id='people-search-show-more-button']"
      ]);
      if (!loadMoreClicked) {
        await page.evaluate(() => {
          window.scrollBy(0, window.innerHeight * 1.5);
        });
      }
      await this.randomDelay();
    }
  }

  private async clickIfExists(page: Page, selectors: string[]): Promise<boolean> {
    for (const selector of selectors) {
      const handle = await page.$(selector);
      if (handle) {
        await handle.click({ delay: 50 });
        await handle.dispose();
        return true;
      }
    }
    return false;
  }

  private mapToLeadRecords(
    profiles: ReturnType<typeof extractAccountProfiles>,
    meta: AccountProfileMeta,
    input: AccountFollowersInput
  ): LeadRecord[] {
    const timestamp = new Date().toISOString();
    return profiles
      .filter((profile) => profile.profileUrl && profile.fullName)
      .map((profile) => {
        const id = `${input.taskId}:${profile.profileUrl}`;
        return {
          id,
          presetId: input.taskId,
          profileUrl: profile.profileUrl,
          fullName: profile.fullName,
          title: profile.headline,
          headline: profile.headline,
          companyName: profile.companyName ?? meta.companyName,
          companyUrl: meta.accountUrl,
          location: profile.location,
          capturedAt: timestamp,
          raw: {
            source: "account_followers",
            accountUrl: meta.accountUrl,
            leadListName: input.leadListName,
            profile: profile as unknown as Record<string, unknown>
          },
          taskName: input.taskName
        };
      });
  }
}

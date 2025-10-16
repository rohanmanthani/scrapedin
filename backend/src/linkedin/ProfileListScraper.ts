import { logger } from "../logger.js";
import type { AutomationSettings, LeadRecord } from "../types.js";
import { BaseLinkedInClient } from "./BaseLinkedInClient.js";
import { extractProfileDetails, type ExtractedProfileDetails } from "./parsers/profile.js";
import type { Page } from "playwright";

interface ProfileListInput {
  taskId: string;
  taskName?: string;
  profileUrls: string[];
  leadListName?: string;
}

export class ProfileListScraper extends BaseLinkedInClient {
  constructor(settings: AutomationSettings) {
    super(settings);
  }

  async scrape(input: ProfileListInput): Promise<LeadRecord[]> {
    const context = await this.getContext();
    const dedupe = new Set<string>();
    const capturedAt = new Date().toISOString();
    const results: LeadRecord[] = [];

    for (const rawUrl of input.profileUrls) {
      let normalizedUrl: string;
      try {
        normalizedUrl = this.normalizeProfileUrl(rawUrl);
      } catch (error) {
        logger.warn({ err: error, profileUrl: rawUrl }, "Skipping invalid LinkedIn profile URL");
        continue;
      }

      const dedupeKey = normalizedUrl.toLowerCase();
      if (dedupe.has(dedupeKey)) {
        continue;
      }
      dedupe.add(dedupeKey);

      const page = await context.newPage();
      try {
        logger.info({ profileUrl: normalizedUrl }, "Scraping LinkedIn profile from manual list");
        await page.goto(normalizedUrl, {
          waitUntil: "domcontentloaded",
          timeout: this.settings.pageTimeoutMs
        });
        await this.randomDelay();
        try {
          await page.waitForSelector("main", {
            timeout: Math.min(this.settings.pageTimeoutMs, 8000)
          });
        } catch {
          // Continue even if the main selector is slow to appear.
        }

        await this.openContactInfo(page);
        const details = await page.evaluate(extractProfileDetails);
        if (!details.fullName) {
          const pageTitle = await page.title();
          const firstH1 = await page.$eval("h1", (el) => el?.textContent?.trim()).catch(() => null);
          const metaTitle = await page
            .$eval("meta[property='og:title']", (el) => el?.getAttribute("content"))
            .catch(() => null);
          logger.warn(
            {
              profileUrl: normalizedUrl,
              pageTitle,
              firstH1,
              metaTitle,
              extractedDetails: {
                headline: details.headline,
                location: details.location,
                currentTitle: details.currentTitle,
                currentCompany: details.currentCompany
              }
            },
            "Profile missing a discoverable full name; skipping. Page title and other extracted data included for debugging."
          );
          continue;
        }

        const lead = this.mapProfileToLead(input, normalizedUrl, details, capturedAt);
        results.push(lead);
      } catch (error) {
        logger.error({ err: error, profileUrl: rawUrl }, "Failed to scrape LinkedIn profile");
      } finally {
        await page.close();
        await this.randomDelay();
      }
    }

    return results;
  }

  private mapProfileToLead(
    input: ProfileListInput,
    profileUrl: string,
    details: ExtractedProfileDetails,
    capturedAt: string
  ): LeadRecord {
    const experiences = details.experiences ?? [];
    const currentExperience =
      experiences.find((experience) => !experience.endDate) ?? experiences[0];
    const previousCompanies = experiences
      .filter((experience) => experience !== currentExperience)
      .map((experience) => ({
        company: experience.company,
        title: experience.title,
        startDate: experience.startDate,
        endDate: experience.endDate,
        dateRangeText: experience.dateRangeText,
        location: experience.location,
        description: experience.description
      }))
      .filter((entry) => Boolean(entry.company || entry.title));

    return {
      id: `${input.taskId}:${profileUrl}`,
      presetId: input.taskId,
      profileUrl,
      fullName: details.fullName ?? "",
      headline: details.headline ?? undefined,
      title: details.currentTitle ?? currentExperience?.title ?? undefined,
      companyName: details.currentCompany ?? currentExperience?.company ?? undefined,
      location: details.location ?? currentExperience?.location,
      capturedAt,
      connectionsText: details.connectionsText ?? undefined,
      connectionCount: details.connectionCount,
      followersText: details.followersText ?? undefined,
      followerCount: details.followerCount,
      raw: {
        source: "profile_scrape",
        leadListName: input.leadListName,
        profileImageUrl: details.profileImageUrl,
        currentCompanyStartedAt: details.currentCompanyStartedAt ?? currentExperience?.startDate,
        previousCompanies,
        experiences: details.experiences,
        education: details.education,
        birthday: details.birthday,
        phoneNumbers: details.phoneNumbers,
        connectionsText: details.connectionsText,
        connectionCount: details.connectionCount,
        followersText: details.followersText,
        followerCount: details.followerCount
      },
      email: details.email ?? undefined,
      taskName: input.taskName
    };
  }

  private normalizeProfileUrl(url: string): string {
    const trimmed = url.trim();
    if (!trimmed) {
      throw new Error("Profile URL cannot be empty");
    }
    let parsed: URL;
    try {
      parsed = trimmed.startsWith("http")
        ? new URL(trimmed)
        : new URL(trimmed.startsWith("/") ? trimmed : `/${trimmed}`, "https://www.linkedin.com");
    } catch {
      throw new Error(`Invalid LinkedIn profile URL: ${url}`);
    }
    parsed.search = "";
    parsed.hash = "";
    if (!parsed.pathname.endsWith("/")) {
      parsed.pathname = `${parsed.pathname}/`;
    }
    return parsed.toString();
  }

  private async openContactInfo(page: Page): Promise<void> {
    const selectors = [
      "a[data-control-name='contact_see_more']",
      "a[href*='contact-info']",
      "button[aria-label*='Contact info']",
      "button[aria-label*='Contact Info']",
      "button[data-test-id='profile-topcard-contact-info']"
    ];
    const clicked = await this.clickIfExists(page, selectors);
    if (!clicked) {
      return;
    }
    try {
      await page.waitForSelector(
        "section.pv-contact-info__contact-type, section[data-test-id='profile-contact-info'], div.artdeco-modal__content",
        { timeout: Math.min(this.settings.pageTimeoutMs / 2, 6000) }
      );
    } catch {
      // Contact info modal may not be available; continue silently.
    }
  }

  private async clickIfExists(page: Page, selectors: string[]): Promise<boolean> {
    for (const selector of selectors) {
      const handle = await page.$(selector);
      if (!handle) {
        continue;
      }
      await handle.click({ delay: 50 });
      await handle.dispose();
      return true;
    }
    return false;
  }
}

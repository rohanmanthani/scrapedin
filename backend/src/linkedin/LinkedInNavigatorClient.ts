import { setTimeout as wait } from "node:timers/promises";
import type { AutomationSettings, LeadRecord, SearchPreset } from "../types.js";
import { logger } from "../logger.js";
import { BaseLinkedInClient } from "./BaseLinkedInClient.js";
import { ProfileListScraper } from "./ProfileListScraper.js";
import type { Page } from "playwright";

type ExtractedLead = {
  fullName: string;
  title?: string;
  companyName?: string;
  location?: string;
  profileUrl?: string;
  salesNavigatorUrl?: string;
  headline?: string;
  connectionDegree?: string;
  raw: Record<string, unknown>;
};

const SALES_NAV_BASE = "https://www.linkedin.com/sales/search/people";

export class LinkedInNavigatorClient extends BaseLinkedInClient {
  constructor(settings: AutomationSettings) {
    super(settings);
  }

  async runSearch(preset: SearchPreset, taskName?: string): Promise<LeadRecord[]> {
    const context = await this.getContext();
    const page = await context.newPage();
    const salesNavLeads: ExtractedLead[] = [];

    try {
      const searchUrl = this.buildSearchUrl(preset);
      logger.info({ presetId: preset.id, searchUrl }, "Opening Sales Navigator search");
      await this.openSearch(page, searchUrl);
      await this.randomDelay();

      // Step 1: Extract all Sales Navigator lead URLs from search results
      const maxPages = preset.pageLimit ?? 3;
      for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
        const pageLeads = await this.extractLeadsFromPage(page);
        salesNavLeads.push(...pageLeads);

        const nextButton = await page.$(
          "button[aria-label='Next'], button.artdeco-pagination__button--next"
        );
        if (!nextButton) {
          break;
        }
        logger.debug({ pageIndex }, "Navigating to next results page");
        await nextButton.click();
        await this.randomDelay();
      }

      await page.close();

      logger.info(
        { presetId: preset.id, count: salesNavLeads.length },
        "Extracted Sales Navigator leads, now fetching LinkedIn profile URLs"
      );

      // Step 2: Extract LinkedIn profile URLs from Sales Navigator lead pages (batch process)
      const profileUrls = await this.extractLinkedInProfileUrls(salesNavLeads);

      logger.info(
        { presetId: preset.id, count: profileUrls.length },
        "Extracted LinkedIn profile URLs, now scraping profiles"
      );

      // Step 3: Build Sales Navigator URL mapping
      const salesNavigatorUrls = new Map<string, string>();
      for (const lead of salesNavLeads) {
        if (lead.profileUrl && lead.salesNavigatorUrl) {
          salesNavigatorUrls.set(lead.profileUrl, lead.salesNavigatorUrl);
        }
      }

      // Step 4: Use ProfileListScraper to scrape the actual LinkedIn profiles
      const profileScraper = new ProfileListScraper(this.settings);
      const leads = await profileScraper.scrape({
        taskId: preset.id,
        taskName,
        profileUrls,
        leadListName: preset.name,
        salesNavigatorUrls
      });

      // Merge Sales Navigator metadata with scraped profile data
      const salesNavMap = new Map(
        salesNavLeads.map((lead) => [lead.profileUrl?.toLowerCase(), lead])
      );

      for (const lead of leads) {
        const salesNavLead = salesNavMap.get(lead.profileUrl?.toLowerCase() || "");
        if (salesNavLead) {
          lead.raw = {
            ...lead.raw,
            salesNavigatorData: salesNavLead.raw
          };
        }
      }

      await profileScraper.dispose();
      return leads;
    } catch (error) {
      logger.error({ err: error, presetId: preset.id }, "Failed to run Sales Navigator search");
      throw error;
    }
  }

  private buildSearchUrl(preset: SearchPreset): string {
    const MAX_URL_LENGTH = 3500;
    const sanitizeList = (values: string[]): string[] =>
      Array.from(
        new Set(
          values
            .map((value) => value.trim())
            .filter((value) => value.length > 0)
            .map((value) => (value.length > 120 ? value.slice(0, 120) : value))
        )
      );

    let keywords = sanitizeList(preset.filters.keywords);
    let excludedKeywords = sanitizeList(preset.filters.excludedKeywords);
    let industries = sanitizeList(preset.filters.industries);
    let geographies = sanitizeList(preset.filters.geographies);
    let companyHQ = sanitizeList(preset.filters.companyHeadquarters);
    let seniorities = sanitizeList(preset.filters.seniorities as string[]);
    let functions = sanitizeList(preset.filters.functions);
    let currentCompanies = sanitizeList(preset.filters.currentCompanies);
    let pastCompanies = sanitizeList(preset.filters.pastCompanies);
    let currentTitles = sanitizeList(preset.filters.currentJobTitles);
    let pastTitles = sanitizeList(preset.filters.pastJobTitles);
    let companyTypes = sanitizeList(preset.filters.companyTypes);
    let groups = sanitizeList(preset.filters.groups);
    let schools = sanitizeList(preset.filters.schools);
    let profileLanguages = sanitizeList(preset.filters.profileLanguages);
    let connectionsOf = sanitizeList(preset.filters.connectionsOf);
    let accountLists = sanitizeList(preset.filters.accountLists);
    let leadLists = sanitizeList(preset.filters.leadLists);
    let personas = sanitizeList(preset.filters.personas);

    const originalSizes = {
      keywords: keywords.length,
      excludedKeywords: excludedKeywords.length,
      currentTitles: currentTitles.length,
      functions: functions.length,
      personas: personas.length
    };

    const appendRange = (
      params: URLSearchParams,
      range: { min?: number; max?: number },
      lowKey: string,
      highKey: string
    ) => {
      if (range.min !== undefined) {
        params.append(lowKey, String(range.min));
      }
      if (range.max !== undefined) {
        params.append(highKey, String(range.max));
      }
    };

    const buildUrlFromState = (): string => {
      const params = new URLSearchParams();
      if (keywords.length) {
        params.append("keywords", keywords.join(" "));
      }
      if (excludedKeywords.length) {
        params.append("excludeKeywords", excludedKeywords.join(" "));
      }
      if (industries.length) {
        params.append("industry", industries.join(","));
      }
      if (geographies.length) {
        params.append("geoIncluded", geographies.join(","));
      }
      if (companyHQ.length) {
        params.append("companyHQ", companyHQ.join(","));
      }
      if (seniorities.length) {
        params.append("seniority", seniorities.join(","));
      }
      if (functions.length) {
        params.append("functionIncluded", functions.join(","));
      }
      if (currentCompanies.length) {
        params.append("currentCompany", currentCompanies.join(","));
      }
      if (pastCompanies.length) {
        params.append("pastCompany", pastCompanies.join(","));
      }
      if (currentTitles.length) {
        params.append("currentTitle", currentTitles.join(","));
      }
      if (pastTitles.length) {
        params.append("pastTitle", pastTitles.join(","));
      }
      if (companyTypes.length) {
        params.append("companyType", companyTypes.join(","));
      }
      if (groups.length) {
        params.append("group", groups.join(","));
      }
      if (schools.length) {
        params.append("school", schools.join(","));
      }
      if (profileLanguages.length) {
        params.append("profileLanguage", profileLanguages.join(","));
      }
      if (connectionsOf.length) {
        params.append("connectionOf", connectionsOf.join(","));
      }
      if (accountLists.length) {
        params.append("accountList", accountLists.join(","));
      }
      if (leadLists.length) {
        params.append("leadList", leadLists.join(","));
      }
      if (personas.length) {
        params.append("persona", personas.join(","));
      }
      if (preset.filters.firstName) {
        params.append("firstName", preset.filters.firstName);
      }
      if (preset.filters.lastName) {
        params.append("lastName", preset.filters.lastName);
      }
      appendRange(params, preset.filters.companyHeadcount, "companySizeLow", "companySizeHigh");
      appendRange(params, preset.filters.companyRevenue, "companyRevenueLow", "companyRevenueHigh");
      appendRange(
        params,
        preset.filters.yearsInCurrentCompany,
        "yearsAtCompanyLow",
        "yearsAtCompanyHigh"
      );
      appendRange(
        params,
        preset.filters.yearsInCurrentPosition,
        "yearsInPositionLow",
        "yearsInPositionHigh"
      );
      appendRange(
        params,
        preset.filters.yearsOfExperience,
        "yearsExperienceLow",
        "yearsExperienceHigh"
      );
      if (preset.filters.relationship) {
        params.append("relationship", preset.filters.relationship);
      }
      if (preset.filters.postedInPastDays) {
        params.append("timePosted", String(preset.filters.postedInPastDays));
      }
      if (preset.filters.changedJobsInPastDays) {
        params.append("changedJobs", String(preset.filters.changedJobsInPastDays));
      }
      if (preset.filters.followingYourCompany) {
        params.append("followsCompany", "true");
      }
      if (preset.filters.sharedExperiences) {
        params.append("sharedExperience", "true");
      }
      if (preset.filters.teamLinkIntroductions) {
        params.append("teamlinkIntro", "true");
      }
      if (preset.filters.viewedYourProfile) {
        params.append("viewedProfile", "true");
      }
      if (preset.filters.pastCustomer) {
        params.append("pastCustomer", "true");
      }
      if (preset.filters.pastColleague) {
        params.append("pastColleague", "true");
      }
      if (preset.filters.buyerIntent) {
        params.append("buyerIntent", "true");
      }
      if (preset.filters.peopleInCRM) {
        params.append("inCRM", "true");
      }
      if (preset.filters.peopleInteractedWith) {
        params.append("interactedWithYou", "true");
      }
      if (preset.filters.savedLeadsAndAccounts) {
        params.append("saved", "true");
      }
      params.append("page", "1");
      return `${SALES_NAV_BASE}?${params.toString()}`;
    };

    let url = buildUrlFromState();

    const shrinkStrategies: Array<() => boolean> = [
      () => {
        if (keywords.length > 5) {
          keywords = keywords.slice(0, keywords.length - 1);
          return true;
        }
        return false;
      },
      () => {
        if (excludedKeywords.length > 5) {
          excludedKeywords = excludedKeywords.slice(0, excludedKeywords.length - 1);
          return true;
        }
        return false;
      },
      () => {
        if (currentTitles.length > 5) {
          currentTitles = currentTitles.slice(0, currentTitles.length - 1);
          return true;
        }
        return false;
      },
      () => {
        if (functions.length > 5) {
          functions = functions.slice(0, functions.length - 1);
          return true;
        }
        return false;
      },
      () => {
        if (personas.length > 5) {
          personas = personas.slice(0, personas.length - 1);
          return true;
        }
        return false;
      }
    ];

    let shrinkIndex = 0;
    while (url.length > MAX_URL_LENGTH && shrinkIndex < shrinkStrategies.length) {
      if (shrinkStrategies[shrinkIndex]()) {
        url = buildUrlFromState();
      } else {
        shrinkIndex += 1;
      }
    }

    if (url.length > MAX_URL_LENGTH) {
      throw new Error(
        "Generated Sales Navigator URL is too long. Trim the number of keywords or filters and try again."
      );
    }

    if (
      keywords.length < originalSizes.keywords ||
      excludedKeywords.length < originalSizes.excludedKeywords ||
      currentTitles.length < originalSizes.currentTitles ||
      functions.length < originalSizes.functions ||
      personas.length < originalSizes.personas
    ) {
      logger.debug(
        {
          keywords: keywords.length,
          excludedKeywords: excludedKeywords.length,
          currentTitles: currentTitles.length,
          functions: functions.length,
          personas: personas.length,
          presetId: preset.id
        },
        "Trimmed Sales Navigator filters to satisfy URL length limits"
      );
    }

    return url;
  }

  private async openSearch(page: Page, url: string): Promise<void> {
    const attempts = Math.max((this.settings.retryAttempts ?? 0) + 1, 1);
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: this.settings.pageTimeoutMs
        });
        await this.ensureAuthorized(page);
        return;
      } catch (error) {
        const isLastAttempt = attempt === attempts - 1;
        logger.warn({ err: error, attempt, url }, "Sales Navigator navigation attempt failed");
        if (isLastAttempt) {
          if (error instanceof Error && /ERR_ABORTED/.test(error.message)) {
            throw new Error(
              "LinkedIn aborted the search navigation. Refresh your session cookie, simplify the filters, or retry shortly."
            );
          }
          throw error instanceof Error ? error : new Error(String(error));
        }
        await wait(this.settings.retryBackoffMs ?? 8000);
      }
    }
  }

  private async ensureAuthorized(page: Page): Promise<void> {
    const currentUrl = page.url();
    if (
      currentUrl.includes("checkpoint") ||
      currentUrl.includes("authwall") ||
      currentUrl.includes("login")
    ) {
      throw new Error(
        "LinkedIn redirected to an authentication wall. Update your session cookie or run with a logged-in Chrome profile."
      );
    }
    if (currentUrl.includes("contract-chooser")) {
      throw new Error(
        "LinkedIn redirected to Sales Navigator contract chooser. You may not have an active Sales Navigator subscription or need to select a contract. Please log into LinkedIn Sales Navigator manually and ensure you have access."
      );
    }
    const loginForm = await page.$("form.login__form, form#login");
    if (loginForm) {
      await loginForm.dispose();
      throw new Error(
        "LinkedIn presented a login form while running the search. Refresh your session credentials and try again."
      );
    }
  }

  private async extractLeadsFromPage(page: Page): Promise<ExtractedLead[]> {
    await page.waitForSelector("li.search-results__result-item, li[data-x-search-result]", {
      timeout: this.settings.pageTimeoutMs
    });

    const leads = await page.$$eval(
      "li.search-results__result-item, li[data-x-search-result]",
      (items) =>
        items.map((item) => {
          const fullName =
            item.querySelector<HTMLElement>(
              "a[data-anonymize='person-name'], span[data-anonymize='person-name']"
            )?.innerText ?? "";
          const title =
            item.querySelector<HTMLElement>(
              "span[data-anonymize='title'], div[data-anonymize='headline']"
            )?.innerText ?? undefined;
          const companyName =
            item.querySelector<HTMLElement>("a[data-anonymize='company-name']")?.innerText ??
            undefined;
          const location =
            item.querySelector<HTMLElement>("span[data-anonymize='location']")?.innerText ??
            undefined;

          // Get Sales Navigator lead URL
          const leadLink = item.querySelector<HTMLAnchorElement>(
            "a[data-control-name='view_lead_panel_via_search_lead_name'], a[data-view-name='search-results-lead-name']"
          );
          const salesNavigatorUrl = leadLink?.href
            ? new URL(leadLink.href, window.location.href).toString()
            : undefined;

          const headline =
            item.querySelector<HTMLElement>("div[data-anonymize='headline']")?.innerText ??
            undefined;
          const connectionDegree =
            item
              .querySelector<HTMLElement>("span.artdeco-entity-lockup__degree")
              ?.innerText?.replace(/[·\s]/g, "") ?? undefined;

          return {
            fullName,
            title,
            companyName,
            location,
            profileUrl: undefined, // Will be extracted from Sales Navigator lead page
            salesNavigatorUrl,
            headline,
            connectionDegree,
            raw: {
              source: "sales_navigator",
              textContent: item.textContent
            }
          };
        })
    );

    return leads.filter((lead) => lead.fullName && lead.salesNavigatorUrl);
  }

  /**
   * Extracts LinkedIn profile URLs from Sales Navigator lead pages.
   * Processes up to 10 leads at a time to avoid overwhelming the browser.
   */
  private async extractLinkedInProfileUrls(salesNavLeads: ExtractedLead[]): Promise<string[]> {
    const context = await this.getContext();
    const profileUrls: string[] = [];
    const batchSize = 10;

    for (let i = 0; i < salesNavLeads.length; i += batchSize) {
      const batch = salesNavLeads.slice(i, i + batchSize);
      logger.debug(
        { batchStart: i, batchSize: batch.length, total: salesNavLeads.length },
        "Processing batch of Sales Navigator leads"
      );

      const batchPromises = batch.map(async (lead) => {
        const page = await context.newPage();
        try {
          if (!lead.salesNavigatorUrl) {
            return null;
          }

          await page.goto(lead.salesNavigatorUrl, {
            waitUntil: "domcontentloaded",
            timeout: this.settings.pageTimeoutMs
          });

          await this.randomDelay();

          // Try multiple selectors to find the LinkedIn profile link
          const profileUrl = await page.evaluate(() => {
            // Look for "View profile on LinkedIn" link or similar
            const selectors = [
              'a[href*="linkedin.com/in/"]',
              'a[data-control-name="view_linkedin"]',
              'a[aria-label*="View"][aria-label*="LinkedIn"]',
              'a[href*="/in/"][href*="linkedin.com"]'
            ];

            for (const selector of selectors) {
              const link = document.querySelector<HTMLAnchorElement>(selector);
              if (link?.href && link.href.includes("linkedin.com/in/")) {
                return link.href;
              }
            }

            // Fallback: search all links
            const allLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"));
            const profileLink = allLinks.find(
              (link) => link.href.includes("linkedin.com/in/") && !link.href.includes("/sales/")
            );
            return profileLink?.href || null;
          });

          if (profileUrl) {
            logger.debug(
              { salesNavUrl: lead.salesNavigatorUrl, profileUrl },
              "Extracted LinkedIn profile URL from Sales Navigator lead page"
            );
            // Store the profile URL back in the lead for later reference
            lead.profileUrl = profileUrl;
            return profileUrl;
          } else {
            logger.warn(
              { salesNavUrl: lead.salesNavigatorUrl, name: lead.fullName },
              "Could not find LinkedIn profile URL on Sales Navigator lead page"
            );
            return null;
          }
        } catch (error) {
          logger.error(
            { err: error, salesNavUrl: lead.salesNavigatorUrl },
            "Failed to extract LinkedIn profile URL from Sales Navigator lead page"
          );
          return null;
        } finally {
          await page.close();
        }
      });

      const batchResults = await Promise.all(batchPromises);
      profileUrls.push(...batchResults.filter((url): url is string => url !== null));

      // Add delay between batches to avoid rate limiting
      if (i + batchSize < salesNavLeads.length) {
        await this.randomDelay();
      }
    }

    return profileUrls;
  }
}

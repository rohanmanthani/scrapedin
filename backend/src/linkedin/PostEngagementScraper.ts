import { logger } from "../logger.js";
import type { AutomationSettings, LeadRecord } from "../types.js";
import { BaseLinkedInClient } from "./BaseLinkedInClient.js";
import {
  extractComments,
  extractReactors,
  type ExtractedEngagementProfile
} from "./parsers/postEngagement.js";
import { extractProfileDetails, type ExtractedProfileDetails } from "./parsers/profile.js";
import {
  LinkedInProfileStagehandAnalyzer,
  type LinkedInStagehandAnalysis
} from "./stagehand/LinkedInProfileStagehandAnalyzer.js";
import type { BrowserContext, Page } from "playwright";

interface PostEngagementInput {
  taskId: string;
  taskName?: string;
  postUrls: string[];
  leadListName?: string;
  scrapeReactions: boolean;
  scrapeCommenters: boolean;
  maxProfiles?: number;
}

type ReactorProfiles = ReturnType<typeof extractReactors>;
type CommentProfiles = ReturnType<typeof extractComments>;

const REACTOR_ROW_SELECTOR =
  "li.reactor-entry, li.social-details-reactors-tab__list-item, li[data-test-reaction-row='true'], li.artdeco-list__item, li[data-id='reactor']";
const REACTOR_SCROLL_CONTAINERS = [
  ".social-details-reactors-modal__list",
  ".reactions-tab-body",
  ".artdeco-modal__content"
];
const REACTOR_PAGE_SCROLL_CONTAINERS = [
  ".social-details-reactors-tab__content",
  ".scaffold-finite-scroll__content",
  "body"
];
const REACTION_TRIGGER_SELECTORS = [
  "button[data-test-reactions-list-button]",
  "button[aria-label*=' reactions']",
  "button[aria-label*='reacted']",
  "button.social-details-social-counts__count",
  "span[role='button'][aria-label*=' reactions']",
  "span[role='button'][aria-label*='reacted']",
  "li.social-details-social-counts__reactions button",
  "li.social-details-social-counts__reactions span[role='button']"
];
const REACTION_FALLBACK_SELECTORS = [
  "button[aria-label*='Commenters']",
  "button[data-control-name='comments_tally']",
  "button[aria-label*='Like by']",
  "a[href*='reactors'] span",
  "button.insight__social-counts-item",
  "button[data-test-id='social-counts-reactions']"
];

const COMMENT_ROW_SELECTOR =
  "article.comments-comment-item, li.comments-comments-list__comment-item, div.comments-comment-item, li[data-id^='urn:li:comment:'], article.feed-shared-update-v2__comment-item";
const COMMENT_LOAD_MORE_SELECTORS = [
  "button.comments-comments-list__load-more-comments-button",
  "button.comments-comments-list__load-previous-comments-button",
  "button[data-control-name='load_more_comments']",
  "button[aria-label*='more comments']",
  "button[aria-label*='Load previous comments']"
];
const COMMENT_SEE_MORE_SELECTORS = [
  "button.comments-comment-item__read-more",
  "button[aria-label='See more']",
  "button[data-control-name='expand_comment']"
];

export class PostEngagementScraper extends BaseLinkedInClient {
  private readonly profileDetailCache = new Map<string, ExtractedProfileDetails | null>();
  private readonly stagehandAnalyzer = new LinkedInProfileStagehandAnalyzer();

  constructor(settings: AutomationSettings) {
    super(settings);
  }

  async scrape(input: PostEngagementInput): Promise<LeadRecord[]> {
    const context = await this.getContext();
    const limit =
      input.maxProfiles && input.maxProfiles > 0
        ? input.maxProfiles
        : (this.settings.resultsPerPage ?? 25);
    const aggregated: LeadRecord[] = [];
    const dedupe = new Set<string>();

    for (const rawPostUrl of input.postUrls) {
      const normalizedPostUrl = this.normalizePostUrl(rawPostUrl);
      const page = await context.newPage();
      try {
        logger.info({ postUrl: normalizedPostUrl }, "Scraping LinkedIn post engagement");
        await page.goto(normalizedPostUrl, {
          waitUntil: "domcontentloaded",
          timeout: this.settings.pageTimeoutMs
        });
        await this.randomDelay();

        if (input.scrapeReactions) {
          const reactors = await this.collectReactors(context, page, normalizedPostUrl, limit);
          const enrichedReactors = await this.enrichEngagementProfiles(context, reactors);
          this.mergeLeads(
            aggregated,
            dedupe,
            this.mapReactorProfiles(enrichedReactors, input, normalizedPostUrl)
          );
        }

        if (input.scrapeCommenters) {
          const commenters = await this.collectCommenters(page, normalizedPostUrl, limit);
          const enrichedCommenters = await this.enrichEngagementProfiles(context, commenters);
          this.mergeLeads(
            aggregated,
            dedupe,
            this.mapCommentProfiles(enrichedCommenters, input, normalizedPostUrl)
          );
          logger.info(
            { postUrl: normalizedPostUrl, commenters: commenters.length },
            "Collected post commenters"
          );
        }
      } catch (error) {
        logger.error({ err: error, postUrl: rawPostUrl }, "Failed to scrape post engagement");
      } finally {
        await page.close();
        await this.randomDelay();
      }
      logger.info(
        {
          postUrl: normalizedPostUrl,
          collectedLeads: aggregated.length
        },
        "Completed post engagement scrape for URL"
      );
    }

    return aggregated;
  }

  private mergeLeads(target: LeadRecord[], seen: Set<string>, leads: LeadRecord[]): void {
    for (const lead of leads) {
      const key = lead.profileUrl.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      target.push(lead);
    }
  }

  private needsProfileEnrichment(profile: ExtractedEngagementProfile): boolean {
    const hasValidName = Boolean(profile.fullName && profile.fullName.length > 1);
    const needsNameCleanup = /\bView\b.*profile\b/i.test(profile.fullName ?? "");
    const missingHeadline = !profile.headline || profile.headline.length < 2;
    const invalidLocation =
      !profile.location ||
      profile.location.length < 2 ||
      /\b(?:connection|degree)\b/i.test(profile.location) ||
      (profile.headline && profile.location?.trim() === profile.headline.trim());
    const missingLocation = invalidLocation;
    const missingCompany = !profile.currentCompany;
    const missingEmail = !profile.email;
    const missingProfileImage = !profile.profileImageUrl;
    return (
      !hasValidName ||
      needsNameCleanup ||
      missingHeadline ||
      missingLocation ||
      missingCompany ||
      missingEmail ||
      missingProfileImage
    );
  }

  private hasFullName(
    profile: ExtractedEngagementProfile
  ): profile is ExtractedEngagementProfile & { fullName: string } {
    return typeof profile.fullName === "string" && profile.fullName.trim().length > 0;
  }

  private async enrichEngagementProfiles<T extends ExtractedEngagementProfile>(
    context: BrowserContext,
    profiles: T[]
  ): Promise<T[]> {
    const PARALLEL_LIMIT = 10;
    const results: T[] = [];

    // Separate profiles into those that need enrichment and those that don't
    const profilesToEnrich: Array<{ profile: T; index: number }> = [];
    const profileMap = new Map<number, T>();

    for (let i = 0; i < profiles.length; i++) {
      const profile = profiles[i];

      if (!profile.profileUrl || !this.needsProfileEnrichment(profile)) {
        profileMap.set(i, profile);
        continue;
      }

      const cacheKey = profile.profileUrl.toLowerCase();
      const cached = this.profileDetailCache.get(cacheKey);

      if (cached === null && this.profileDetailCache.has(cacheKey)) {
        // Previously failed to fetch, use as-is
        profileMap.set(i, profile);
        continue;
      }

      if (cached) {
        // Use cached details
        profileMap.set(i, {
          ...profile,
          fullName: cached.fullName ?? profile.fullName,
          headline: cached.headline ?? profile.headline,
          location: cached.location ?? profile.location,
          currentTitle:
            cached.currentTitle ?? profile.currentTitle ?? cached.headline ?? profile.headline,
          currentCompany: cached.currentCompany ?? profile.currentCompany,
          currentCompanyUrl: cached.currentCompanyUrl ?? profile.currentCompanyUrl,
          profileImageUrl: cached.profileImageUrl ?? profile.profileImageUrl,
          email: cached.email ?? profile.email,
          enrichedDetails: cached
        });
        continue;
      }

      // Needs to be fetched
      profilesToEnrich.push({ profile, index: i });
    }

    // Process profiles in parallel batches
    logger.info(
      {
        total: profiles.length,
        cached: profiles.length - profilesToEnrich.length,
        toEnrich: profilesToEnrich.length
      },
      "Enriching engagement profiles in parallel"
    );

    for (let i = 0; i < profilesToEnrich.length; i += PARALLEL_LIMIT) {
      const batch = profilesToEnrich.slice(i, i + PARALLEL_LIMIT);

      await Promise.all(
        batch.map(async ({ profile, index }) => {
          const cacheKey = profile.profileUrl!.toLowerCase();

          try {
            const details = await this.fetchProfileDetails(context, profile.profileUrl!);
            this.profileDetailCache.set(cacheKey, details);

            if (!details) {
              profileMap.set(index, profile);
              return;
            }

            profileMap.set(index, {
              ...profile,
              fullName: details.fullName ?? profile.fullName,
              headline: details.headline ?? profile.headline,
              location: details.location ?? profile.location,
              currentTitle:
                details.currentTitle ??
                profile.currentTitle ??
                details.headline ??
                profile.headline,
              currentCompany: details.currentCompany ?? profile.currentCompany,
              currentCompanyUrl: details.currentCompanyUrl ?? profile.currentCompanyUrl,
              profileImageUrl: details.profileImageUrl ?? profile.profileImageUrl,
              email: details.email ?? profile.email,
              enrichedDetails: details
            });
          } catch (error) {
            logger.warn(
              { err: error, profileUrl: profile.profileUrl },
              "Failed to enrich profile in parallel batch"
            );
            this.profileDetailCache.set(cacheKey, null);
            profileMap.set(index, profile);
          }
        })
      );

      logger.debug(
        {
          processed: Math.min(i + PARALLEL_LIMIT, profilesToEnrich.length),
          total: profilesToEnrich.length
        },
        "Processed parallel batch of profile enrichments"
      );
    }

    // Reconstruct results in original order
    for (let i = 0; i < profiles.length; i++) {
      const enriched = profileMap.get(i);
      if (enriched) {
        results.push(enriched);
      }
    }

    return results;
  }

  private async fetchProfileDetails(
    context: BrowserContext,
    profileUrl: string
  ): Promise<ExtractedProfileDetails | null> {
    const page = await context.newPage();
    try {
      logger.debug({ profileUrl }, "Fetching LinkedIn profile details for enrichment");
      await page.goto(profileUrl, {
        waitUntil: "domcontentloaded",
        timeout: this.settings.pageTimeoutMs
      });
      await this.randomDelay();
      try {
        await page.waitForSelector("main", {
          timeout: Math.min(this.settings.pageTimeoutMs, 8000)
        });
      } catch {
        // Ignore if the main selector does not appear quickly; we'll attempt extraction anyway.
      }
      await this.openContactInfo(page);

      const html = await page.content();
      const stagehandAnalysis = this.stagehandAnalyzer.analyzeHtml(html);
      const legacyDetails = await page.evaluate(extractProfileDetails);
      const details = this.mergeProfileDetails(stagehandAnalysis, legacyDetails);

      logger.debug(
        {
          profileUrl,
          experiencesCount: details.experiences?.length ?? 0,
          extractedTitle: details.currentTitle,
          extractedCompany: details.currentCompany,
          stagehandWarnings: stagehandAnalysis.metadata.warnings
        },
        "Enriched profile details for engagement lead"
      );

      return details;
    } catch (error) {
      logger.warn({ err: error, profileUrl }, "Unable to enrich profile from LinkedIn page");
      return null;
    } finally {
      await page.close();
    }
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

    await this.randomDelay();
    try {
      await page.waitForSelector(
        "section.pv-contact-info__contact-type, section[data-test-id='profile-contact-info'], div.artdeco-modal__content",
        { timeout: Math.min(this.settings.pageTimeoutMs / 2, 6000) }
      );
    } catch {
      // Contact info modal may not be available for all profiles.
    }
  }

  private mergeProfileDetails(
    stagehandAnalysis: LinkedInStagehandAnalysis,
    legacyDetails: ExtractedProfileDetails
  ): ExtractedProfileDetails {
    const getStagehandField = (fieldName: string): string | undefined => {
      const field = stagehandAnalysis.fields.find((f) => f.field === fieldName);
      return field?.value;
    };

    const stagehandExperiences = stagehandAnalysis.experiences.map((exp) => ({
      title: exp.fields.title.value ?? "",
      company: exp.fields.company.value ?? "",
      companyUrl: exp.fields.companyUrl.value,
      startDate: undefined,
      endDate: exp.isCurrent ? undefined : "",
      dateRangeText: exp.fields.dateRange.value,
      location: exp.fields.location.value,
      description: undefined
    }));

    return {
      fullName: getStagehandField("fullName") || legacyDetails.fullName,
      headline: getStagehandField("headline") || legacyDetails.headline,
      location: getStagehandField("location") || legacyDetails.location,
      profileImageUrl: getStagehandField("profileImageUrl") || legacyDetails.profileImageUrl,
      currentTitle: getStagehandField("currentTitle") || legacyDetails.currentTitle,
      currentCompany: getStagehandField("currentCompany") || legacyDetails.currentCompany,
      currentCompanyUrl: getStagehandField("currentCompanyUrl") || legacyDetails.currentCompanyUrl,
      experiences: stagehandExperiences.length > 0 ? stagehandExperiences : legacyDetails.experiences,
      currentCompanyStartedAt: legacyDetails.currentCompanyStartedAt,
      email: legacyDetails.email,
      phoneNumbers: legacyDetails.phoneNumbers,
      birthday: legacyDetails.birthday,
      education: legacyDetails.education,
      connectionsText: legacyDetails.connectionsText,
      connectionCount: legacyDetails.connectionCount,
      followersText: legacyDetails.followersText,
      followerCount: legacyDetails.followerCount
    };
  }

  private normalizePostUrl(url: string): string {
    const trimmed = url.trim();
    if (!trimmed) {
      throw new Error("Post URL cannot be empty");
    }
    let parsed: URL;
    try {
      parsed = trimmed.startsWith("http")
        ? new URL(trimmed)
        : new URL(trimmed.startsWith("/") ? trimmed : `/${trimmed}`, "https://www.linkedin.com");
    } catch {
      throw new Error(`Invalid LinkedIn post URL: ${url}`);
    }
    parsed.search = "";
    parsed.hash = "";
    if (!parsed.pathname.endsWith("/")) {
      parsed.pathname = `${parsed.pathname}/`;
    }
    return parsed.toString();
  }

  private async collectReactors(
    context: BrowserContext,
    page: Page,
    postUrl: string,
    limit: number
  ): Promise<ReactorProfiles> {
    logger.info({ postUrl }, "Starting reactor collection");

    // First, check for direct reactor page link
    const directLink = await page.$("a[href*='reactor'], a[href*='reactors']");
    if (directLink) {
      const href = await directLink.getAttribute("href");
      await directLink.dispose();
      if (href) {
        logger.info({ postUrl, reactorPageUrl: href }, "Found direct reactor page link");
        return await this.scrapeReactorPage(context, new URL(href, postUrl).toString(), limit);
      }
    }

    // Debug: Check what elements are available
    const availableButtons = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button, span[role='button']"));
      return buttons
        .filter((btn) => {
          const text = btn.textContent?.toLowerCase() || "";
          const ariaLabel = btn.getAttribute("aria-label")?.toLowerCase() || "";
          return (
            text.includes("reaction") ||
            text.includes("like") ||
            ariaLabel.includes("reaction") ||
            ariaLabel.includes("like") ||
            ariaLabel.includes("reacted")
          );
        })
        .map((btn) => ({
          tag: btn.tagName,
          class: btn.className,
          ariaLabel: btn.getAttribute("aria-label"),
          text: btn.textContent?.trim().substring(0, 50)
        }));
    });

    logger.debug({ postUrl, availableButtons }, "Available reaction buttons on page");

    // Wait for social counts area to be visible
    await this.waitForSelectorGroup(page, [
      ...REACTION_TRIGGER_SELECTORS,
      ...REACTION_FALLBACK_SELECTORS
    ]);

    const modalSelectors = [
      ...REACTION_TRIGGER_SELECTORS,
      ...REACTION_FALLBACK_SELECTORS,
      "button[aria-label*='likes']",
      "button[data-control-name='likes_count']",
      "button[data-control-name='reactions_count']",
      "button[data-id='reactions-count']",
      "button.social-details-social-counts__reactions-count",
      "span[role='button'].social-details-social-counts__reactions-count"
    ];

    logger.debug(
      { postUrl, selectorCount: modalSelectors.length },
      "Attempting to click reaction trigger"
    );

    let clicked = await this.clickIfExists(page, modalSelectors);

    if (!clicked) {
      logger.info(
        { postUrl },
        "First click attempt failed, scrolling to social counts and retrying"
      );

      // Scroll near the social counts footer and retry
      await page.evaluate(() => {
        const counts = document.querySelector(".social-details-social-counts");
        if (counts) {
          counts.scrollIntoView({ block: "center", behavior: "instant" });
        } else {
          window.scrollBy(0, window.innerHeight * 0.5);
        }
      });
      await this.randomDelay();
      clicked = await this.clickIfExists(page, modalSelectors);
    }

    if (!clicked) {
      // Try to find ANY clickable element with reaction text
      logger.warn({ postUrl }, "Standard selectors failed, trying generic reaction finder");

      clicked = await page.evaluate(() => {
        const allElements = Array.from(document.querySelectorAll("button, span[role='button'], a"));
        for (const el of allElements) {
          const ariaLabel = el.getAttribute("aria-label")?.toLowerCase() || "";
          const text = el.textContent?.toLowerCase() || "";

          if (
            ariaLabel.includes("reaction") ||
            ariaLabel.includes("reacted") ||
            (ariaLabel.includes("like") && !ariaLabel.includes("unlike")) ||
            text.includes("reaction") ||
            text.includes("reacted")
          ) {
            if (el instanceof HTMLElement) {
              el.click();
              return true;
            }
          }
        }
        return false;
      });

      if (clicked) {
        logger.info({ postUrl }, "Successfully clicked via generic finder");
        await this.randomDelay();
      }
    }

    if (!clicked) {
      logger.error(
        { postUrl, availableButtons },
        "Unable to open reactions modal; trigger not found after all attempts. Check available buttons in logs."
      );

      // Save screenshot for debugging
      try {
        const screenshotPath = `debug-post-${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        logger.info({ postUrl, screenshotPath }, "Saved debug screenshot");
      } catch (err) {
        logger.warn({ err }, "Failed to save debug screenshot");
      }

      return [];
    }

    logger.info({ postUrl }, "Reaction button clicked, waiting for modal to appear");

    const modalSelector =
      "div.social-details-reactors-modal, div.reactions-modal, div.artdeco-modal, div[role='dialog']";

    try {
      await page.waitForSelector(modalSelector, { timeout: this.settings.pageTimeoutMs });
      logger.info({ postUrl }, "Modal appeared successfully");
    } catch (err) {
      logger.error({ postUrl, err }, "Modal did not appear after clicking reaction button");

      // Check what's on page
      const pageContent = await page.evaluate(() => {
        return {
          modals: Array.from(document.querySelectorAll("div[role='dialog'], .artdeco-modal")).map(
            (m) => m.className
          ),
          bodyClasses: document.body.className
        };
      });
      logger.debug({ postUrl, pageContent }, "Page state after failed modal wait");

      return [];
    }

    logger.info({ postUrl, limit }, "Scrolling within modal to load reactors");
    await this.scrollWithinContainer(page, REACTOR_SCROLL_CONTAINERS, limit);
    await this.waitForRows(page, REACTOR_ROW_SELECTOR);

    logger.info({ postUrl }, "Extracting reactor data from modal");
    const extracted = await page.evaluate(extractReactors, {
      limit,
      origin: postUrl
    });

    logger.info({ postUrl, reactorCount: extracted.length }, "Extracted reactors from modal");

    await this.dismissModal(page, modalSelector);

    logger.info({ postUrl, reactors: extracted.length }, "Collected post reactors from modal");

    return extracted;
  }

  private async scrapeReactorPage(
    context: BrowserContext,
    url: string,
    limit: number
  ): Promise<ReactorProfiles> {
    const page = await context.newPage();
    let extracted: ReactorProfiles = [];
    try {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: this.settings.pageTimeoutMs
      });
      await this.randomDelay();
      await this.scrollWithinContainer(page, REACTOR_PAGE_SCROLL_CONTAINERS, limit);
      await this.waitForRows(page, REACTOR_ROW_SELECTOR);
      extracted = await page.evaluate(extractReactors, {
        limit,
        origin: url
      });
      logger.info(
        { url, reactors: extracted.length },
        "Collected post reactors from dedicated page"
      );
      return extracted;
    } catch (error) {
      logger.error({ err: error, url }, "Failed to scrape reactors page");
      return [];
    } finally {
      await page.close();
    }
  }

  private async collectCommenters(
    page: Page,
    postUrl: string,
    limit: number
  ): Promise<CommentProfiles> {
    logger.info({ postUrl, limit }, "Starting commenter collection");

    // First, scroll down to make sure comments section is visible and loads
    logger.debug("Scrolling to comments section");
    await page.evaluate(() => {
      // Try to find comments section with multiple selectors
      const commentsSectionSelectors = [
        ".comments-comments-list",
        ".social-details-social-activity",
        "section[data-test-id='comments-section']",
        ".comments-container",
        "div[id*='comments']",
        "section.comments"
      ];

      let commentsSection = null;
      for (const selector of commentsSectionSelectors) {
        commentsSection = document.querySelector(selector);
        if (commentsSection) break;
      }

      if (commentsSection) {
        commentsSection.scrollIntoView({ block: "center", behavior: "smooth" });
      } else {
        // If no comments section found, scroll to bottom to trigger lazy loading
        window.scrollTo(0, document.body.scrollHeight);
      }
    });
    await this.randomDelay();

    // Wait a bit more for comments to lazy load
    await this.randomDelay();

    // Try to wait for comments section to appear
    try {
      await page.waitForSelector(
        ".comments-comments-list, .social-details-social-activity, article.comments-comment-item, div.comments-comment-item",
        { timeout: Math.min(this.settings.pageTimeoutMs / 2, 10_000) }
      );
      logger.debug("Comments section found on page");
    } catch {
      logger.warn(
        { postUrl },
        "Comments section did not appear after scrolling - post may have no comments"
      );
    }

    // Debug: Check what comment elements are available
    const availableComments = await page.evaluate(() => {
      const selectors = [
        "article.comments-comment-item",
        "li.comments-comments-list__comment-item",
        "div.comments-comment-item",
        "li[data-id^='urn:li:comment:']",
        "article.feed-shared-update-v2__comment-item"
      ];

      const results: { selector: string; count: number }[] = [];
      for (const selector of selectors) {
        const count = document.querySelectorAll(selector).length;
        if (count > 0) {
          results.push({ selector, count });
        }
      }

      // Also check for load more buttons
      const loadMoreButtons = Array.from(document.querySelectorAll("button"))
        .filter((btn) => {
          const text = btn.textContent?.toLowerCase() || "";
          const ariaLabel = btn.getAttribute("aria-label")?.toLowerCase() || "";
          return (
            text.includes("comment") ||
            ariaLabel.includes("comment") ||
            text.includes("more") ||
            text.includes("previous")
          );
        })
        .map((btn) => ({
          text: btn.textContent?.trim().substring(0, 50),
          ariaLabel: btn.getAttribute("aria-label"),
          class: btn.className
        }));

      return { comments: results, loadMoreButtons };
    });

    logger.debug(
      { postUrl, availableComments },
      "Available comments and load more buttons before expansion"
    );

    await this.expandComments(page, limit);
    await this.waitForRows(page, COMMENT_ROW_SELECTOR);

    const extracted = await page.evaluate(extractComments, {
      limit,
      origin: postUrl
    });

    logger.info({ postUrl, commenterCount: extracted.length }, "Extracted commenters from post");

    if (extracted.length === 0) {
      logger.warn(
        { postUrl, availableComments },
        "Zero commenters extracted. Post may have no comments, or selectors need updating."
      );

      // Save screenshot for debugging
      try {
        const screenshotPath = `debug-comments-${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        logger.info({ postUrl, screenshotPath }, "Saved debug screenshot for comments");
      } catch (err) {
        logger.warn({ err }, "Failed to save debug screenshot for comments");
      }

      // Log page structure for debugging
      const pageStructure = await page.evaluate(() => {
        return {
          hasCommentsSection: !!document.querySelector(
            ".comments-comments-list, .social-details-social-activity"
          ),
          totalButtons: document.querySelectorAll("button").length,
          bodyText: document.body.textContent?.substring(0, 500)
        };
      });
      logger.debug({ postUrl, pageStructure }, "Page structure for debugging zero comments");
    }

    return extracted;
  }

  private async expandComments(page: Page, limit: number): Promise<void> {
    logger.info({ limit }, "Expanding comments to load more");

    // Scroll page a bit to trigger lazy loading of comments
    await page.evaluate(() => {
      window.scrollBy(0, 500);
    });
    await this.randomDelay();

    let previousCount = 0;
    let stuckCount = 0;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      // Try standard selectors first
      let expanded = await this.clickIfExists(page, COMMENT_LOAD_MORE_SELECTORS);

      // If standard selectors failed, try generic finder
      if (!expanded) {
        logger.debug("Standard load more selectors failed, trying generic finder");
        expanded = await page.evaluate(() => {
          const allButtons = Array.from(document.querySelectorAll("button, span[role='button']"));
          for (const btn of allButtons) {
            const text = btn.textContent?.toLowerCase() || "";
            const ariaLabel = btn.getAttribute("aria-label")?.toLowerCase() || "";

            if (
              (text.includes("load") && text.includes("comment")) ||
              (text.includes("more") && text.includes("comment")) ||
              (text.includes("previous") && text.includes("comment")) ||
              (ariaLabel.includes("load") && ariaLabel.includes("comment")) ||
              text.includes("show more comments") ||
              text.includes("view more comments")
            ) {
              if (btn instanceof HTMLElement) {
                btn.click();
                return true;
              }
            }
          }
          return false;
        });
      }

      if (!expanded) {
        logger.debug({ attempt }, "No more 'load more comments' buttons found");
        break;
      }

      logger.debug({ attempt }, "Clicked load more comments button, waiting for new comments");
      await this.randomDelay();

      const count = await page.evaluate((selectors: string[]) => {
        return selectors
          .map((selector) => document.querySelectorAll(selector).length)
          .reduce((total, value) => total + value, 0);
      }, COMMENT_SELECTORS_FOR_LENGTH);

      logger.debug(
        { attempt, commentCount: count, limit },
        "Current comment count after expansion"
      );

      // Check if we're stuck (no new comments loaded)
      if (count === previousCount) {
        stuckCount++;
        if (stuckCount >= 3) {
          logger.warn("Comments not loading after clicking load more button 3 times, stopping");
          break;
        }
      } else {
        stuckCount = 0;
      }
      previousCount = count;

      if (count >= limit) {
        logger.info({ count, limit }, "Reached comment limit");
        break;
      }
    }

    // Expand truncated comment text (see more buttons)
    logger.debug("Expanding truncated comment text");
    await this.expandAll(page, COMMENT_SEE_MORE_SELECTORS);

    // Final count
    const finalCount = await page.evaluate((selectors: string[]) => {
      return selectors
        .map((selector) => document.querySelectorAll(selector).length)
        .reduce((total, value) => total + value, 0);
    }, COMMENT_SELECTORS_FOR_LENGTH);

    logger.info({ finalCount }, "Comment expansion complete");
  }

  private async scrollWithinContainer(
    page: Page,
    selectors: string[],
    limit: number
  ): Promise<void> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const scrolled = await page.evaluate(
        ({ selectors: sel, limit: target }) => {
          const containers = sel
            .map((selector) => document.querySelector(selector))
            .filter((element): element is Element => Boolean(element));
          if (containers.length === 0) {
            window.scrollBy(0, window.innerHeight * 0.8);
            return false;
          }
          let scrolledAny = false;
          for (const container of containers) {
            const currentCount = container.querySelectorAll("li").length;
            if (target && currentCount >= target) {
              continue;
            }
            container.scrollTop += container.clientHeight * 0.9;
            scrolledAny = true;
          }
          return scrolledAny;
        },
        { selectors, limit }
      );

      if (!scrolled) {
        break;
      }
      await this.randomDelay();
    }
  }

  private async waitForRows(page: Page, selector: string): Promise<void> {
    try {
      await page.waitForSelector(selector, {
        timeout: Math.max(this.settings.pageTimeoutMs / 2, 10_000)
      });
    } catch {
      logger.warn({ selector }, "Timed out waiting for engagement rows to render");
    }
  }

  private async waitForSelectorGroup(page: Page, selectors: string[]): Promise<void> {
    if (!selectors.length) {
      return;
    }
    const combined = selectors.join(",");
    try {
      await page.waitForSelector(combined, {
        timeout: Math.max(this.settings.pageTimeoutMs / 3, 8_000)
      });
    } catch {
      logger.warn({ selectors: combined }, "Timed out waiting for selector group");
    }
  }

  private async expandAll(page: Page, selectors: string[]): Promise<void> {
    for (const selector of selectors) {
      const buttons = await page.$$(selector);
      if (!buttons.length) {
        continue;
      }
      for (const button of buttons) {
        try {
          await button.click({ delay: 20 });
        } catch {
          // Ignore failures when button disappears.
        } finally {
          await button.dispose();
        }
      }
      await this.randomDelay();
    }
  }

  private async dismissModal(page: Page, modalSelector: string): Promise<void> {
    const closeSelectors = [
      `${modalSelector} button[aria-label='Close']`,
      `${modalSelector} button[aria-label='Dismiss']`,
      `${modalSelector} button.artdeco-modal__dismiss`
    ];
    const closed = await this.clickIfExists(page, closeSelectors);
    if (!closed) {
      await page.keyboard.press("Escape").catch(() => undefined);
    }
  }

  private async clickIfExists(page: Page, selectors: string[]): Promise<boolean> {
    for (const selector of selectors) {
      try {
        const handle = await page.$(selector);
        if (handle) {
          const isVisible = await handle.isVisible().catch(() => false);
          if (!isVisible) {
            await handle.dispose();
            continue;
          }

          logger.debug({ selector }, "Found and clicking element");
          await handle.click({ delay: 50 });
          await handle.dispose();
          return true;
        }
      } catch (err) {
        logger.debug({ selector, err }, "Failed to click selector");
        continue;
      }
    }
    return false;
  }

  private mapReactorProfiles(
    profiles: ReactorProfiles,
    input: PostEngagementInput,
    postUrl: string
  ): LeadRecord[] {
    const timestamp = new Date().toISOString();
    return profiles
      .filter(
        (profile): profile is ExtractedEngagementProfile & { fullName: string } =>
          Boolean(profile.profileUrl) && this.hasFullName(profile)
      )
      .map((profile) => {
        const id = `${input.taskId}:${profile.profileUrl}`;
        return {
          id,
          presetId: input.taskId,
          profileUrl: profile.profileUrl,
          fullName: profile.fullName,
          title: profile.currentTitle ?? profile.headline,
          headline: profile.headline,
          companyName: profile.currentCompany,
          companyUrl: profile.currentCompanyUrl,
          location: profile.location,
          email: profile.email,
          capturedAt: timestamp,
          raw: {
            source: "post_engagement",
            engagement: "reaction",
            postUrl,
            leadListName: input.leadListName,
            reactionLabel: profile.reactionLabel,
            profile: profile as unknown as Record<string, unknown>
          },
          taskName: input.taskName
        };
      });
  }

  private mapCommentProfiles(
    profiles: CommentProfiles,
    input: PostEngagementInput,
    postUrl: string
  ): LeadRecord[] {
    const timestamp = new Date().toISOString();
    return profiles
      .filter(
        (profile): profile is ExtractedEngagementProfile & { fullName: string } =>
          Boolean(profile.profileUrl) && this.hasFullName(profile)
      )
      .map((profile) => {
        const id = `${input.taskId}:${profile.profileUrl}:comment`;
        return {
          id,
          presetId: input.taskId,
          profileUrl: profile.profileUrl,
          fullName: profile.fullName,
          title: profile.currentTitle ?? profile.headline,
          headline: profile.headline,
          companyName: profile.currentCompany,
          companyUrl: profile.currentCompanyUrl,
          location: profile.location,
          email: profile.email,
          capturedAt: timestamp,
          raw: {
            source: "post_engagement",
            engagement: "comment",
            postUrl,
            leadListName: input.leadListName,
            commentText: profile.commentText,
            profile: profile as unknown as Record<string, unknown>
          },
          taskName: input.taskName
        };
      });
  }
}

const COMMENT_SELECTORS_FOR_LENGTH = [
  "article.comments-comment-item",
  "li.comments-comments-list__comment-item",
  "div.comments-comment-item"
];

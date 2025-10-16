import { logger } from "../logger.js";
import type { AutomationSettings, LeadRecord } from "../types.js";
import { BaseLinkedInClient } from "./BaseLinkedInClient.js";
import { extractComments, extractReactors } from "./parsers/postEngagement.js";
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
  constructor(settings: AutomationSettings) {
    super(settings);
  }

  async scrape(input: PostEngagementInput): Promise<LeadRecord[]> {
    const context = await this.getContext();
    const limit = input.maxProfiles && input.maxProfiles > 0 ? input.maxProfiles : this.settings.resultsPerPage ?? 25;
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
          this.mergeLeads(
            aggregated,
            dedupe,
            this.mapReactorProfiles(reactors, input, normalizedPostUrl)
          );
        }

        if (input.scrapeCommenters) {
          const commenters = await this.collectCommenters(page, normalizedPostUrl, limit);
          this.mergeLeads(
            aggregated,
            dedupe,
            this.mapCommentProfiles(commenters, input, normalizedPostUrl)
          );
          logger.info({ postUrl: normalizedPostUrl, commenters: commenters.length }, "Collected post commenters");
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
    const directLink = await page.$("a[href*='reactor'], a[href*='reactors']");
    if (directLink) {
      const href = await directLink.getAttribute("href");
      await directLink.dispose();
      if (href) {
        return await this.scrapeReactorPage(context, new URL(href, postUrl).toString(), limit);
      }
    }

    await this.waitForSelectorGroup(page, [...REACTION_TRIGGER_SELECTORS, ...REACTION_FALLBACK_SELECTORS]);
    const modalSelectors = [
      ...REACTION_TRIGGER_SELECTORS,
      ...REACTION_FALLBACK_SELECTORS,
      "button[aria-label*='likes']",
      "button[data-control-name='likes_count']",
      "button[data-control-name='reactions_count']",
      "button[data-id='reactions-count']"
    ];
    let clicked = await this.clickIfExists(page, modalSelectors);
    if (!clicked) {
      // Scroll near the social counts footer and retry.
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
      logger.warn({ postUrl }, "Unable to open reactions modal; trigger not found after fallback scroll");
      return [];
    }

    const modalSelector = "div.social-details-reactors-modal, div.reactions-modal, div.artdeco-modal";
    try {
      await page.waitForSelector(modalSelector, { timeout: this.settings.pageTimeoutMs });
    } catch {
      return [];
    }

    await this.scrollWithinContainer(page, REACTOR_SCROLL_CONTAINERS, limit);
    await this.waitForRows(page, REACTOR_ROW_SELECTOR);
    const extracted = await page.evaluate(extractReactors, {
      limit,
      origin: postUrl
    });

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
      logger.info({ url, reactors: extracted.length }, "Collected post reactors from dedicated page");
      return extracted;
    } catch (error) {
      logger.error({ err: error, url }, "Failed to scrape reactors page");
      return [];
    } finally {
      await page.close();
    }
  }

  private async collectCommenters(page: Page, postUrl: string, limit: number): Promise<CommentProfiles> {
    await this.expandComments(page, limit);
    await this.waitForRows(page, COMMENT_ROW_SELECTOR);
    return await page.evaluate(extractComments, {
      limit,
      origin: postUrl
    });
  }

  private async expandComments(page: Page, limit: number): Promise<void> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const expanded = await this.clickIfExists(page, COMMENT_LOAD_MORE_SELECTORS);
      if (!expanded) {
        break;
      }
      await this.randomDelay();

      const count = await page.evaluate((selectors: string[]) => {
        return selectors
          .map((selector) => document.querySelectorAll(selector).length)
          .reduce((total, value) => total + value, 0);
      }, COMMENT_SELECTORS_FOR_LENGTH);

      if (count >= limit) {
        break;
      }
    }

    await this.expandAll(page, COMMENT_SEE_MORE_SELECTORS);
  }

  private async scrollWithinContainer(page: Page, selectors: string[], limit: number): Promise<void> {
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
      const handle = await page.$(selector);
      if (handle) {
        try {
          await handle.click({ delay: 50 });
          return true;
        } finally {
          await handle.dispose();
        }
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
          location: profile.location,
          capturedAt: timestamp,
          raw: {
            source: "post_engagement",
            engagement: "reaction",
            postUrl,
            leadListName: input.leadListName,
            reactionLabel: profile.reactionLabel,
            profile
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
      .filter((profile) => profile.profileUrl && profile.fullName)
      .map((profile) => {
        const id = `${input.taskId}:${profile.profileUrl}:comment`;
        return {
          id,
          presetId: input.taskId,
          profileUrl: profile.profileUrl,
          fullName: profile.fullName,
          title: profile.headline,
          headline: profile.headline,
          location: profile.location,
          capturedAt: timestamp,
          raw: {
            source: "post_engagement",
            engagement: "comment",
            postUrl,
            leadListName: input.leadListName,
            commentText: profile.commentText,
            profile
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

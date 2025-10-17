import type { ExtractedProfileDetails } from "./profile.js";

export interface ExtractedEngagementProfile {
  fullName?: string;
  profileUrl: string;
  headline?: string;
  location?: string;
  currentTitle?: string;
  currentCompany?: string;
  currentCompanyUrl?: string;
  profileImageUrl?: string;
  email?: string;
  reactionLabel?: string;
  commentText?: string;
  enrichedDetails?: ExtractedProfileDetails;
}

export interface EngagementExtractionOptions {
  limit?: number;
  origin?: string;
  root?: ParentNode | null;
}

export function extractReactors(
  options?: EngagementExtractionOptions
): ExtractedEngagementProfile[] {
  const sanitizeFullName = (raw: string): string => {
    if (!raw) {
      return raw;
    }
    let value = raw.replace(/View[\s\S]*?profile/gi, " ");
    value = value.replace(/\b[1-3](?:st|nd|rd|th)?\s+degree\s+connection\b.*$/i, " ");
    value = value.replace(/\b(?:1st|2nd|3rd)\s+degree\s+connection\b.*$/i, " ");
    const separators = ["·", "|", "•"];
    for (const separator of separators) {
      const index = value.indexOf(separator);
      if (index > 0) {
        value = value.slice(0, index);
      }
    }
    value = value.replace(/\s+/g, " ").trim();
    return value;
  };

  const REACTOR_SELECTORS = [
    "li.reactor-entry",
    "li.social-details-reactors-tab__list-item",
    "li[data-test-reaction-row='true']",
    "li.artdeco-list__item",
    "li[data-id='reactor']"
  ];

  const NAME_SELECTORS = [
    ".reactor-entry__member-name",
    ".artdeco-entity-lockup__title span[aria-hidden='true']",
    ".artdeco-entity-lockup__title",
    ".feed-shared-actor__name",
    ".reactions-tab__member-name"
  ];

  const HEADLINE_SELECTORS = [
    ".comments-post-meta__headline",
    ".comments-comment-item__headline",
    ".feed-shared-comment__headline",
    ".reactor-entry__member-headline",
    ".artdeco-entity-lockup__subtitle",
    ".reactions-tab__member-headline"
  ];

  const LOCATION_SELECTORS = [
    ".comments-comment-item__secondary-content",
    ".reactor-entry__member-secondary-title",
    ".artdeco-entity-lockup__caption",
    ".reactions-tab__member-secondary-title"
  ];

  const cleanLocation = (raw: string | undefined): string | undefined => {
    if (!raw) {
      return undefined;
    }
    const cleaned = raw.replace(/\s+/g, " ").trim();
    if (!cleaned) {
      return undefined;
    }
    if (/\b(?:connection|degree|follower)\b/i.test(cleaned)) {
      return undefined;
    }
    if (/^status:/i.test(cleaned)) {
      return undefined;
    }
    return cleaned;
  };

  const ANCHOR_SELECTORS = [
    "a[href*='/in/']",
    "a.comments-comment-item__profile-link",
    "a.artdeco-entity-lockup__subtitle",
    "a.feed-shared-actor__container-link"
  ];

  const getCandidates = function (root: ParentNode, selectors: string[]): Element[] {
    const results: Element[] = [];
    for (const selector of selectors) {
      root.querySelectorAll(selector).forEach((node) => {
        if (node instanceof Element) {
          results.push(node);
        }
      });
    }
    return results;
  };

  const findAnchor = function (element: Element): HTMLAnchorElement | null {
    for (const selector of ANCHOR_SELECTORS) {
      const anchor = element.querySelector?.(selector) as HTMLAnchorElement | null;
      if (anchor) {
        return anchor;
      }
    }
    return null;
  };

  const normalizeUrl = function (raw: string, origin: string): string | undefined {
    if (!raw) {
      return undefined;
    }
    try {
      const url = new URL(raw, origin);
      return url.toString();
    } catch {
      return undefined;
    }
  };

  const extractFirstText = function (element: Element, selectors: string[]): string | undefined {
    for (const selector of selectors) {
      const candidate = element.querySelector(selector);
      const value = candidate?.textContent?.trim();
      if (value) {
        return value;
      }
    }
    return undefined;
  };

  const root = (options?.root ?? document) as ParentNode & {
    querySelectorAll: typeof document.querySelectorAll;
    querySelector: typeof document.querySelector;
  };
  const origin =
    options?.origin ??
    (typeof location !== "undefined" ? location.href : "https://www.linkedin.com/");
  const limit = options?.limit;

  const candidates = getCandidates(root, REACTOR_SELECTORS);
  const results: ExtractedEngagementProfile[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const anchor = findAnchor(candidate);
    if (!anchor) {
      continue;
    }
    const profileUrl = normalizeUrl(anchor.getAttribute("href") ?? "", origin);
    if (!profileUrl || seen.has(profileUrl)) {
      continue;
    }

    const extractedName = extractFirstText(candidate, NAME_SELECTORS);
    const name = sanitizeFullName(extractedName ?? anchor.textContent?.trim() ?? "");

    if (!name) {
      seen.add(profileUrl);
      const headline = extractFirstText(candidate, HEADLINE_SELECTORS);
      let location = cleanLocation(extractFirstText(candidate, LOCATION_SELECTORS));
      if (location && headline && location.trim() === headline.trim()) {
        location = undefined;
      }
      const reactionLabel =
        candidate
          .querySelector("[data-test-reaction-icon]")
          ?.getAttribute("data-test-reaction-icon") ??
        candidate.querySelector(".reactor-entry__reaction-type")?.textContent?.trim() ??
        extractFirstText(candidate, [".reactions-tab__member-reaction-type"]);

      results.push({
        profileUrl,
        headline,
        location,
        reactionLabel: reactionLabel || undefined
      });

      if (typeof limit === "number" && limit > 0 && results.length >= limit) {
        break;
      }
      continue;
    }

    seen.add(profileUrl);

    const headline = extractFirstText(candidate, HEADLINE_SELECTORS);
    let location = cleanLocation(extractFirstText(candidate, LOCATION_SELECTORS));
    if (location && headline && location.trim() === headline.trim()) {
      location = undefined;
    }
    const reactionLabel =
      candidate
        .querySelector("[data-test-reaction-icon]")
        ?.getAttribute("data-test-reaction-icon") ??
      candidate.querySelector(".reactor-entry__reaction-type")?.textContent?.trim() ??
      extractFirstText(candidate, [".reactions-tab__member-reaction-type"]);

    results.push({
      fullName: name,
      profileUrl,
      headline,
      location,
      reactionLabel: reactionLabel || undefined
    });

    if (typeof limit === "number" && limit > 0 && results.length >= limit) {
      break;
    }
  }

  return results;
}

export function extractComments(
  options?: EngagementExtractionOptions
): ExtractedEngagementProfile[] {
  const sanitizeFullName = (raw: string): string => {
    if (!raw) {
      return raw;
    }
    let value = raw.replace(/\bView\s+[^\n]+?\s+profile\b/gi, " ");
    value = value.replace(/\b[1-3](?:st|nd|rd|th)?\s+degree\s+connection\b.*$/i, " ");
    const separators = ["·", "|", "•"];
    for (const separator of separators) {
      const index = value.indexOf(separator);
      if (index > 0) {
        value = value.slice(0, index);
      }
    }
    value = value.replace(/\s+/g, " ").trim();
    return value;
  };

  const COMMENT_SELECTORS = [
    "article.comments-comment-item",
    "li.comments-comments-list__comment-item",
    "div.comments-comment-item",
    "li[data-id^='urn:li:comment:']",
    "article.feed-shared-update-v2__comment-item"
  ];

  const COMMENT_TEXT_SELECTORS = [
    ".comments-comment-item__main-content",
    ".comments-comment-item__body",
    ".update-components-comment-body__comment",
    ".feed-shared-comment__text"
  ];

  const COMMENT_NAME_SELECTORS = [
    ".comments-post-meta__name-text",
    ".comments-comment-item__display-name",
    ".feed-shared-comment__name",
    "a.comments-comment-item__profile-link span",
    "a.comments-comment-item__profile-link"
  ];

  const HEADLINE_SELECTORS = [
    ".comments-post-meta__headline",
    ".comments-comment-item__headline",
    ".feed-shared-comment__headline",
    ".reactor-entry__member-headline",
    ".artdeco-entity-lockup__subtitle",
    ".reactions-tab__member-headline"
  ];

  const LOCATION_SELECTORS = [
    ".comments-comment-item__secondary-content",
    ".reactor-entry__member-secondary-title",
    ".artdeco-entity-lockup__caption",
    ".reactions-tab__member-secondary-title"
  ];

  const ANCHOR_SELECTORS = [
    "a[href*='/in/']",
    "a.comments-comment-item__profile-link",
    "a.artdeco-entity-lockup__subtitle",
    "a.feed-shared-actor__container-link"
  ];

  const getCandidates = (root: ParentNode, selectors: string[]): Element[] => {
    const results: Element[] = [];
    for (const selector of selectors) {
      root.querySelectorAll(selector).forEach((node) => {
        if (node instanceof Element) {
          results.push(node);
        }
      });
    }
    return results;
  };

  const findAnchor = (element: Element): HTMLAnchorElement | null => {
    for (const selector of ANCHOR_SELECTORS) {
      const anchor = element.querySelector?.(selector) as HTMLAnchorElement | null;
      if (anchor) {
        return anchor;
      }
    }
    return null;
  };

  const normalizeUrl = (raw: string, origin: string): string | undefined => {
    if (!raw) {
      return undefined;
    }
    try {
      const url = new URL(raw, origin);
      return url.toString();
    } catch {
      return undefined;
    }
  };

  const extractFirstText = (element: Element, selectors: string[]): string | undefined => {
    for (const selector of selectors) {
      const candidate = element.querySelector(selector);
      const value = candidate?.textContent?.trim();
      if (value) {
        return value;
      }
    }
    return undefined;
  };

  const root = (options?.root ?? document) as ParentNode & {
    querySelectorAll: typeof document.querySelectorAll;
    querySelector: typeof document.querySelector;
  };
  const origin =
    options?.origin ??
    (typeof location !== "undefined" ? location.href : "https://www.linkedin.com/");
  const limit = options?.limit;

  const candidates = getCandidates(root, COMMENT_SELECTORS);
  const results: ExtractedEngagementProfile[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const anchor = findAnchor(candidate);
    if (!anchor) {
      continue;
    }
    const profileUrl = normalizeUrl(anchor.getAttribute("href") ?? "", origin);
    if (!profileUrl || seen.has(profileUrl)) {
      continue;
    }

    const name = sanitizeFullName(
      extractFirstText(candidate, COMMENT_NAME_SELECTORS) ?? anchor.textContent?.trim() ?? ""
    );
    if (!name) {
      continue;
    }

    const commentText = extractFirstText(candidate, COMMENT_TEXT_SELECTORS);

    seen.add(profileUrl);

    const headline = extractFirstText(candidate, HEADLINE_SELECTORS);
    const location = extractFirstText(candidate, LOCATION_SELECTORS);

    results.push({
      fullName: name,
      profileUrl,
      headline,
      location,
      commentText: commentText || undefined
    });

    if (typeof limit === "number" && limit > 0 && results.length >= limit) {
      break;
    }
  }

  return results;
}

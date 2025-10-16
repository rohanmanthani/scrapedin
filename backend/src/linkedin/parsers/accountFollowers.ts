export interface ExtractedAccountProfile {
  fullName: string;
  profileUrl: string;
  headline?: string;
  location?: string;
  companyName?: string;
}

export interface AccountProfileExtractionOptions {
  limit?: number;
  origin?: string;
  root?: ParentNode | null;
}

export function extractAccountProfiles(options?: AccountProfileExtractionOptions): ExtractedAccountProfile[] {
  const CARD_SELECTORS = [
    "li.org-people-profile-card",
    "li.org-people-profile-card__profile-list-item",
    "li[data-test-id='org-people-profile-card']",
    "li[data-ember-action][data-control-name='people_profile_card']"
  ];

  const COMPANY_NAME_SELECTORS = [
    "h1.org-top-card-summary__title",
    "h1.org-top-card-summary__title span",
    "h1.org-top-card-summary__title > div",
    "h1.org-top-card-summary__title > a",
    "div.org-top-card-summary__title h1"
  ];

  const HEADLINE_SELECTORS = [
    ".org-people-profile-card__profile-headline",
    ".org-people-profile-card__profile-title + div",
    ".org-people-profile-card__profile-title ~ div.t-14",
    ".org-people-profile-card__profile-info h4 + div"
  ];

  const LOCATION_SELECTORS = [
    ".org-people-profile-card__profile-location",
    ".org-people-profile-card__profile-title ~ div.t-12",
    ".org-people-profile-card__profile-info .t-12"
  ];

  const ANCHOR_SELECTORS = [
    "a.org-people-profile-card__profile-link",
    "a[href*='/in/']",
    "a[data-control-name='people_profile_card']"
  ];

  const getCompanyName = function (root: ParentNode): string | undefined {
    for (const selector of COMPANY_NAME_SELECTORS) {
      const element = root.querySelector?.(selector);
      const value = element?.textContent?.trim();
      if (value) {
        return value;
      }
    }
    return undefined;
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

  const extractText = (element: Element | null | undefined, selectors: string[]): string | undefined => {
    if (!element || !("querySelector" in element)) {
      return undefined;
    }
    for (const selector of selectors) {
      const target = element.querySelector(selector);
      const value = target?.textContent?.trim();
      if (value) {
        return value;
      }
    }
    return undefined;
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

  const root = (options?.root ?? document) as ParentNode & {
    querySelectorAll: typeof document.querySelectorAll;
    querySelector: typeof document.querySelector;
  };
  const origin =
    options?.origin ??
    (typeof location !== "undefined" ? location.href : "https://www.linkedin.com/");
  const limit = options?.limit;
  const results: ExtractedAccountProfile[] = [];
  const seen = new Set<string>();
  const companyName = getCompanyName(root);

  const candidates: Element[] = [];
  for (const selector of CARD_SELECTORS) {
    root
      .querySelectorAll(selector)
      .forEach((node) => {
        if (node instanceof Element) {
          candidates.push(node);
        }
      });
  }

  if (candidates.length === 0) {
    root
      .querySelectorAll(ANCHOR_SELECTORS.join(","))
      .forEach((node) => {
        if (node instanceof HTMLAnchorElement) {
          const card = node.closest("li");
          if (card) {
            candidates.push(card);
          } else {
            candidates.push(node);
          }
        }
      });
  }

  for (const candidate of candidates) {
    const anchor = findAnchor(candidate);
    if (!anchor) {
      continue;
    }

    const profileUrl = normalizeUrl(anchor.getAttribute("href") ?? "", origin);
    if (!profileUrl || seen.has(profileUrl)) {
      continue;
    }

    const fullName =
      candidate.querySelector(".org-people-profile-card__profile-title")?.textContent?.trim() ??
      anchor.textContent?.trim() ??
      "";
    if (!fullName) {
      continue;
    }

    seen.add(profileUrl);

    const headline = extractText(candidate, HEADLINE_SELECTORS);
    const location = extractText(candidate, LOCATION_SELECTORS);

    results.push({
      fullName,
      profileUrl,
      headline: headline || undefined,
      location: location || undefined,
      companyName
    });

    if (typeof limit === "number" && limit > 0 && results.length >= limit) {
      break;
    }
  }

  return results;
}

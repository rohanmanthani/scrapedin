export interface ExtractedProfileDetails {
  fullName?: string;
  headline?: string;
  location?: string;
  currentTitle?: string;
  currentCompany?: string;
  profileImageUrl?: string;
  email?: string;
}

interface ProfileExtractionOptions {
  root?: ParentNode | null;
}

const cleanText = (value: string | null | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }
  const normalized = value
    .replace(/View[\s\S]*?profile/gi, " ")
    .replace(/\b[1-3](?:st|nd|rd|th)?\s+degree\s+connection\b.*$/i, " ");
  const condensed = normalized.replace(/\s+/g, " ").trim();
  if (!condensed) {
    return undefined;
  }
  return condensed;
};

const getFirstMatch = (root: ParentNode, selectors: string[]): string | undefined => {
  const scopedRoot = root as ParentNode & { querySelector: typeof document.querySelector };
  for (const selector of selectors) {
    const element = scopedRoot.querySelector(selector);
    const text = cleanText(element?.textContent);
    if (text) {
      return text;
    }
  }
  return undefined;
};

const findPrimaryExperience = (root: ParentNode): Element | null => {
  const selectors = [
    "section[id*='experience'] ul.pvs-list > li",
    "section#experience-section ul.pv-profile-section__section-info > li",
    "section.experience__section ul > li",
    "section[data-test='experience-section'] ul > li"
  ];
  const scopedRoot = root as ParentNode & { querySelector: typeof document.querySelector };
  for (const selector of selectors) {
    const element = scopedRoot.querySelector(selector) ?? null;
    if (element instanceof Element) {
      return element;
    }
  }
  return null;
};

const extractFromExperience = (element: Element): { title?: string; company?: string } => {
  const title = getFirstMatch(element, [
    "span[aria-hidden='true']",
    "span.t-14.t-black.t-bold",
    "div.display-flex.flex-column.full-width.align-self-center span:first-child",
    "div[data-test='experience-item'] span[data-field='experience-title']"
  ]);
  const company = getFirstMatch(element, [
    "p.pv-entity__secondary-title",
    "span.t-14.t-normal",
    "span[data-field='experience-company-name']",
    "div.display-flex.flex-column.full-width.align-self-center span:nth-child(2)",
    "span[data-test='experience-entity-company-name']"
  ]);
  return { title, company };
};

const getFirstAttribute = (
  root: ParentNode,
  selectors: string[],
  attribute: string
): string | undefined => {
  const scopedRoot = root as ParentNode & { querySelector: typeof document.querySelector };
  for (const selector of selectors) {
    const element = scopedRoot.querySelector(selector);
    if (element instanceof Element) {
      const value = element.getAttribute(attribute);
      if (value) {
        const trimmed = value.trim();
        if (trimmed) {
          return trimmed;
        }
      }
    }
  }
  return undefined;
};

const cleanEmail = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }
  const email = normalized.replace(/^mailto:/i, "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return undefined;
  }
  return email;
};

export function extractProfileDetails(): ExtractedProfileDetails;
export function extractProfileDetails(options?: ProfileExtractionOptions): ExtractedProfileDetails;
export function extractProfileDetails(options?: ProfileExtractionOptions): ExtractedProfileDetails {
  const root = (options?.root ?? document) as ParentNode & {
    querySelector: typeof document.querySelector;
    querySelectorAll: typeof document.querySelectorAll;
  };

  const fullName = getFirstMatch(root, [
    "h1.text-heading-xlarge",
    "h1.pv-top-card-section__name",
    "h1[data-test-id='hero-title']",
    ".pv-text-details__left-panel h1",
    ".top-card-layout__title"
  ]);

  const headline = getFirstMatch(root, [
    "div.text-body-medium.break-words",
    ".pv-top-card-section__headline",
    ".top-card-layout__headline",
    ".pv-text-details__left-panel div[data-test-id='hero-title-subtitle']",
    "div[data-field='experience-headline']"
  ]);

  let location = getFirstMatch(root, [
    "span.text-body-small.inline.t-black--light.break-words",
    ".pv-top-card__subline-item",
    ".top-card-layout__entity-info span[data-test-id='hero-location']",
    "div[data-field='experience-location']",
    "span[data-test-id='top-card-location']",
    "div[data-test-id='member-location']",
    ".pv-text-details__left-panel span.inline-flex",
    ".pv-top-card--list-bullet span[aria-hidden='true']"
  ]);
  if (location && /connection|follower/i.test(location)) {
    location = undefined;
  }

  let currentCompany = getFirstMatch(root, [
    ".pv-text-details__right-panel li:first-child span[aria-hidden='true']",
    ".pv-text-details__right-panel li:first-child span",
    ".top-card-layout__entity-info-item a[href*='/company/']",
    ".pv-top-card--experience-list a[href*='/company/'] span[aria-hidden='true']",
    "a[data-field='experience_company_logo'] span[aria-hidden='true']"
  ]);

  let currentTitle = getFirstMatch(root, [
    ".pv-top-card--experience-list li span[aria-hidden='true']",
    ".pv-text-details__right-panel li:first-child span[aria-hidden='true']",
    ".top-card-layout__entity-info-item span[aria-hidden='true']",
    ".pv-text-details__right-panel li:first-child span"
  ]);

  const primaryExperience = findPrimaryExperience(root);
  if (primaryExperience) {
    const experience = extractFromExperience(primaryExperience);
    if (!currentTitle && experience.title) {
      currentTitle = experience.title;
    }
    if (!currentCompany && experience.company) {
      currentCompany = experience.company;
    }
  }

  const profileImageUrl = getFirstAttribute(root, [
    "img.profile-photo-edit__preview",
    "img.pv-top-card-profile-picture__image",
    "img[data-test-id='profile-photo']",
    "img.top-card-profile-picture__image",
    "img.profile-photo-edit__preview-image"
  ], "src");

  const contactRoots: ParentNode[] = [root];
  root
    .querySelectorAll(
      "section.pv-contact-info__contact-type, section[data-test-id='profile-contact-info'], div.artdeco-modal__content"
    )
    .forEach((section) => {
      if (section instanceof Element) {
        contactRoots.push(section);
      }
    });
  const email = cleanEmail(
    contactRoots
      .map((contactRoot) =>
        getFirstAttribute(contactRoot, [
          "a[href^='mailto:']",
          "a[data-test-id='top-card-contact-info-email']",
          "a[data-field='email']"
        ], "href")
      )
      .find((value): value is string => Boolean(value))
  );

  return {
    fullName: fullName ?? undefined,
    headline: headline ?? undefined,
    location,
    currentTitle: currentTitle ?? headline ?? undefined,
    currentCompany: currentCompany ?? undefined,
    profileImageUrl: profileImageUrl ?? undefined,
    email
  };
}

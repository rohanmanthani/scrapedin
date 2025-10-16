export interface ExtractedExperience {
  title?: string;
  company?: string;
  location?: string;
  dateRangeText?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}

export interface ExtractedEducation {
  school?: string;
  degree?: string;
  fieldOfStudy?: string;
  dateRangeText?: string;
}

export interface ExtractedProfileDetails {
  fullName?: string;
  headline?: string;
  location?: string;
  currentTitle?: string;
  currentCompany?: string;
  currentCompanyUrl?: string;
  profileImageUrl?: string;
  email?: string;
  phoneNumbers?: string[];
  birthday?: string;
  currentCompanyStartedAt?: string;
  experiences?: ExtractedExperience[];
  education?: ExtractedEducation[];
  connectionsText?: string;
  connectionCount?: number;
  followersText?: string;
  followerCount?: number;
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

const parseDateRangeParts = (value?: string): { startDate?: string; endDate?: string } => {
  if (!value) {
    return {};
  }
  const sanitized = value.replace(/\(.*?\)/g, "").replace(/[\u2013\u2014]/g, "-");
  const [startRaw, endRaw] = sanitized.split(/\s*-\s*/);
  const startDate = cleanText(startRaw ?? undefined);
  let endDate = cleanText(endRaw ?? undefined);
  if (endDate && /present/i.test(endDate)) {
    endDate = undefined;
  }
  return {
    startDate: startDate ?? undefined,
    endDate: endDate ?? undefined
  };
};

const extractExperiences = (root: ParentNode): ExtractedExperience[] => {
  const selectors = [
    "section[id*='experience'] ul.pvs-list > li",
    "section#experience-section ul.pv-profile-section__section-info > li",
    "section.experience__section ul > li",
    "section[data-test='experience-section'] ul > li"
  ];
  const scopedRoot = root as ParentNode & { querySelectorAll: typeof document.querySelectorAll };
  const nodes: Element[] = [];
  selectors.forEach((selector) => {
    scopedRoot.querySelectorAll(selector).forEach((element) => {
      if (element instanceof Element) {
        nodes.push(element);
      }
    });
  });

  return nodes
    .map((element) => {
      const title = getFirstMatch(element, [
        "span[data-test='experience-entity-title']",
        "span[data-field='experience-title']",
        "span[aria-hidden='true']",
        "span.t-14.t-black.t-bold",
        "div.display-flex.flex-column.full-width.align-self-center span:first-child"
      ]);
      const company = getFirstMatch(element, [
        "span[data-test='experience-entity-subtitle']",
        "span[data-field='experience-company-name']",
        "p.pv-entity__secondary-title",
        "span.t-14.t-normal",
        "div.display-flex.flex-column.full-width.align-self-center span:nth-child(2)"
      ]);
      const dateRangeText = getFirstMatch(element, [
        "span[data-test='experience-entity-date-range']",
        "span[data-field='experience-date-range']",
        "span.pvs-entity__caption-wrapper",
        "h4 span.t-14.t-normal.t-black--light",
        "span.t-14.t-normal.t-black--light"
      ]);
      const location = getFirstMatch(element, [
        "span[data-test='experience-entity-location']",
        "span[data-field='experience-location']",
        "span.pv-entity__location",
        "span.t-14.t-normal.t-black--light"
      ]);
      const description = getFirstMatch(element, [
        "div[data-test='experience-entity-description']",
        "div.pv-entity__extra-details",
        "div.pv-entity__description"
      ]);
      const { startDate, endDate } = parseDateRangeParts(dateRangeText);
      return {
        title,
        company,
        location,
        dateRangeText,
        startDate,
        endDate,
        description
      } satisfies ExtractedExperience;
    })
    .filter((experience) =>
      Boolean(
        experience.title || experience.company || experience.dateRangeText || experience.description
      )
    );
};

const extractEducation = (root: ParentNode): ExtractedEducation[] => {
  const selectors = [
    "section[id*='education'] ul.pvs-list > li",
    "section#education-section ul.pv-profile-section__section-info > li",
    "section.education__section ul > li",
    "section[data-test='education-section'] ul > li"
  ];
  const scopedRoot = root as ParentNode & { querySelectorAll: typeof document.querySelectorAll };
  const nodes: Element[] = [];
  selectors.forEach((selector) => {
    scopedRoot.querySelectorAll(selector).forEach((element) => {
      if (element instanceof Element) {
        nodes.push(element);
      }
    });
  });

  return nodes
    .map((element) => {
      const school = getFirstMatch(element, [
        "span[data-test='education-entity-name']",
        "span.pv-entity__school-name",
        "h3 span[aria-hidden='true']",
        "h3 span"
      ]);
      const degree = getFirstMatch(element, [
        "span[data-test='education-entity-degree']",
        "span.pv-entity__degree-name .pv-entity__comma-item",
        "span.pv-entity__comma-item"
      ]);
      const fieldOfStudy = getFirstMatch(element, [
        "span[data-test='education-entity-field-of-study']",
        "span.pv-entity__fos .pv-entity__comma-item",
        "span.pv-entity__comma-item"
      ]);
      const dateRangeText = getFirstMatch(element, [
        "span[data-test='education-entity-date-range']",
        "span.pv-entity__dates"
      ]);
      return {
        school,
        degree,
        fieldOfStudy,
        dateRangeText
      } satisfies ExtractedEducation;
    })
    .filter((education) => Boolean(education.school || education.degree || education.fieldOfStudy));
};

const collectPhoneNumbers = (roots: ParentNode[]): string[] => {
  const numbers = new Set<string>();
  const selectors = [
    "a[href^='tel:']",
    "span[data-test-id='top-card-contact-info-phone-number']",
    "span[data-test-id='contact-info-phone-number']",
    "span[data-field='phone-number']",
    "li[data-test-id='profile-topcard-phone'] span"
  ];
  roots.forEach((root) => {
    selectors.forEach((selector) => {
      const scopedRoot = root as ParentNode & {
        querySelectorAll: typeof document.querySelectorAll;
      };
      scopedRoot.querySelectorAll(selector).forEach((element) => {
        if (!(element instanceof Element)) {
          return;
        }
        const href = element.getAttribute("href");
        let value =
          href && href.toLowerCase().startsWith("tel:")
            ? href.slice(4)
            : (element.textContent ?? "");
        value = value.replace(/\s+/g, " ").trim();
        if (value) {
          numbers.add(value);
        }
      });
    });
  });
  return Array.from(numbers);
};

const deriveCurrentCompanyStartedAt = (experiences: ExtractedExperience[]): string | undefined => {
  for (const experience of experiences) {
    if (!experience) {
      continue;
    }
    if (!experience.endDate) {
      return experience.startDate ?? experience.dateRangeText;
    }
  }
  return experiences[0]?.startDate ?? experiences[0]?.dateRangeText ?? undefined;
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

  // LinkedIn frequently changes their DOM structure and class names, so we use multiple
  // selectors ordered from most specific/modern to most generic. This strategy ensures
  // the scraper continues working even when LinkedIn updates their UI.
  // The getFirstMatch function will try each selector in order until one returns a value.
  let fullName = getFirstMatch(root, [
    // Modern LinkedIn selectors (2024)
    "h1.text-heading-xlarge",
    "h1.inline.t-24.v-align-middle.break-words",
    "div.ph5 h1",
    "main > div > section > div > div > div > div > h1",

    // Legacy selectors
    "h1.pv-top-card-section__name",
    "h1[data-test-id='hero-title']",
    ".pv-text-details__left-panel h1",
    ".top-card-layout__title",
    "h1[data-test-id='member-name']",
    "div[data-view-name='profile-top-card'] h1",

    // Generic structure-based fallbacks
    "main section h1",
    "main div.artdeco-card h1",
    "main h1",
    ".pv-top-card div h1",
    ".scaffold-layout__main h1",
    "div[class*='top-card'] h1",
    "div[class*='profile'] h1:first-of-type",
    "section[class*='top-card'] h1",

    // Ember/dynamic ID fallbacks
    "h1[id*='ember']",
    "h1[class*='profile']",
    "h1[class*='name']"
  ]);

  if (!fullName) {
    const dataMemberName = getFirstAttribute(root, ["main[data-member-name]"], "data-member-name");
    if (dataMemberName) {
      fullName = cleanText(dataMemberName);
    }
  }

  if (!fullName) {
    const metaTitle = getFirstAttribute(
      root,
      ["meta[property='og:title']", "meta[name='title']", "meta[name='twitter:title']"],
      "content"
    );
    if (metaTitle) {
      const withoutLinkedIn = metaTitle.replace(/\s*\|\s*LinkedIn\s*$/i, "");
      const condensed = withoutLinkedIn.split("|")[0]?.split(" – ")[0]?.split(" - ")[0];
      const cleaned = cleanText(condensed ?? withoutLinkedIn);
      if (cleaned) {
        fullName = cleaned;
      }
    }
  }

  if (!fullName) {
    const scopedRoot = root as ParentNode & { querySelectorAll: typeof document.querySelectorAll };
    const scripts = scopedRoot.querySelectorAll("script[type='application/ld+json']");
    const findNameInJson = (value: unknown): string | undefined => {
      if (!value) {
        return undefined;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          const found = findNameInJson(item);
          if (found) {
            return found;
          }
        }
        return undefined;
      }
      if (typeof value === "object") {
        const record = value as Record<string, unknown>;
        const type = record["@type"];
        const types = Array.isArray(type) ? type : type ? [type] : [];
        if (types.some((entry) => typeof entry === "string" && /\bPerson\b/i.test(entry))) {
          const nameValue = record.name;
          if (typeof nameValue === "string") {
            const cleaned = cleanText(nameValue);
            if (cleaned) {
              return cleaned;
            }
          }
        }
        for (const entry of Object.values(record)) {
          const found = findNameInJson(entry);
          if (found) {
            return found;
          }
        }
      }
      return undefined;
    };
    for (const element of scripts) {
      const text = element.textContent;
      if (!text) {
        continue;
      }
      try {
        const parsed = JSON.parse(text);
        const found = findNameInJson(parsed);
        if (found) {
          fullName = found;
          break;
        }
      } catch {
        continue;
      }
    }
  }

  // Ultimate fallback: try to get any h1 element's text
  if (!fullName) {
    const scopedRoot = root as ParentNode & { querySelector: typeof document.querySelector };
    const anyH1 = scopedRoot.querySelector("h1");
    if (anyH1?.textContent) {
      const cleaned = cleanText(anyH1.textContent);
      if (cleaned && cleaned.length > 1 && cleaned.length < 100) {
        fullName = cleaned;
      }
    }
  }

  const headline = getFirstMatch(root, [
    // Modern selectors
    "div.text-body-medium.break-words",
    "div.text-body-medium",
    ".ph5 .text-body-medium",
    "div.ph5 div.text-body-medium",

    // Legacy selectors
    ".pv-top-card-section__headline",
    ".top-card-layout__headline",
    ".pv-text-details__left-panel div[data-test-id='hero-title-subtitle']",
    "div[data-field='experience-headline']",
    ".pv-top-card div.text-body-medium",

    // Generic fallbacks
    "main section div.text-body-medium:first-of-type",
    ".pv-text-details__left-panel > div:nth-child(2)",
    "div[class*='top-card'] div[class*='headline']",
    "main h1 + div"
  ]);

  let location = getFirstMatch(root, [
    // Modern selectors
    "span.text-body-small.inline.t-black--light.break-words",
    "span.text-body-small.inline",
    ".ph5 .text-body-small",
    "div.mt2.text-body-small",
    "div.ph5 span.text-body-small",

    // Legacy selectors
    ".pv-top-card__subline-item",
    ".top-card-layout__entity-info span[data-test-id='hero-location']",
    "div[data-field='experience-location']",
    "span[data-test-id='top-card-location']",
    "div[data-test-id='member-location']",
    ".pv-text-details__left-panel span.inline-flex",
    ".pv-top-card--list-bullet span[aria-hidden='true']",

    // Generic fallbacks
    "main section span.text-body-small",
    "div[class*='top-card'] span[class*='location']",
    ".pv-text-details__left-panel > div > span.text-body-small"
  ]);
  if (location && /connection|follower/i.test(location)) {
    location = undefined;
  }

  // Extract company name and URL together from company links
  let currentCompany: string | undefined;
  let currentCompanyUrl: string | undefined;

  const companyLinkSelectors = [
    // Modern selectors - company links
    "div.inline-show-more-text a[href*='/company/']",
    ".pv-top-card--experience-list-content a[href*='/company/']",
    "div.pv-text-details__right-panel a[href*='/company/']",

    // Legacy selectors
    ".top-card-layout__entity-info-item a[href*='/company/']",
    ".pv-top-card--experience-list a[href*='/company/']",
    "a[data-field='experience_company_logo']",
    ".pvs-list__item--with-top-padding a[href*='/company/']",

    // Generic fallbacks
    "main section a[href*='/company/']:first-of-type",
    "div[class*='top-card'] a[href*='/company/']",
    ".pv-text-details a[href*='/company/']",
    "ul.pv-top-card--experience-list a[href*='/company/']"
  ];

  const scopedRoot = root as ParentNode & { querySelector: typeof document.querySelector };
  for (const selector of companyLinkSelectors) {
    const companyLink = scopedRoot.querySelector(selector);
    if (companyLink instanceof Element) {
      const href = companyLink.getAttribute("href");
      const text = cleanText(companyLink.textContent);
      if (text) {
        currentCompany = text;
        if (href) {
          try {
            const url = new URL(href, "https://www.linkedin.com");
            currentCompanyUrl = url.toString();
          } catch {
            currentCompanyUrl = href;
          }
        }
        break;
      }
    }
  }

  // Extract current title (job title, not headline)
  // We need to be careful not to extract the company name or headline
  let currentTitle: string | undefined;

  const titleSelectors = [
    // Modern selectors - look for title in experience section, NOT headline
    "div.inline-show-more-text span[aria-hidden='true']:not(:has(a))",
    ".pv-top-card--experience-list li:first-child span[aria-hidden='true']:first-child",
    ".pv-top-card--experience-list-content li:first-child span[aria-hidden='true']:first-child",
    "div.pv-text-details__right-panel li:first-child span[aria-hidden='true']:first-child",
    "div.pvs-list__item--with-top-padding div:first-child span[aria-hidden='true']:first-child",

    // Legacy selectors
    ".top-card-layout__entity-info-item div:first-child",
    ".pv-text-details__right-panel ul li:first-child > div > span:first-child",

    // Generic fallbacks - look for first span in experience lists
    "ul.pv-top-card--experience-list li:first-child span[aria-hidden='true']:first-child",
    "div[class*='experience'] li:first-child div:first-child span:first-child"
  ];

  for (const selector of titleSelectors) {
    const titleElement = scopedRoot.querySelector(selector);
    if (titleElement instanceof Element) {
      const text = cleanText(titleElement.textContent);
      // Make sure we didn't accidentally grab the company name or headline
      if (text && text !== currentCompany && text !== headline) {
        currentTitle = text;
        break;
      }
    }
  }

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

  const experiences = extractExperiences(root);
  const education = extractEducation(root);

  const profileImageUrl = getFirstAttribute(
    root,
    [
      "img.profile-photo-edit__preview",
      "img.pv-top-card-profile-picture__image",
      "img[data-test-id='profile-photo']",
      "img.top-card-profile-picture__image",
      "img.profile-photo-edit__preview-image",
      "img.pv-top-card-profile-picture__image--show",
      "button.pv-top-card-profile-picture img",
      "div.pv-top-card__photo img"
    ],
    "src"
  );

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
        getFirstAttribute(
          contactRoot,
          [
            "a[href^='mailto:']",
            "a[data-test-id='top-card-contact-info-email']",
            "a[data-field='email']"
          ],
          "href"
        )
      )
      .find((value): value is string => Boolean(value))
  );

  const phoneNumbers = collectPhoneNumbers(contactRoots);
  const birthday = contactRoots
    .map((contactRoot) =>
      getFirstMatch(contactRoot, [
        "span[data-test-id='birthday']",
        "li[data-test-id='profile-topcard-birthday'] span",
        "span[data-field='birthday']"
      ])
    )
    .find((value): value is string => Boolean(value));

  const currentCompanyStartedAt = deriveCurrentCompanyStartedAt(experiences);
  const connectionSummaries = collectConnectionSummaries(contactRoots);
  const connectionsText = connectionSummaries.find((summary) => /\bconnection/i.test(summary));
  const followersText = connectionSummaries.find((summary) => /\bfollower/i.test(summary));
  const connectionCount = parseCountFromSummary(connectionsText);
  const followerCount = parseCountFromSummary(followersText);

  return {
    fullName: fullName ?? undefined,
    headline: headline ?? undefined,
    location,
    currentTitle: currentTitle ?? headline ?? undefined,
    currentCompany,
    currentCompanyUrl,
    profileImageUrl: profileImageUrl ?? undefined,
    email,
    phoneNumbers: phoneNumbers.length ? phoneNumbers : undefined,
    birthday: birthday ?? undefined,
    currentCompanyStartedAt,
    experiences: experiences.length ? experiences : undefined,
    education: education.length ? education : undefined,
    connectionsText: connectionsText ?? undefined,
    connectionCount,
    followersText: followersText ?? undefined,
    followerCount
  };

  function cleanText(value: string | null | undefined): string | undefined {
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
  }

  function getFirstMatch(target: ParentNode, selectors: string[]): string | undefined {
    const scopedRoot = target as ParentNode & { querySelector: typeof document.querySelector };
    for (const selector of selectors) {
      const element = scopedRoot.querySelector(selector);
      const text = cleanText(element?.textContent);
      if (text) {
        return text;
      }
    }
    return undefined;
  }

  function findPrimaryExperience(target: ParentNode): Element | null {
    const selectors = [
      "section[id*='experience'] ul.pvs-list > li",
      "section#experience-section ul.pv-profile-section__section-info > li",
      "section.experience__section ul > li",
      "section[data-test='experience-section'] ul > li"
    ];
    const scopedRoot = target as ParentNode & { querySelector: typeof document.querySelector };
    for (const selector of selectors) {
      const element = scopedRoot.querySelector(selector) ?? null;
      if (element instanceof Element) {
        return element;
      }
    }
    return null;
  }

  function extractFromExperience(element: Element): { title?: string; company?: string } {
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
  }

  function parseDateRangeParts(value?: string): { startDate?: string; endDate?: string } {
    if (!value) {
      return {};
    }
    const sanitized = value.replace(/\(.*?\)/g, "").replace(/[\u2013\u2014]/g, "-");
    const [startRaw, endRaw] = sanitized.split(/\s*-\s*/);
    const startDate = cleanText(startRaw ?? undefined);
    let endDate = cleanText(endRaw ?? undefined);
    if (endDate && /present/i.test(endDate)) {
      endDate = undefined;
    }
    return {
      startDate: startDate ?? undefined,
      endDate: endDate ?? undefined
    };
  }

  function extractExperiences(target: ParentNode): ExtractedExperience[] {
    const selectors = [
      "section[id*='experience'] ul.pvs-list > li",
      "section#experience-section ul.pv-profile-section__section-info > li",
      "section.experience__section ul > li",
      "section[data-test='experience-section'] ul > li"
    ];
    const scopedRoot = target as ParentNode & {
      querySelectorAll: typeof document.querySelectorAll;
    };
    const nodes: Element[] = [];
    selectors.forEach((selector) => {
      scopedRoot.querySelectorAll(selector).forEach((experienceElement) => {
        if (experienceElement instanceof Element) {
          nodes.push(experienceElement);
        }
      });
    });

    return nodes
      .map((experienceElement) => {
        const title = getFirstMatch(experienceElement, [
          "span[data-test='experience-entity-title']",
          "span[data-field='experience-title']",
          "span[aria-hidden='true']",
          "span.t-14.t-black.t-bold",
          "div.display-flex.flex-column.full-width.align-self-center span:first-child"
        ]);
        const company = getFirstMatch(experienceElement, [
          "span[data-test='experience-entity-subtitle']",
          "span[data-field='experience-company-name']",
          "p.pv-entity__secondary-title",
          "span.t-14.t-normal",
          "div.display-flex.flex-column.full-width.align-self-center span:nth-child(2)"
        ]);
        const dateRangeText = getFirstMatch(experienceElement, [
          "span[data-test='experience-entity-date-range']",
          "span[data-field='experience-date-range']",
          "span.pvs-entity__caption-wrapper",
          "h4 span.t-14.t-normal.t-black--light",
          "span.t-14.t-normal.t-black--light"
        ]);
        const location = getFirstMatch(experienceElement, [
          "span[data-test='experience-entity-location']",
          "span[data-field='experience-location']",
          "span.pv-entity__location",
          "span.t-14.t-normal.t-black--light"
        ]);
        const description = getFirstMatch(experienceElement, [
          "div[data-test='experience-entity-description']",
          "div.pv-entity__extra-details",
          "div.pv-entity__description"
        ]);
        const { startDate, endDate } = parseDateRangeParts(dateRangeText);
        return {
          title,
          company,
          location,
          dateRangeText,
          startDate,
          endDate,
          description
        } satisfies ExtractedExperience;
      })
      .filter((experience) =>
        Boolean(
          experience.title ||
            experience.company ||
            experience.dateRangeText ||
            experience.description
        )
      );
  }

  function extractEducation(target: ParentNode): ExtractedEducation[] {
    const selectors = [
      "section[id*='education'] ul.pvs-list > li",
      "section#education-section ul.pv-profile-section__section-info > li",
      "section.education__section ul > li",
      "section[data-test='education-section'] ul > li"
    ];
    const scopedRoot = target as ParentNode & {
      querySelectorAll: typeof document.querySelectorAll;
    };
    const nodes: Element[] = [];
    selectors.forEach((selector) => {
      scopedRoot.querySelectorAll(selector).forEach((educationElement) => {
        if (educationElement instanceof Element) {
          nodes.push(educationElement);
        }
      });
    });

    return nodes
      .map((educationElement) => {
        const school = getFirstMatch(educationElement, [
          "span[data-test='education-entity-name']",
          "span.pv-entity__school-name",
          "h3 span[aria-hidden='true']",
          "h3 span"
        ]);
        const degree = getFirstMatch(educationElement, [
          "span[data-test='education-entity-degree']",
          "span.pv-entity__degree-name .pv-entity__comma-item",
          "span.pv-entity__comma-item"
        ]);
        const fieldOfStudy = getFirstMatch(educationElement, [
          "span[data-test='education-entity-field-of-study']",
          "span.pv-entity__fos .pv-entity__comma-item",
          "span.pv-entity__comma-item"
        ]);
        const dateRangeText = getFirstMatch(educationElement, [
          "span[data-test='education-entity-date-range']",
          "span.pv-entity__dates"
        ]);
        return {
          school,
          degree,
          fieldOfStudy,
          dateRangeText
        } satisfies ExtractedEducation;
      })
      .filter((educationEntry) =>
        Boolean(educationEntry.school || educationEntry.degree || educationEntry.fieldOfStudy)
      );
  }

  function collectPhoneNumbers(roots: ParentNode[]): string[] {
    const numbers = new Set<string>();
    const selectors = [
      "a[href^='tel:']",
      "span[data-test-id='top-card-contact-info-phone-number']",
      "span[data-test-id='contact-info-phone-number']",
      "span[data-field='phone-number']",
      "li[data-test-id='profile-topcard-phone'] span"
    ];
    roots.forEach((contactRoot) => {
      selectors.forEach((selector) => {
        const scopedRoot = contactRoot as ParentNode & {
          querySelectorAll: typeof document.querySelectorAll;
        };
        scopedRoot.querySelectorAll(selector).forEach((element) => {
          if (!(element instanceof Element)) {
            return;
          }
          const href = element.getAttribute("href");
          let value =
            href && href.toLowerCase().startsWith("tel:")
              ? href.slice(4)
              : (element.textContent ?? "");
          value = value.replace(/\s+/g, " ").trim();
          if (value) {
            numbers.add(value);
          }
        });
      });
    });
    return Array.from(numbers);
  }

  function collectConnectionSummaries(roots: ParentNode[]): string[] {
    const selectors = [
      "li[data-test-id='member-connections'] span",
      "span[data-test-id='member-connections']",
      "span[data-test-id='top-card__subline-item']",
      "li[data-test-id='top-card__subline-item'] span",
      "span[data-test-id='profile-topcard-secondary-item']",
      ".pv-top-card--list-bullet li span[aria-hidden='true']",
      ".pv-top-card-v2-section__connections span",
      "span[data-field='topcard_summary']",
      "span[data-field='topcard-summary-line']"
    ];

    const summaries = new Set<string>();
    for (const root of roots) {
      const scopedRoot = root as ParentNode & {
        querySelectorAll: typeof document.querySelectorAll;
      };
      selectors.forEach((selector) => {
        scopedRoot.querySelectorAll(selector).forEach((element) => {
          if (element instanceof Element) {
            const text = cleanText(element.textContent);
            if (text && /\b(connection|follower)s?\b/i.test(text)) {
              summaries.add(text);
            }
          }
        });
      });
      if (root instanceof Element) {
        root.querySelectorAll("span").forEach((element) => {
          const text = cleanText(element.textContent);
          if (text && /\b(connection|follower)s?\b/i.test(text)) {
            summaries.add(text);
          }
        });
      }
    }

    return Array.from(summaries);
  }

  function parseCountFromSummary(value?: string): number | undefined {
    if (!value) {
      return undefined;
    }
    const normalized = value.replace(/[+,]/g, "").trim().toLowerCase();
    const match = normalized.match(/(\d+(?:\.\d+)?)(k|m|b)?/i);
    if (!match) {
      return undefined;
    }
    const base = Number.parseFloat(match[1]);
    if (Number.isNaN(base)) {
      return undefined;
    }
    const suffix = match[2]?.toLowerCase();
    if (suffix === "k") {
      return Math.round(base * 1_000);
    }
    if (suffix === "m") {
      return Math.round(base * 1_000_000);
    }
    if (suffix === "b") {
      return Math.round(base * 1_000_000_000);
    }
    return Math.round(base);
  }

  function deriveCurrentCompanyStartedAt(
    experiencesList: ExtractedExperience[]
  ): string | undefined {
    for (const experience of experiencesList) {
      if (!experience) {
        continue;
      }
      if (!experience.endDate) {
        return experience.startDate ?? experience.dateRangeText;
      }
    }
    return experiencesList[0]?.startDate ?? experiencesList[0]?.dateRangeText ?? undefined;
  }

  function getFirstAttribute(
    target: ParentNode,
    selectors: string[],
    attribute: string
  ): string | undefined {
    const scopedRoot = target as ParentNode & { querySelector: typeof document.querySelector };
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
  }

  function cleanEmail(value: string | undefined): string | undefined {
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
  }
}

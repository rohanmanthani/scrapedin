import { JSDOM } from "jsdom";

export interface StagehandFieldMatch {
  field: string;
  value?: string;
  matchedSelector?: string;
  triedSelectors: string[];
  tier?: string;
  tierIndex?: number;
  selectorIndex?: number;
  path?: string;
  attribute?: string;
  confidence: number;
  notes: string[];
}

export interface StagehandExperienceInsight {
  index: number;
  path?: string;
  isCurrent: boolean;
  fields: {
    title: StagehandFieldMatch;
    company: StagehandFieldMatch;
    companyUrl: StagehandFieldMatch;
    dateRange: StagehandFieldMatch;
    location: StagehandFieldMatch;
  };
  rawText?: string;
}

export interface LinkedInStagehandAnalysis {
  documentTitle?: string;
  fields: StagehandFieldMatch[];
  experiences: StagehandExperienceInsight[];
  currentExperienceIndex?: number;
  metadata: {
    htmlLength: number;
    generatedAt: string;
    warnings: string[];
  };
}

interface SelectorGroup {
  name: string;
  selectors: string[];
}

type MatchResult = {
  value?: string;
  element?: Element | null;
  matchedSelector?: string;
  tier?: string;
  tierIndex?: number;
  selectorIndex?: number;
  triedSelectors: string[];
  notes: string[];
};

const FULL_NAME_GROUPS: SelectorGroup[] = [
  {
    name: "modern",
    selectors: [
      "h1.text-heading-xlarge",
      "h1.inline.t-24.v-align-middle.break-words",
      "div.ph5 h1",
      "main > div > section > div > div > div > div > h1"
    ]
  },
  {
    name: "legacy",
    selectors: [
      "h1.pv-top-card-section__name",
      "h1[data-test-id='hero-title']",
      ".pv-text-details__left-panel h1",
      ".top-card-layout__title",
      "h1[data-test-id='member-name']",
      "div[data-view-name='profile-top-card'] h1"
    ]
  },
  {
    name: "generic",
    selectors: [
      "main section h1",
      "main div.artdeco-card h1",
      "main h1",
      ".pv-top-card div h1",
      ".scaffold-layout__main h1",
      "div[class*='top-card'] h1",
      "div[class*='profile'] h1:first-of-type",
      "section[class*='top-card'] h1"
    ]
  },
  {
    name: "ultimate",
    selectors: ["h1"]
  }
];

const HEADLINE_GROUPS: SelectorGroup[] = [
  {
    name: "modern",
    selectors: [
      "div.text-body-medium.break-words",
      "div.text-body-medium",
      ".ph5 .text-body-medium",
      "div.ph5 div.text-body-medium"
    ]
  },
  {
    name: "legacy",
    selectors: [
      ".pv-top-card-section__headline",
      ".top-card-layout__headline",
      ".pv-text-details__left-panel div[data-test-id='hero-title-subtitle']",
      "div[data-field='experience-headline']",
      ".pv-top-card div.text-body-medium"
    ]
  },
  {
    name: "generic",
    selectors: [
      "main section div.text-body-medium:first-of-type",
      ".pv-text-details__left-panel > div:nth-child(2)",
      "div[class*='top-card'] div[class*='headline']",
      "main h1 + div"
    ]
  }
];

const LOCATION_GROUPS: SelectorGroup[] = [
  {
    name: "modern",
    selectors: [
      "span.text-body-small.inline.t-black--light.break-words",
      "span.text-body-small.inline",
      ".ph5 .text-body-small",
      "div.mt2.text-body-small"
    ]
  },
  {
    name: "legacy",
    selectors: [
      ".pv-top-card--list li:first-child",
      ".pv-top-card-v2-section__location",
      "div[data-field='experience-location']",
      "div.text-body-small.inline"
    ]
  },
  {
    name: "generic",
    selectors: [
      "main section span.text-body-small",
      "main section div.text-body-small",
      "section[id*='top-card'] span[class*='location']",
      "div[class*='top-card'] span[class*='location']"
    ]
  }
];

const PROFILE_IMAGE_GROUPS: SelectorGroup[] = [
  {
    name: "modern",
    selectors: [
      "img.profile-photo-edit__preview",
      "img.pv-top-card-profile-picture__image",
      "img[data-test-id='profile-photo']",
      "img.top-card-profile-picture__image",
      "img[class*='profile-photo']"
    ]
  },
  {
    name: "legacy",
    selectors: [
      "img.profile-photo-edit__preview-image",
      "img.pv-top-card-profile-picture__image--show",
      "button.pv-top-card-profile-picture img",
      "div.pv-top-card__photo img"
    ]
  },
  {
    name: "generic",
    selectors: [
      "div.pv-top-card img",
      "section.pv-top-card img",
      "div[class*='top-card'] img:not([alt*='company']):not([alt*='Company'])",
      "button[class*='profile-picture'] img"
    ]
  }
];

const EXPERIENCE_ITEM_SELECTORS = [
  // Modern LinkedIn with obfuscated classes - rely on structure and artdeco-list__item
  // Find experience section by anchor, then get first-level list items (avoid nested sub-components)
  "div[id='experience'] ~ div > div > ul > li.artdeco-list__item",
  "div.pv-profile-card__anchor#experience ~ div > div > ul > li.artdeco-list__item",

  // Broader modern selectors
  "div[id='experience'] ~ div ul > li.artdeco-list__item",
  "div.pv-profile-card__anchor#experience ~ div ul > li.artdeco-list__item",

  // Legacy selectors (still used by some profiles)
  "section[id*='experience'] ul.pvs-list > li.artdeco-list__item",
  "section[id*='experience'] ul.pvs-list > li",
  "section[id*='experience'] div.pvs-list__container > ul > li",
  "section.artdeco-card.pv-profile-card div[class*='pvs-list'] > ul > li",
  "section#experience-section ul.pv-profile-section__section-info > li",
  "section.experience__section ul > li",
  "section[data-test='experience-section'] ul > li",
  "section[id*='experience'] li.artdeco-list__item"
];

const EXPERIENCE_TITLE_GROUPS: SelectorGroup[] = [
  {
    name: "modern",
    selectors: [
      "div.mr1.t-bold span[aria-hidden='true']",
      "div.display-flex.align-items-center > div.mr1.t-bold span[aria-hidden='true']",
      "div.t-bold > span[aria-hidden='true']:first-child",
      "span.mr1.hoverable-link-text.t-bold span[aria-hidden='true']",
      "div.display-flex.flex-column.full-width > div:first-child span[aria-hidden='true']:first-child"
    ]
  },
  {
    name: "legacy",
    selectors: [
      "span[data-test='experience-entity-title']",
      "span[data-field='experience-title']",
      "span.t-14.t-black.t-bold",
      "h3 span[aria-hidden='true']",
      "div.display-flex.flex-column.full-width.align-self-center > span:first-child"
    ]
  },
  {
    name: "generic",
    selectors: [
      "div:first-child span[aria-hidden='true']:first-child",
      "span.t-bold span[aria-hidden='true']"
    ]
  }
];

const EXPERIENCE_COMPANY_GROUPS: SelectorGroup[] = [
  {
    name: "modern",
    selectors: [
      // Company name is in a span.t-14.t-normal that comes AFTER the title
      "span.t-14.t-normal:not(.t-black--light) > span[aria-hidden='true']",
      "div.t-14.t-normal:not(.t-black--light) > span[aria-hidden='true']",
      // Within the company link, look for non-bold spans
      "a[href*='/company/'] span.t-14.t-normal span[aria-hidden='true']"
    ]
  },
  {
    name: "legacy",
    selectors: [
      "span[data-test='experience-entity-subtitle']",
      "span[data-field='experience-company-name']",
      "p.pv-entity__secondary-title",
      "span.t-14.t-normal:not(.t-black--light)",
      "div.display-flex.flex-column.full-width.align-self-center span:nth-child(2)"
    ]
  },
  {
    name: "generic",
    selectors: [
      // Last resort - look for any span in t-14 t-normal that's not the title
      "span.t-14.t-normal span[aria-hidden='true']"
    ]
  }
];

const EXPERIENCE_DATE_GROUPS: SelectorGroup[] = [
  {
    name: "modern",
    selectors: [
      "span[data-test='experience-entity-date-range']",
      "span[data-field='experience-date-range']",
      "span.pvs-entity__caption-wrapper",
      "h4 span.t-14.t-normal.t-black--light",
      "span.t-14.t-normal.t-black--light"
    ]
  },
  {
    name: "legacy",
    selectors: ["h4 span.pv-entity__date-range span:nth-child(2)", "span.pv-entity__bullet-item-v2"]
  }
];

const EXPERIENCE_LOCATION_GROUPS: SelectorGroup[] = [
  {
    name: "modern",
    selectors: [
      "div.t-14.t-normal.t-black--light span[aria-hidden='true']",
      "span.t-14.t-normal.t-black--light span[aria-hidden='true']"
    ]
  },
  {
    name: "legacy",
    selectors: [
      "span.pv-entity__location span:nth-child(2)",
      "span[data-test='experience-entity-location']",
      "span[data-field='experience-location']"
    ]
  }
];

const EXPERIENCE_COMPANY_LINK_SELECTORS = [
  "a[href*='/company/']",
  "a[href*='/school/']",
  "a[href*='linkedin.com/company/']"
];

const computeConfidence = (tierIndex: number, selectorIndex: number): number => {
  const value = 1 - tierIndex * 0.25 - selectorIndex * 0.05;
  const bounded = Math.min(0.99, Math.max(0.1, value));
  return Math.round(bounded * 100) / 100;
};

const cleanText = (value: string | null | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }
  const normalized = value
    .replace(/View[\s\S]*?profile/gi, " ")
    .replace(/\b[1-3](?:st|nd|rd|th)?\s+degree\s+connection\b.*$/i, " ");
  const condensed = normalized.replace(/\s+/g, " ").trim();
  return condensed || undefined;
};

const isElementNode = (value: unknown): value is Element => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const potential = value as { tagName?: unknown };
  return typeof potential.tagName === "string";
};

const computeDomPath = (element?: Element | null): string | undefined => {
  if (!element) {
    return undefined;
  }
  const segments: string[] = [];
  let current: Element | null = element;
  while (current) {
    const activeCurrent: Element = current;
    let segment = activeCurrent.tagName.toLowerCase();
    if (activeCurrent.id) {
      segment += `#${activeCurrent.id}`;
      segments.unshift(segment);
      break;
    }
    const classList = Array.from(activeCurrent.classList.values()).filter(Boolean);
    if (classList.length > 0) {
      segment += `.${classList.slice(0, 3).join(".")}`;
    }
    const parent: Element | null = activeCurrent.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children) as Element[];
      const sameTagSiblings = siblings.filter(
        (sibling) => sibling.tagName === activeCurrent.tagName
      );
      if (sameTagSiblings.length > 1) {
        const position = sameTagSiblings.findIndex((sibling) => sibling === activeCurrent);
        if (position >= 0) {
          segment += `:nth-of-type(${position + 1})`;
        }
      }
    }
    segments.unshift(segment);
    current = parent;
  }
  return segments.join(" > ");
};

const matchFromGroups = (root: ParentNode, groups: SelectorGroup[]): MatchResult => {
  const scopedRoot = root as ParentNode & {
    querySelector: typeof document.querySelector;
  };
  const triedSelectors: string[] = [];
  for (const [tierIndex, group] of groups.entries()) {
    for (const [selectorIndex, selector] of group.selectors.entries()) {
      triedSelectors.push(selector);
      const element = scopedRoot.querySelector(selector);
      const value = cleanText(element?.textContent ?? undefined);
      if (value) {
        const notes: string[] = [];
        if (tierIndex > 0) {
          notes.push(`Matched fallback tier "${group.name}" (index ${tierIndex}).`);
        }
        if (selectorIndex > 0) {
          notes.push(`Used fallback selector #${selectorIndex + 1} within tier.`);
        }
        return {
          value,
          element,
          matchedSelector: selector,
          tier: group.name,
          tierIndex,
          selectorIndex,
          triedSelectors,
          notes
        };
      }
    }
  }
  return { triedSelectors, notes: ["No selector matched"] };
};

const matchAttributeFromGroups = (
  root: ParentNode,
  groups: SelectorGroup[],
  attribute: string
): MatchResult & { attribute?: string } => {
  const scopedRoot = root as ParentNode & {
    querySelector: typeof document.querySelector;
  };
  const triedSelectors: string[] = [];
  for (const [tierIndex, group] of groups.entries()) {
    for (const [selectorIndex, selector] of group.selectors.entries()) {
      triedSelectors.push(selector);
      const element = scopedRoot.querySelector(selector);
      const attrValue = element?.getAttribute?.(attribute) ?? undefined;
      const value = cleanText(attrValue ?? undefined) ?? attrValue ?? undefined;
      if (value) {
        const notes: string[] = [];
        if (tierIndex > 0) {
          notes.push(`Matched fallback tier "${group.name}" (index ${tierIndex}).`);
        }
        if (selectorIndex > 0) {
          notes.push(`Used fallback selector #${selectorIndex + 1} within tier.`);
        }
        return {
          value,
          element,
          matchedSelector: selector,
          tier: group.name,
          tierIndex,
          selectorIndex,
          triedSelectors,
          notes,
          attribute
        };
      }
    }
  }
  return { triedSelectors, notes: ["No selector matched"], attribute };
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

const findExperienceElements = (root: ParentNode): Element[] => {
  const scopedRoot = root as ParentNode & {
    querySelectorAll: typeof document.querySelectorAll;
    querySelector: typeof document.querySelector;
  };
  const results: Element[] = [];
  const seen = new Set<Element>();

  // First, try to find the education section to filter out education items
  const educationAnchor = scopedRoot.querySelector("div[id='education']");

  for (const selector of EXPERIENCE_ITEM_SELECTORS) {
    const matches = scopedRoot.querySelectorAll(selector);
    matches.forEach((element) => {
      if (isElementNode(element) && !seen.has(element)) {
        // Filter out education items by checking if element contains education-related text
        const elementText = element.textContent || "";

        // Skip items that look like education (have degree keywords but no company link)
        const hasCompanyLink = element.querySelector("a[href*='/company/']");
        const hasSchoolLink = element.querySelector("a[href*='/school/']");
        const hasDegreeKeywords =
          /\b(bachelor|master|phd|degree|university|college|school)\b/i.test(elementText);

        // If it has school link or degree keywords without company link, likely education
        if ((hasSchoolLink || (hasDegreeKeywords && !hasCompanyLink)) && educationAnchor) {
          // Additional check: does it contain typical experience keywords?
          const hasExperienceKeywords = /\b(present|current|·|yrs?|mos?|months?)\b/i.test(
            elementText
          );
          if (!hasExperienceKeywords) {
            return; // Skip education items
          }
        }

        seen.add(element);
        results.push(element);
      }
    });
  }
  return results;
};

const analyzeExperienceElement = (element: Element, index: number): StagehandExperienceInsight => {
  const titleMatch = matchFromGroups(element, EXPERIENCE_TITLE_GROUPS);
  const companyLinkMatch = matchAttributeFromGroups(
    element,
    [{ name: "link", selectors: EXPERIENCE_COMPANY_LINK_SELECTORS }],
    "href"
  );
  const companyMatch = matchFromGroups(element, EXPERIENCE_COMPANY_GROUPS);
  const dateRangeMatch = matchFromGroups(element, EXPERIENCE_DATE_GROUPS);
  const locationMatch = matchFromGroups(element, EXPERIENCE_LOCATION_GROUPS);

  let companyValue =
    cleanText(
      companyLinkMatch.element?.textContent ?? companyMatch.element?.textContent ?? undefined
    ) ?? companyMatch.value;

  // Clean company name by removing employment type suffixes
  if (companyValue) {
    companyValue = companyValue
      .replace(/\s*·\s*(Self-employed|Full-time|Part-time|Contract|Freelance|Internship).*$/i, "")
      .trim();
  }

  const { endDate } = parseDateRangeParts(dateRangeMatch.value);
  const inferredCurrent = !endDate || /present/i.test(dateRangeMatch.value ?? "");

  const companyUrlValue = companyLinkMatch.element?.getAttribute?.("href") ?? undefined;

  const companyElement =
    (companyLinkMatch.element as Element | undefined) ?? companyMatch.element ?? undefined;
  const companyTier = companyLinkMatch.element ? companyLinkMatch.tier : companyMatch.tier;
  const companyTierIndex = companyLinkMatch.element
    ? companyLinkMatch.tierIndex
    : companyMatch.tierIndex;
  const companySelectorIndex = companyLinkMatch.element
    ? companyLinkMatch.selectorIndex
    : companyMatch.selectorIndex;
  const companyConfidence = companyLinkMatch.element
    ? computeConfidence(companyLinkMatch.tierIndex ?? 0, companyLinkMatch.selectorIndex ?? 0)
    : companyMatch.element
      ? computeConfidence(companyMatch.tierIndex ?? 0, companyMatch.selectorIndex ?? 0)
      : 0.1;
  const companyNotes = [...companyLinkMatch.notes, ...companyMatch.notes];

  const companyField: StagehandFieldMatch = {
    field: "company",
    value: companyValue,
    matchedSelector: companyLinkMatch.element
      ? companyLinkMatch.matchedSelector
      : companyMatch.matchedSelector,
    triedSelectors: Array.from(
      new Set([...companyLinkMatch.triedSelectors, ...companyMatch.triedSelectors])
    ),
    tier: companyTier,
    tierIndex: companyTierIndex,
    selectorIndex: companySelectorIndex,
    path: computeDomPath(companyElement),
    confidence: companyConfidence,
    notes: companyNotes
  };

  const titleField: StagehandFieldMatch = {
    field: "title",
    value: titleMatch.value,
    matchedSelector: titleMatch.matchedSelector,
    triedSelectors: titleMatch.triedSelectors,
    tier: titleMatch.tier,
    tierIndex: titleMatch.tierIndex,
    selectorIndex: titleMatch.selectorIndex,
    path: computeDomPath(titleMatch.element ?? undefined),
    confidence: titleMatch.element
      ? computeConfidence(titleMatch.tierIndex ?? 0, titleMatch.selectorIndex ?? 0)
      : 0.1,
    notes: titleMatch.notes
  };

  const dateField: StagehandFieldMatch = {
    field: "dateRange",
    value: dateRangeMatch.value,
    matchedSelector: dateRangeMatch.matchedSelector,
    triedSelectors: dateRangeMatch.triedSelectors,
    tier: dateRangeMatch.tier,
    tierIndex: dateRangeMatch.tierIndex,
    selectorIndex: dateRangeMatch.selectorIndex,
    path: computeDomPath(dateRangeMatch.element ?? undefined),
    confidence: dateRangeMatch.element
      ? computeConfidence(dateRangeMatch.tierIndex ?? 0, dateRangeMatch.selectorIndex ?? 0)
      : 0.1,
    notes: dateRangeMatch.notes
  };

  const locationField: StagehandFieldMatch = {
    field: "location",
    value: locationMatch.value,
    matchedSelector: locationMatch.matchedSelector,
    triedSelectors: locationMatch.triedSelectors,
    tier: locationMatch.tier,
    tierIndex: locationMatch.tierIndex,
    selectorIndex: locationMatch.selectorIndex,
    path: computeDomPath(locationMatch.element ?? undefined),
    confidence: locationMatch.element
      ? computeConfidence(locationMatch.tierIndex ?? 0, locationMatch.selectorIndex ?? 0)
      : 0.1,
    notes: locationMatch.notes
  };

  const companyUrlField: StagehandFieldMatch = {
    field: "companyUrl",
    value: companyUrlValue,
    matchedSelector: companyLinkMatch.matchedSelector,
    triedSelectors: companyLinkMatch.triedSelectors,
    tier: companyLinkMatch.tier,
    tierIndex: companyLinkMatch.tierIndex,
    selectorIndex: companyLinkMatch.selectorIndex,
    path: computeDomPath(companyLinkMatch.element ?? undefined),
    attribute: companyLinkMatch.attribute,
    confidence: companyLinkMatch.element
      ? computeConfidence(companyLinkMatch.tierIndex ?? 0, companyLinkMatch.selectorIndex ?? 0)
      : 0.1,
    notes: companyLinkMatch.notes
  };

  const rawText = cleanText(element.textContent ?? undefined);

  return {
    index,
    path: computeDomPath(element),
    isCurrent: inferredCurrent,
    fields: {
      title: titleField,
      company: companyField,
      companyUrl: companyUrlField,
      dateRange: dateField,
      location: locationField
    },
    rawText
  };
};

export class LinkedInProfileStagehandAnalyzer {
  analyzeHtml(html: string): LinkedInStagehandAnalysis {
    const dom = new JSDOM(html);
    return this.analyzeDocument(dom.window.document);
  }

  analyzeDocument(document: Document): LinkedInStagehandAnalysis {
    const warnings: string[] = [];

    const nameMatch = matchFromGroups(document, FULL_NAME_GROUPS);
    const headlineMatch = matchFromGroups(document, HEADLINE_GROUPS);
    const locationMatch = matchFromGroups(document, LOCATION_GROUPS);
    const profileImageMatch = matchAttributeFromGroups(document, PROFILE_IMAGE_GROUPS, "src");

    if (!nameMatch.value) {
      warnings.push("Full name selector did not match");
    }
    if (!headlineMatch.value) {
      warnings.push("Headline selector did not match");
    }
    if (!locationMatch.value) {
      warnings.push("Location selector did not match");
    }
    if (!profileImageMatch.value) {
      warnings.push("Profile image selector did not match");
    }

    const experiences = findExperienceElements(document).map((element, index) =>
      analyzeExperienceElement(element, index)
    );

    if (experiences.length === 0) {
      warnings.push("No experience entries detected");
    }

    const currentExperience =
      experiences.find((experience) => experience.isCurrent) ?? experiences[0];
    const currentExperienceIndex = currentExperience?.index;

    const fieldMatches: StagehandFieldMatch[] = [
      {
        field: "fullName",
        value: nameMatch.value,
        matchedSelector: nameMatch.matchedSelector,
        triedSelectors: nameMatch.triedSelectors,
        tier: nameMatch.tier,
        tierIndex: nameMatch.tierIndex,
        selectorIndex: nameMatch.selectorIndex,
        path: computeDomPath(nameMatch.element ?? undefined),
        confidence: nameMatch.element
          ? computeConfidence(nameMatch.tierIndex ?? 0, nameMatch.selectorIndex ?? 0)
          : 0.1,
        notes: nameMatch.notes
      },
      {
        field: "headline",
        value: headlineMatch.value,
        matchedSelector: headlineMatch.matchedSelector,
        triedSelectors: headlineMatch.triedSelectors,
        tier: headlineMatch.tier,
        tierIndex: headlineMatch.tierIndex,
        selectorIndex: headlineMatch.selectorIndex,
        path: computeDomPath(headlineMatch.element ?? undefined),
        confidence: headlineMatch.element
          ? computeConfidence(headlineMatch.tierIndex ?? 0, headlineMatch.selectorIndex ?? 0)
          : 0.1,
        notes: headlineMatch.notes
      },
      {
        field: "location",
        value: locationMatch.value,
        matchedSelector: locationMatch.matchedSelector,
        triedSelectors: locationMatch.triedSelectors,
        tier: locationMatch.tier,
        tierIndex: locationMatch.tierIndex,
        selectorIndex: locationMatch.selectorIndex,
        path: computeDomPath(locationMatch.element ?? undefined),
        confidence: locationMatch.element
          ? computeConfidence(locationMatch.tierIndex ?? 0, locationMatch.selectorIndex ?? 0)
          : 0.1,
        notes: locationMatch.notes
      },
      {
        field: "profileImageUrl",
        value: profileImageMatch.value,
        matchedSelector: profileImageMatch.matchedSelector,
        triedSelectors: profileImageMatch.triedSelectors,
        tier: profileImageMatch.tier,
        tierIndex: profileImageMatch.tierIndex,
        selectorIndex: profileImageMatch.selectorIndex,
        path: computeDomPath(profileImageMatch.element ?? undefined),
        attribute: profileImageMatch.attribute,
        confidence: profileImageMatch.element
          ? computeConfidence(
              profileImageMatch.tierIndex ?? 0,
              profileImageMatch.selectorIndex ?? 0
            )
          : 0.1,
        notes: profileImageMatch.notes
      }
    ];

    if (currentExperience) {
      fieldMatches.push(
        {
          field: "currentTitle",
          value: currentExperience.fields.title.value,
          matchedSelector: currentExperience.fields.title.matchedSelector,
          triedSelectors: currentExperience.fields.title.triedSelectors,
          tier: currentExperience.fields.title.tier,
          tierIndex: currentExperience.fields.title.tierIndex,
          selectorIndex: currentExperience.fields.title.selectorIndex,
          path: currentExperience.fields.title.path,
          confidence: currentExperience.fields.title.confidence,
          notes: currentExperience.fields.title.notes
        },
        {
          field: "currentCompany",
          value: currentExperience.fields.company.value,
          matchedSelector: currentExperience.fields.company.matchedSelector,
          triedSelectors: currentExperience.fields.company.triedSelectors,
          tier: currentExperience.fields.company.tier,
          tierIndex: currentExperience.fields.company.tierIndex,
          selectorIndex: currentExperience.fields.company.selectorIndex,
          path: currentExperience.fields.company.path,
          confidence: currentExperience.fields.company.confidence,
          notes: currentExperience.fields.company.notes
        },
        {
          field: "currentCompanyUrl",
          value: currentExperience.fields.companyUrl.value,
          matchedSelector: currentExperience.fields.companyUrl.matchedSelector,
          triedSelectors: currentExperience.fields.companyUrl.triedSelectors,
          tier: currentExperience.fields.companyUrl.tier,
          tierIndex: currentExperience.fields.companyUrl.tierIndex,
          selectorIndex: currentExperience.fields.companyUrl.selectorIndex,
          path: currentExperience.fields.companyUrl.path,
          attribute: currentExperience.fields.companyUrl.attribute,
          confidence: currentExperience.fields.companyUrl.confidence,
          notes: currentExperience.fields.companyUrl.notes
        }
      );
    } else {
      warnings.push("Unable to determine current experience");
    }

    const htmlLength = document.documentElement?.outerHTML?.length ?? 0;

    return {
      documentTitle: cleanText(document.querySelector("title")?.textContent ?? undefined),
      fields: fieldMatches,
      experiences,
      currentExperienceIndex,
      metadata: {
        htmlLength,
        generatedAt: new Date().toISOString(),
        warnings
      }
    };
  }
}

export type LinkedInProfileStagehandService = Pick<LinkedInProfileStagehandAnalyzer, "analyzeHtml">;

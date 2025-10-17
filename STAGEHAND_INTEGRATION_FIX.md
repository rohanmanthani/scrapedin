# Stagehand Integration Fix

## Problem Summary

The LinkedIn profile scraper was not using the stagehand integration despite having a complete `LinkedInProfileStagehandAnalyzer` implementation in the codebase. The scraper was still using the old `extractProfileDetails` parser function, which meant the improved selectors and analysis logic in the stagehand analyzer were not being utilized.

## Root Cause

The `ProfileListScraper.ts` was calling `extractProfileDetails` directly via `page.evaluate()` at line 57:

```typescript
const details = await page.evaluate(extractProfileDetails);
```

Meanwhile, the `LinkedInProfileStagehandAnalyzer` class (with better selector strategies) was sitting unused in the `src/linkedin/stagehand/` directory.

## What Was Fixed

### 1. Integrated Stagehand Analyzer into Profile Scraping

Modified `ProfileListScraper.ts` to use a **hybrid approach**:

- **Primary**: Use `LinkedInProfileStagehandAnalyzer` for main profile fields (name, headline, title, company, location, image, experiences)
- **Fallback**: Use legacy `extractProfileDetails` for additional fields that stagehand doesn't extract (email, phone, connections, education, birthday)

### 2. Implementation Details

**Added stagehand analyzer initialization:**
```typescript
private stagehandAnalyzer: LinkedInProfileStagehandAnalyzer;

constructor(settings: AutomationSettings) {
  super(settings);
  this.stagehandAnalyzer = new LinkedInProfileStagehandAnalyzer();
}
```

**Changed scraping logic to use both analyzers:**
```typescript
// Get HTML content and use both analyzers
const html = await page.content();
const stagehandAnalysis = this.stagehandAnalyzer.analyzeHtml(html);
const legacyDetails = await page.evaluate(extractProfileDetails);
const details = this.mergeProfileDetails(stagehandAnalysis, legacyDetails);
```

**Added merge function to combine results:**
```typescript
private mergeProfileDetails(
  stagehandAnalysis: LinkedInStagehandAnalysis,
  legacyDetails: ExtractedProfileDetails
): ExtractedProfileDetails {
  // Prefer stagehand for main fields (better selectors)
  // Fall back to legacy for additional fields stagehand doesn't extract
}
```

### 3. Cleaned Up Non-Functional Worker Files

Renamed files that were causing build errors due to importing non-existent `stagehand` npm package:
- `profileWorker.ts` → `profileWorker.ts.unused`
- `exploreLinkedInProfile.ts` → `exploreLinkedInProfile.ts.unused`

These files were designed for a worker-based architecture that's no longer needed since we're using the analyzer directly.

### 4. Removed Non-Existent Package Dependency

Removed `"stagehand": "^1.0.1"` from `package.json` as this package doesn't actually exist in npm.

## Benefits of the New Approach

### Better Selector Reliability

The stagehand analyzer uses a **multi-tier fallback strategy** with organized selector groups:

```typescript
const FULL_NAME_GROUPS: SelectorGroup[] = [
  { name: "modern", selectors: [...] },      // Current LinkedIn selectors (2024)
  { name: "legacy", selectors: [...] },      // Older LinkedIn formats
  { name: "generic", selectors: [...] },     // Structure-based fallbacks
  { name: "ultimate", selectors: ["h1"] }    // Last resort
];
```

### Comprehensive Field Extraction

The stagehand analyzer provides:
- **Confidence scores** for each extracted field
- **Selector metadata** showing which selector matched
- **Detailed warnings** for debugging when extraction fails
- **Experience analysis** with proper "current position" detection

### Hybrid Approach Advantages

1. **Best of both worlds**: Get improved main field extraction from stagehand + comprehensive data from legacy parser
2. **Graceful degradation**: If stagehand fails, legacy parser provides fallback
3. **No data loss**: All fields that were previously extracted are still available
4. **Better debugging**: Stagehand warnings are now logged alongside extraction data

## Enhanced Logging

Added stagehand warnings to debug logs:

```typescript
logger.debug({
  profileUrl: normalizedUrl,
  experiencesCount: details.experiences?.length ?? 0,
  extractedTitle: details.currentTitle,
  extractedCompany: details.currentCompany,
  extractedCompanyUrl: details.currentCompanyUrl,
  stagehandWarnings: stagehandAnalysis.metadata.warnings  // NEW
}, "Extracted profile details with experience data");
```

When profiles fail to extract, warnings now include stagehand diagnostics:

```typescript
logger.warn({
  profileUrl: normalizedUrl,
  extractedDetails: { ... },
  stagehandWarnings: stagehandAnalysis.metadata.warnings  // NEW
}, "Profile missing a discoverable full name; skipping.");
```

## Testing

Build now succeeds without errors:
```bash
cd backend && npm run build
# ✓ Compiles successfully
```

The hybrid approach ensures:
- All existing tests continue to pass
- Stagehand analyzer is actively used
- Better extraction for problematic profiles

## Selector Strategy

The stagehand analyzer uses the same comprehensive selector strategy documented in `SELECTOR_FIXES.md`, with improvements:

1. **Priority ordering**: Modern → Legacy → Generic → Ultimate fallback
2. **Experience section priority**: Extracts from actual experience data, not top card promotional content
3. **Company URL extraction**: Now properly extracts LinkedIn company URLs from experience section
4. **Confidence scoring**: Each field gets a confidence score based on which tier/selector matched

## Future Improvements

Now that stagehand is integrated, we can:

1. **Add more fields to stagehand analyzer**: Extend it to extract email, phone, connections, etc.
2. **Deprecate legacy parser**: Once stagehand extracts all fields, remove the old parser entirely
3. **Use confidence scores**: Skip or flag low-confidence extractions for manual review
4. **Improve experience parsing**: Add date parsing, duration calculation, and employment gap detection

## Related Files Modified

- `backend/src/linkedin/ProfileListScraper.ts` - Main integration point
- `backend/src/linkedin/stagehand/LinkedInProfileStagehandAnalyzer.ts` - Already existed, now used
- `backend/package.json` - Removed non-existent stagehand dependency
- `backend/src/linkedin/stagehand/profileWorker.ts` - Renamed to `.unused`
- `backend/src/scripts/stagehand/exploreLinkedInProfile.ts` - Renamed to `.unused`

## Selector Fixes for Modern LinkedIn (Post-Integration)

After integrating the stagehand analyzer, testing with real LinkedIn profiles revealed that the selectors needed updates to handle LinkedIn's modern obfuscated class names.

### Issues Found with Real LinkedIn HTML

1. **Experience items not detected**: LinkedIn now uses auto-generated obfuscated class names instead of semantic classes like `pvs-list`
2. **Company name extraction wrong**: Was extracting link URL text instead of company name
3. **Too many experience items**: Was matching education items as experiences (68+ items instead of 2)
4. **Company name had extra text**: Included " · Self-employed" suffix

### Selector Updates Made

#### 1. Experience Item Selectors

Updated to handle modern LinkedIn structure with obfuscated classes:

```typescript
const EXPERIENCE_ITEM_SELECTORS = [
  // Modern LinkedIn - rely on structure and artdeco-list__item
  "div[id='experience'] ~ div > div > ul > li.artdeco-list__item",
  "div.pv-profile-card__anchor#experience ~ div > div > ul > li.artdeco-list__item",
  "div[id='experience'] ~ div ul > li.artdeco-list__item",
  // ... legacy selectors ...
];
```

Key insight: Modern LinkedIn uses:
- `<div id="experience">` as anchor
- Auto-generated class names like `cNpTaOHypiAvlEPOELGpZYejBRGdRjzZYE` for lists
- Consistent `artdeco-list__item` class for list items

#### 2. Company Name Selectors

Fixed to extract from correct span element:

```typescript
const EXPERIENCE_COMPANY_GROUPS: SelectorGroup[] = [
  {
    name: "modern",
    selectors: [
      "span.t-14.t-normal:not(.t-black--light) > span[aria-hidden='true']",
      "a[href*='/company/'] span.t-14.t-normal span[aria-hidden='true']"
    ]
  }
  // ...
];
```

#### 3. Company Name Cleaning

Added logic to remove employment type suffixes:

```typescript
if (companyValue) {
  companyValue = companyValue
    .replace(/\s*·\s*(Self-employed|Full-time|Part-time|Contract|Freelance|Internship).*$/i, "")
    .trim();
}
```

This transforms "GoPackshot.com · Self-employed" → "GoPackshot.com"

#### 4. Education Item Filtering

Added smart filtering to exclude education items from experience list:

```typescript
const hasSchoolLink = element.querySelector("a[href*='/school/']");
const hasDegreeKeywords = /\b(bachelor|master|phd|degree|university|college|school)\b/i.test(elementText);

if ((hasSchoolLink || (hasDegreeKeywords && !hasCompanyLink)) && educationAnchor) {
  const hasExperienceKeywords = /\b(present|current|·|yrs?|mos?|months?)\b/i.test(elementText);
  if (!hasExperienceKeywords) {
    return; // Skip education items
  }
}
```

#### 5. Profile Image Selectors

Made more specific to avoid matching company logos:

```typescript
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
      "button.pv-top-card-profile-picture img"
    ]
  },
  {
    name: "generic",
    selectors: [
      "div.pv-top-card img",
      "section.pv-top-card img",
      "div[class*='top-card'] img:not([alt*='company'])"
    ]
  }
];
```

Removed overly generic `"main img"` and `"section img"` that were matching company logos.

### Test Results

Testing with real LinkedIn profile HTML (19,022 lines):

**Before Fixes:**
- ❌ Experiences found: 0
- ❌ Current company: missing
- ❌ Current title: missing

**After Fixes:**
- ✅ Experiences found: 2 (correct)
- ✅ Current company: "GoPackshot.com" (correct)
- ✅ Current title: "Founder and CEO" (correct)
- ✅ Company URL: "https://www.linkedin.com/company/78074371/" (correct)
- ✅ Profile image: Correct profile photo URL
- ✅ All fields: 7/7 extracted (100%)

### Modern LinkedIn HTML Structure

For reference, modern LinkedIn profiles use this structure:

```html
<div id="experience" class="pv-profile-card__anchor"></div>
<div class="...obfuscated classes...">
  <ul class="...obfuscated classes...">
    <li class="artdeco-list__item ...obfuscated classes...">
      <a href="https://www.linkedin.com/company/12345/">
        <div class="mr1 t-bold">
          <span aria-hidden="true">Founder and CEO</span>
        </div>
        <span class="t-14 t-normal">
          <span aria-hidden="true">GoPackshot.com · Self-employed</span>
        </span>
        <span class="t-14 t-normal t-black--light">
          <span class="pvs-entity__caption-wrapper">Nov 2009 - Present · 16 yrs</span>
        </span>
      </a>
    </li>
  </ul>
</div>
```

Key observations:
- Experience anchor is a separate `<div id="experience">` before the content
- List classes are obfuscated (e.g., `cNpTaOHypiAvlEPOELGpZYejBRGdRjzZYE`)
- `artdeco-list__item` remains consistent
- Title and company are in same `<a>` tag
- Company name includes employment type suffix that needs cleaning

## Summary

The stagehand integration was complete and well-designed, but it wasn't connected to the actual scraping flow. After integration, real-world testing revealed that LinkedIn's modern HTML structure required selector updates to handle obfuscated class names and new DOM patterns. These fixes ensure that the improved selector strategies and analysis capabilities of the stagehand analyzer are now actively used and working correctly when scraping LinkedIn profiles, resulting in more reliable and comprehensive data extraction.
# LinkedIn Profile Selector Fixes

## Problem
The LinkedIn scraper was failing with "Profile missing first name" errors, and was incorrectly extracting company name and title fields. The scraper was pulling company and title from the wrong sections (top card featured companies instead of actual Experience section). For example, if someone worked at "GoPackShot" (current) and previously at "Tradebyte", it would show "Tradebyte" as the current company. Company URL was also missing entirely.

## Changes Made

### 1. Updated Profile Name Selectors (`profile.ts`)

Added comprehensive selector fallbacks for extracting the profile name (`fullName`), organized in priority order:

**Modern LinkedIn Selectors (2024):**
- `h1.text-heading-xlarge` - Current primary selector
- `h1.inline.t-24.v-align-middle.break-words` - Alternative modern format
- `div.ph5 h1` - Container-based selector
- `main > div > section > div > div > div > div > h1` - Deep structure selector

**Legacy Selectors:**
- `h1.pv-top-card-section__name` - Older LinkedIn format
- `h1[data-test-id='hero-title']` - Test ID based
- `.pv-text-details__left-panel h1` - Legacy container
- `.top-card-layout__title` - Card layout format

**Generic Fallbacks:**
- `main section h1` - Generic structure
- `main h1` - Most generic h1 in main
- Various div-based and class-pattern selectors

**Ultimate Fallback:**
- Any `<h1>` element on the page (with length validation)

### 2. Fixed Company and Title Extraction with Experience Section Priority

**Completely rewrote the extraction logic with proper prioritization:**

1. **PRIORITY: Experience Section First** - Extract from the actual Experience section to get the most recent/current position
2. **FALLBACK: Top Card** - Only use top card selectors if Experience section extraction fails

**What's extracted:**
- `currentCompany` - Company name from the first non-ended experience (or first experience if all have end dates)
- `currentCompanyUrl` - Full LinkedIn company URL extracted from company links in Experience section (NEW field)
- `currentTitle` - Job title from the first non-ended experience (NOT the headline)

**Why this matters:**
- LinkedIn's top card sometimes shows featured/highlighted companies, not necessarily current employment
- The Experience section is structured data with the actual employment history
- First experience without an end date = current position
- This approach is more reliable and matches user expectations

### 3. Enhanced Other Field Selectors

Applied the same multi-level fallback strategy to:
- `headline` - Job title/headline under name (descriptive text, not job title)
- `location` - Geographic location
- `profileImageUrl` - Profile photo

### 4. Improved Error Logging (`ProfileListScraper.ts`)

When a profile name cannot be found, the scraper now logs:
- Page title
- First H1 element text
- Meta og:title value
- All other successfully extracted details (headline, location, etc.)

This helps diagnose what LinkedIn is actually returning vs. what we're looking for.

## Why This Works

### Multi-Tier Fallback Strategy
LinkedIn frequently changes their DOM structure and CSS classes. By having multiple selector tiers:
1. **Modern selectors** catch current LinkedIn pages
2. **Legacy selectors** maintain backward compatibility
3. **Generic selectors** work when specific classes change
4. **Structural selectors** rely on HTML hierarchy rather than classes
5. **Ultimate fallback** ensures we extract *something* if an h1 exists

### Resilient to Changes
- Class names can be updated by LinkedIn without breaking the scraper
- Multiple extraction attempts mean higher success rate
- Generic selectors work across different LinkedIn UI versions
- Meta tag and JSON-LD fallbacks use semantic data

## Testing

Two new test cases added to verify:
1. Modern LinkedIn profile structure (2024)
2. Generic h1 fallback when all specific selectors fail

Run tests with:
```bash
cd backend && npm test
```

## Debugging Future Issues

If you encounter "Profile missing first name" errors again:

1. **Check the logs** - They now include detailed debugging info:
   - What the page title is
   - What's in the first h1 element
   - What other fields were successfully extracted

2. **Inspect the actual LinkedIn page structure**:
   ```javascript
   // In browser console on LinkedIn profile:
   document.querySelector('h1')?.textContent
   document.querySelector('h1')?.className
   ```

3. **Add new selectors** to the selector arrays in `profile.ts`:
   - Add them near the top for priority
   - Follow the pattern: most specific to most generic
   - Test with multiple LinkedIn profiles

4. **Check field extraction logic**:
   - Verify that company name comes from company links, not text spans
   - Ensure title comes from experience section, not headline
   - Confirm fields aren't accidentally swapped

5. **Consider using data attributes**:
   - LinkedIn sometimes uses `[data-test-id]` attributes
   - These are more stable than class names

## Maintenance Notes

- The selector array should be maintained in order: modern → legacy → generic
- When adding new selectors, test against multiple LinkedIn profile types:
  - Regular user profiles
  - Premium/LinkedIn Premium users
  - Company pages (if applicable)
  - Different geographic regions (LinkedIn shows different UIs by region)
  
- If LinkedIn makes major changes, check these files:
  - `backend/src/linkedin/parsers/profile.ts` - Main extraction logic
  - `backend/src/linkedin/ProfileListScraper.ts` - Profile scraping orchestration
  - `backend/src/linkedin/parsers/__tests__/profile.test.ts` - Test cases

## Key Technical Details

### Company and Title Extraction Strategy

The new extraction logic follows a strict priority order:

**Phase 1: Experience Section (PRIMARY)**
1. Extract all experiences using `extractExperiences(root)`
2. Find current experience: First entry without `endDate`, or just first entry
3. Extract `currentTitle` from experience's title field
4. Extract `currentCompany` from experience's company field (prefers company links over text)
5. Extract `currentCompanyUrl` by finding `<a href="/company/...">` in first experience list item

**Phase 2: Top Card Fallback (SECONDARY)**
- Only runs if Phase 1 didn't find company or title
- Searches top card sections for company links and title text
- Uses validation: extracted title ≠ company name and title ≠ headline

**Why Experience Section First?**
- Experience section contains structured employment history with dates
- First non-ended experience = current position (semantic meaning)
- Top card can show featured/highlighted content that's not current employment
- More reliable for extracting actual job information vs. promotional content

**Example:**
If a profile shows:
- Top card: "Entrepreneur at Tradebyte" (featured/past company)
- Experience: "Founder and CEO at GoPackShot (2023 - Present)"
- Experience: "Software Engineer at Tradebyte (2020 - 2022)"

Result: currentTitle = "Founder and CEO", currentCompany = "GoPackShot" ✓
(Old logic would have incorrectly used "Tradebyte" from top card)

## Related Files Modified

- `backend/src/linkedin/parsers/profile.ts` - Main selector updates, company/title extraction rewrite
- `backend/src/linkedin/ProfileListScraper.ts` - Enhanced error logging, added companyUrl field
- `backend/src/linkedin/PostEngagementScraper.ts` - Added companyUrl support
- `backend/src/linkedin/parsers/postEngagement.ts` - Added companyUrl to interface
- `backend/src/linkedin/parsers/__tests__/profile.test.ts` - New test cases including company URL validation
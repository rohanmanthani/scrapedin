import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { extractProfileDetails } from "../profile.js";

const buildDocument = (html: string) => {
  const dom = new JSDOM(html, { url: "https://www.linkedin.com/in/example/" });
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  return dom.window.document;
};

test("extractProfileDetails captures top card, experience, and education details", () => {
  const html = `
    <main>
      <section class="pv-top-card">
        <h1 class="text-heading-xlarge">Dana Example</h1>
        <div class="text-body-medium break-words">Director of Sales at Example Corp</div>
        <span class="text-body-small inline t-black--light break-words">Austin, Texas, United States</span>
        <img class="pv-top-card-profile-picture__image" src="https://cdn.example.com/photo.jpg" />
      </section>
      <section id="experience-section">
        <ul class="pv-profile-section__section-info">
          <li>
            <div class="display-flex flex-column full-width align-self-center">
              <span aria-hidden="true">Head of Sales</span>
              <span class="t-14 t-normal">Example Corp</span>
            </div>
            <span class="pv-entity__caption">Jan 2021 - Present · 3 yrs</span>
          </li>
          <li>
            <div class="display-flex flex-column full-width align-self-center">
              <span aria-hidden="true">Sales Manager</span>
              <span class="t-14 t-normal">Other Co</span>
            </div>
            <span class="pv-entity__caption">May 2017 - Dec 2020 · 3 yrs 8 mos</span>
            <span class="pv-entity__location">Chicago, Illinois</span>
          </li>
        </ul>
      </section>
      <section id="education-section">
        <ul class="pv-profile-section__section-info">
          <li>
            <div>
              <h3><span aria-hidden="true">State University</span></h3>
              <span class="pv-entity__degree-name"><span class="pv-entity__comma-item">B.S. Marketing</span></span>
              <span class="pv-entity__fos"><span class="pv-entity__comma-item">Marketing</span></span>
              <span class="pv-entity__dates">2008 - 2012</span>
            </div>
          </li>
        </ul>
      </section>
      <section class="pv-contact-info__contact-type">
        <a href="mailto:dana@example.com">dana@example.com</a>
        <a href="tel:+1-555-123-4567">+1 555 123 4567</a>
        <span data-test-id="birthday">March 5</span>
      </section>
    </main>
  `;

  const document = buildDocument(html);
  const details = extractProfileDetails({ root: document });

  assert.equal(details.fullName, "Dana Example");
  assert.equal(details.headline, "Director of Sales at Example Corp");
  assert.equal(details.location, "Austin, Texas, United States");
  assert.equal(details.profileImageUrl, "https://cdn.example.com/photo.jpg");
  assert.equal(details.email, "dana@example.com");
  assert.deepEqual(details.phoneNumbers, ["+1 555 123 4567"]);
  assert.equal(details.birthday, "March 5");
  assert.equal(details.currentTitle, "Head of Sales");
  assert.equal(details.currentCompany, "Example Corp");
  assert.equal(details.currentCompanyStartedAt, "Jan 2021");
  assert.ok(Array.isArray(details.experiences));
  assert.equal(details.experiences?.length, 2);
  assert.deepEqual(details.experiences?.[0], {
    title: "Head of Sales",
    company: "Example Corp",
    location: undefined,
    dateRangeText: "Jan 2021 - Present · 3 yrs",
    startDate: "Jan 2021",
    endDate: undefined,
    description: undefined
  });
  assert.equal(details.experiences?.[1]?.location, "Chicago, Illinois");
  assert.ok(Array.isArray(details.education));
  assert.deepEqual(details.education?.[0], {
    school: "State University",
    degree: "B.S. Marketing",
    fieldOfStudy: "Marketing",
    dateRangeText: "2008 - 2012"
  });
});

test("extractProfileDetails falls back to metadata when heading is missing", () => {
  const html = `
    <html>
      <head>
        <meta property="og:title" content="Kamil Czaja | LinkedIn" />
      </head>
      <body>
        <main>
          <script type="application/ld+json">
            {"@context":"https://schema.org","@type":"Person","name":"Kamil Czaja"}
          </script>
        </main>
      </body>
    </html>
  `;

  const document = buildDocument(html);
  const details = extractProfileDetails({ root: document });

  assert.equal(details.fullName, "Kamil Czaja");
});

test("extractProfileDetails works with modern LinkedIn profile structure (2024)", () => {
  const html = `
    <main>
      <section>
        <div class="ph5">
          <h1 class="text-heading-xlarge">Sarah Johnson</h1>
          <div class="text-body-medium break-words">Senior Product Manager at Tech Corp</div>
          <span class="text-body-small inline t-black--light break-words">San Francisco Bay Area</span>
        </div>
        <img class="pv-top-card-profile-picture__image--show" src="https://cdn.example.com/sarah.jpg" />
      </section>
      <section id="experience">
        <ul class="pvs-list">
          <li>
            <span aria-hidden="true">Product Manager</span>
            <a href="/company/tech-corp/">Tech Corp</a>
            <span class="pvs-entity__caption-wrapper">2020 - Present · 4 yrs</span>
          </li>
          <li>
            <span aria-hidden="true">Associate Product Manager</span>
            <a href="/company/old-company/">Old Company</a>
            <span class="pvs-entity__caption-wrapper">2018 - 2020 · 2 yrs</span>
          </li>
        </ul>
      </section>
    </main>
  `;

  const document = buildDocument(html);
  const details = extractProfileDetails({ root: document });

  assert.equal(details.fullName, "Sarah Johnson");
  assert.equal(details.headline, "Senior Product Manager at Tech Corp");
  assert.equal(details.location, "San Francisco Bay Area");
  assert.equal(details.profileImageUrl, "https://cdn.example.com/sarah.jpg");
  assert.equal(details.currentCompany, "Tech Corp");
  assert.equal(details.currentCompanyUrl, "https://www.linkedin.com/company/tech-corp/");
  assert.equal(details.currentTitle, "Product Manager");
});

test("extractProfileDetails prioritizes Experience section over top card", () => {
  const html = `
    <main>
      <section>
        <div class="ph5">
          <h1 class="text-heading-xlarge">John Doe</h1>
          <div class="text-body-medium break-words">Entrepreneur at Featured Company</div>
        </div>
      </section>
      <section id="experience">
        <ul class="pvs-list">
          <li>
            <span aria-hidden="true">Founder and CEO</span>
            <a href="/company/gopackshot/">GoPackShot</a>
            <span class="pvs-entity__caption-wrapper">Jan 2023 - Present</span>
          </li>
          <li>
            <span aria-hidden="true">Software Engineer</span>
            <a href="/company/tradebyte/">Tradebyte</a>
            <span class="pvs-entity__caption-wrapper">2020 - Dec 2022</span>
          </li>
        </ul>
      </section>
    </main>
  `;

  const document = buildDocument(html);
  const details = extractProfileDetails({ root: document });

  assert.equal(details.fullName, "John Doe");
  assert.equal(details.headline, "Entrepreneur at Featured Company");
  assert.equal(details.currentTitle, "Founder and CEO");
  assert.equal(details.currentCompany, "GoPackShot");
  assert.equal(details.currentCompanyUrl, "https://www.linkedin.com/company/gopackshot/");
});

test("extractProfileDetails falls back to any h1 when specific selectors fail", () => {
  const html = `
    <main>
      <section>
        <div class="some-unknown-class">
          <h1>John Smith</h1>
          <div>Software Engineer</div>
        </div>
      </section>
    </main>
  `;

  const document = buildDocument(html);
  const details = extractProfileDetails({ root: document });

  assert.equal(details.fullName, "John Smith");
});

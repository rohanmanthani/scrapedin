import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { extractAccountProfiles } from "../accountFollowers.js";

const buildDocument = (html: string, url: string) => {
  const dom = new JSDOM(html, { url });
  globalThis.Element = dom.window.Element;
  globalThis.HTMLAnchorElement = dom.window.HTMLAnchorElement;
  return dom.window.document;
};

test("extractAccountProfiles captures profile details and dedupes by URL", () => {
  const html = `
    <main>
      <div class="org-top-card-summary__title">
        <h1>Example Corporation</h1>
      </div>
      <ul class="org-people-profiles-module__profiles-list">
        <li class="org-people-profile-card">
          <div class="org-people-profile-card__profile-info">
            <div class="org-people-profile-card__profile-title">Alice Example</div>
            <div class="org-people-profile-card__profile-headline">Founder at Example Corp</div>
            <div class="org-people-profile-card__profile-location">San Francisco Bay Area</div>
          </div>
          <a class="org-people-profile-card__profile-link" href="/in/alice-example/">View profile</a>
        </li>
        <li class="org-people-profile-card__profile-list-item">
          <div class="org-people-profile-card__profile-info">
            <div class="org-people-profile-card__profile-title">Bob Builder</div>
            <div class="org-people-profile-card__profile-headline">VP Engineering</div>
            <div class="org-people-profile-card__profile-location">New York, United States</div>
          </div>
          <a class="org-people-profile-card__profile-link" href="/in/bob-builder/">View profile</a>
        </li>
        <li class="org-people-profile-card">
          <div class="org-people-profile-card__profile-info">
            <div class="org-people-profile-card__profile-title">Alice Example</div>
            <div class="org-people-profile-card__profile-headline">Founder at Example Corp</div>
          </div>
          <a class="org-people-profile-card__profile-link" href="/in/alice-example/">Duplicate reference</a>
        </li>
      </ul>
    </main>
  `;
  const document = buildDocument(html, "https://www.linkedin.com/company/example/people/");
  const profiles = extractAccountProfiles({
    root: document,
    origin: "https://www.linkedin.com/company/example/people/"
  });

  assert.equal(profiles.length, 2);
  assert.deepStrictEqual(profiles[0], {
    fullName: "Alice Example",
    profileUrl: "https://www.linkedin.com/in/alice-example/",
    headline: "Founder at Example Corp",
    location: "San Francisco Bay Area",
    companyName: "Example Corporation"
  });
  assert.equal(profiles[1].fullName, "Bob Builder");
  assert.equal(profiles[1].profileUrl, "https://www.linkedin.com/in/bob-builder/");
  assert.equal(profiles[1].companyName, "Example Corporation");
});

test("extractAccountProfiles honors limit option", () => {
  const html = `
    <ul>
      <li class="org-people-profile-card">
        <div class="org-people-profile-card__profile-title">One</div>
        <a class="org-people-profile-card__profile-link" href="/in/one/">Profile</a>
      </li>
      <li class="org-people-profile-card">
        <div class="org-people-profile-card__profile-title">Two</div>
        <a class="org-people-profile-card__profile-link" href="/in/two/">Profile</a>
      </li>
      <li class="org-people-profile-card">
        <div class="org-people-profile-card__profile-title">Three</div>
        <a class="org-people-profile-card__profile-link" href="/in/three/">Profile</a>
      </li>
    </ul>
  `;
  const document = buildDocument(html, "https://www.linkedin.com/company/example/people/");
  const profiles = extractAccountProfiles({
    root: document,
    origin: "https://www.linkedin.com/company/example/people/",
    limit: 2
  });

  assert.equal(profiles.length, 2);
  assert.equal(profiles[0].fullName, "One");
  assert.equal(profiles[1].fullName, "Two");
});

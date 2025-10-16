import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { extractComments, extractReactors } from "../postEngagement.js";

const buildDocument = (html: string, url: string) => {
  const dom = new JSDOM(html, { url });
  globalThis.Element = dom.window.Element;
  globalThis.HTMLAnchorElement = dom.window.HTMLAnchorElement;
  return dom.window.document;
};

test("extractReactors captures reaction metadata", () => {
  const html = `
    <section class="social-details-reactors-tab__content">
      <ul>
        <li class="reactor-entry">
          <a href="/in/caroline-reactor/">
            <span class="reactor-entry__member-name">Caroline Reactor</span>
          </a>
          <div class="reactor-entry__member-headline">CMO at Growth Labs</div>
          <span class="reactor-entry__member-secondary-title">Austin, Texas</span>
          <span class="reactor-entry__reaction-type">Insightful</span>
        </li>
        <li class="reactor-entry">
          <a href="/in/dylan-reactor/">Dylan Reactor</a>
          <div class="reactor-entry__member-headline">Director of Sales</div>
          <span class="reactor-entry__member-secondary-title">Boston, MA</span>
          <span class="reactor-entry__reaction-type">Like</span>
        </li>
        <li class="reactor-entry">
          <a href="/in/caroline-reactor/">Duplicate entry</a>
        </li>
      </ul>
    </section>
  `;
  const document = buildDocument(html, "https://www.linkedin.com/feed/update/urn:li:activity:123456789/");
  const reactors = extractReactors({
    root: document,
    origin: "https://www.linkedin.com/feed/update/urn:li:activity:123456789/"
  });

  assert.equal(reactors.length, 2);
  assert.deepStrictEqual(reactors[0], {
    fullName: "Caroline Reactor",
    profileUrl: "https://www.linkedin.com/in/caroline-reactor/",
    headline: "CMO at Growth Labs",
    location: "Austin, Texas",
    reactionLabel: "Insightful"
  });
  assert.equal(reactors[1].fullName, "Dylan Reactor");
  assert.equal(reactors[1].reactionLabel, "Like");
});

test("extractComments captures commenter headline and text", () => {
  const html = `
    <section class="comments-comments-list">
      <ul>
        <li class="comments-comments-list__comment-item" data-id="urn:li:comment:1">
          <a class="comments-comment-item__profile-link" href="/in/erica-commenter/">
            <span class="comments-post-meta__name-text">Erica Commenter</span>
          </a>
          <div class="comments-comment-item__body">
            <span class="comments-comment-item__main-content">Great insights, thank you for sharing!</span>
          </div>
          <div class="comments-comment-item__headline">VP Revenue at Example Inc.</div>
        </li>
        <li class="comments-comments-list__comment-item" data-id="urn:li:comment:2">
          <a class="comments-comment-item__profile-link" href="/in/fred-commenter/">Fred Commenter</a>
          <div class="comments-comment-item__main-content">Following this closely.</div>
        </li>
      </ul>
    </section>
  `;
  const document = buildDocument(html, "https://www.linkedin.com/feed/update/urn:li:activity:123456789/");
  const comments = extractComments({
    root: document,
    origin: "https://www.linkedin.com/feed/update/urn:li:activity:123456789/"
  });

  assert.equal(comments.length, 2);
  assert.deepStrictEqual(comments[0], {
    fullName: "Erica Commenter",
    profileUrl: "https://www.linkedin.com/in/erica-commenter/",
    headline: "VP Revenue at Example Inc.",
    location: undefined,
    commentText: "Great insights, thank you for sharing!"
  });
  assert.equal(comments[1].fullName, "Fred Commenter");
  assert.equal(comments[1].commentText, "Following this closely.");
});

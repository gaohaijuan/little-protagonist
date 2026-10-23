'use strict';

// Editorial source is independent of the rejected compression generators.
// Author the prose and review notes together, then render and audit actual text.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'content/level1-reviewed-manuscript-source.json');
const draft = JSON.parse(fs.readFileSync(source, 'utf8'));
assert.equal(draft.books.length, 30);
for (const [i, book] of draft.books.entries()) {
  assert.equal(book.number, i + 1);
  for (const key of ['form', 'hook', 'pageTurn', 'ending', 'decision']) {
    assert.ok(book.editorialReview?.[key]?.trim(), `${book.number}: missing editorial rationale ${key}`);
  }
}
const destination = path.join(root, 'content/level1-stories-reviewed-30.json');
fs.writeFileSync(destination, JSON.stringify(draft, null, 2) + '\n');
console.log(destination);

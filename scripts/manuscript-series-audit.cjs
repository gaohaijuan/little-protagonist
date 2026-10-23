'use strict';

// This checks textual recurrence only; plot comparisons remain authored editorial decisions.
const { uniqueHan } = require('../miniprogram/lib/literacy');

function indexCharacters(books) {
  const index = new Map();
  for (const book of books) {
    for (const character of uniqueHan(book.pages.flat().join(''))) {
      if (!index.has(character)) index.set(character, []);
      index.get(character).push(book.number);
    }
  }
  return [...index].map(([character, books]) => ({
    character, books, distinctStories: books.length, firstStory: books[0],
    nextStory: books[1] ?? null,
    largestStoryInterval: books.length > 1 ? Math.max(...books.slice(1).map((n, i) => n - books[i])) : null
  }));
}

function indexWords(books, targets) {
  return targets.map(word => ({ word, occurrences: books.flatMap(book => book.pages.flatMap((lines, i) => {
    const text = lines.join('');
    // Punctuation and line breaks do not prevent a counting phrase from matching.
    const normalized = text.replace(/[^\p{Script=Han}]/gu, '');
    return normalized.includes(word) ? [{ story: book.number, page: i + 1, quote: lines.join(' / ') }] : [];
  })) })).map(item => ({ ...item, distinctStories: new Set(item.occurrences.map(o => o.story)).size }));
}

function createSeriesAudit(draft, baseline) {
  const characters = indexCharacters(draft.books);
  const words = indexWords(draft.books, draft.seriesReview.wordTargets);
  const early = characters.filter(c => c.firstStory <= 20);
  const earlyUnrepeated = early.filter(c => c.distinctStories === 1);
  const baselineEarly = baseline.characters.filter(c => c.firstStory <= 20);
  const newlyRepeated = characters.filter(c => c.distinctStories > 1 && baseline.characters.some(b => b.character === c.character && b.distinctStories === 1));
  return {
    countingRule: '正文、跨不同篇；不包含标题、目录、识字小结和编辑提示。同篇再多次也不增加distinctStories；不同词义的同字只算字形接触。',
    earlyFirstStoryCutoff: 20,
    actualCharacters: characters.length,
    repeatedInMultipleStories: characters.filter(c => c.distinctStories >= 2).length,
    earlyCharacters: early.length,
    earlyRepeated: early.length - earlyUnrepeated.length,
    earlyUnrepeated,
    lateUnrepeated: characters.filter(c => c.firstStory > 20 && c.distinctStories === 1),
    baselineEdition: baseline.edition,
    baselineSingleStoryCount: baseline.characters.filter(c => c.distinctStories === 1).length,
    singleStoryCount: characters.filter(c => c.distinctStories === 1).length,
    newlyRepeated,
    returnedToSingleStory: characters.filter(c => c.distinctStories === 1 && baseline.characters.some(b => b.character === c.character && b.distinctStories > 1)),
    baselineEarlyCharacters: baselineEarly.length,
    baselineEarlyRepeated: baselineEarly.filter(c => c.distinctStories > 1).length,
    newlyBridgedEarlyCharacters: characters.filter(c => c.firstStory <= 20 && c.distinctStories > 1 && baseline.characters.some(b => b.character === c.character && b.distinctStories === 1 && b.firstStory <= 20)).map(c => c.character).join(''),
    words, characters,
    editorialDecisions: draft.seriesReview.decisions,
    limits: draft.seriesReview.limits
  };
}

module.exports = { indexCharacters, indexWords, createSeriesAudit };

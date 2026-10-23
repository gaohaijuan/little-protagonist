'use strict';

// These are text exposures, not a claim that a child has mastered a character.
// Supply reading pages with personalized name slots replaced by a non-Han token.
// Titles, UI labels, focus lists, punctuation and numbers do not enter the count.
function uniqueHan(text) {
  return Array.from(new Set(String(text).match(/\p{Script=Han}/gu) || []));
}

function summarizeBooks(books) {
  const seen = new Set();
  return books.map((book, index) => {
    const characters = uniqueHan(book.pages.flat().join(''));
    const newCharacters = characters.filter(character => !seen.has(character));
    characters.forEach(character => seen.add(character));
    return {
      id: book.id, number: book.number || index + 1,
      characters, newCharacters, cumulativeCharacters: Array.from(seen),
      count: characters.length, newCount: newCharacters.length,
      cumulativeCount: seen.size
    };
  });
}

module.exports = { uniqueHan, summarizeBooks };

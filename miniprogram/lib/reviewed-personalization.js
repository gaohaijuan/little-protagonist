'use strict';

const { participants, roleLabel, numberWord } = require('./family');
const { validateProfile } = require('./profile');
const { summarizeBooks, uniqueHan } = require('./literacy');
const AGE_WORDS = { 3: '三', 4: '四', 5: '五', 6: '六' };

function familyStory(members) {
  const people = participants(members);
  const others = people.filter(person => person.id !== 'child');
  const ids = people.map(person => person.id);
  // Balance people between the two existing pages before grouping captions.
  // Six people: parents on one page, grandparents and sibling on the next.
  const splitPeople = others.length === 3 ? 2 : Math.max(1, Math.floor(others.length / 2));
  const introductions = [others.slice(0, splitPeople), others.slice(splitPeople)].map(pagePeople => {
    const lines = [], groups = [];
    const groupSize = Math.max(1, Math.ceil(pagePeople.length / 2));
    for (let i = 0; i < pagePeople.length; i += groupSize) {
      const group = pagePeople.slice(i, i + groupSize);
      const labels = group.map(person => roleLabel(person.role));
      const phrase = labels.length <= 1 ? labels[0] : labels.slice(0, -1).join('、') + '和' + labels[labels.length - 1];
      lines.push('这是' + phrase + '。');
      groups.push(group.map(person => person.id));
    }
    return { lines, groups };
  });
  const counted = others.length === 2 ? '两' : numberWord(others.length);
  const total = people.length === 2 ? '两' : numberWord(people.length);
  const pages = [
    ['我家有几口人？', '我来数一数。'],
    introductions[0].lines, introductions[1].lines,
    ['我数好了！', '一共有' + counted + '口人。'],
    ['咦？', '我把谁忘了？'],
    ['是我呀！', '还要加上我。'],
    ['我家有' + total + '口人。', '我们都在家！']
  ];
  if (others.length === 1) pages[2] = ['我来数一数。', '一！'];
  if (others.length === 0) throw new Error('请至少选择一位实际出场的家人。');
  const scenes = [
    { kind: 'group', memberIds: ids },
    ...introductions.map(page => ({ kind: 'members', memberIds: page.groups.flat(), lineMemberIds: page.groups })),
    { kind: 'count', memberIds: others.map(person => person.id), count: others.length },
    { kind: 'remember', memberIds: ids, focusId: 'child' },
    { kind: 'remember', memberIds: ids, focusId: 'child' },
    { kind: 'group', memberIds: ids, count: people.length }
  ];
  if (others.length === 1) scenes[2] = { kind: 'count', memberIds: [others[0].id], count: 1 };
  return { pages, scenes };
}

// Same profile/members schema as the account and main reading application.
// No DOM/storage/network dependencies; callers can generate text from saved settings.
function personalizeReviewedBooks(sourceBooks, inputProfile, members, options) {
  const profile = validateProfile(inputProfile);
  const people = participants(members);
  const adults = people.filter(person => ['dad', 'mom', 'grandpa', 'grandma'].includes(person.role));
  if (!adults.length) throw new Error('这些亲子故事需要一位实际参与的大人，请选择爸爸、妈妈、爷爷或奶奶。');
  const dad = adults.find(person => person.role === 'dad') || adults.find(person => person.role !== 'mom') || adults[0];
  const mom = adults.find(person => person.role === 'mom') || adults.find(person => person.id !== dad.id) || dad;
  const dadLabel = roleLabel(dad.role), momLabel = roleLabel(mom.role);
  const combined = dad.id === mom.id ? dadLabel : dadLabel + '和' + momLabel;
  const name = options && options.forStatistics ? 'CHILD' : profile.name;
  const replace = value => value.split('CHILD').join(name).replaceAll('爸爸妈妈', '__ADULTS__')
    .replaceAll('爸爸', '__DAD__').replaceAll('妈妈', '__MOM__')
    .replaceAll('__ADULTS__', combined).replaceAll('__DAD__', dadLabel).replaceAll('__MOM__', momLabel);
  const books = sourceBooks.map(book => ({ ...book, title: replace(book.title), pages: book.pages.map(page => page.map(replace)) }));
  books[0].pages[3] = ['我' + AGE_WORDS[profile.age] + '岁了。', '你几岁呢？'];
  books[0].pages[4] = ['我上' + profile.className + '了。'];
  Object.assign(books[2], familyStory(members));
  books[20].pages[6] = ['我' + AGE_WORDS[profile.age] + '岁了！', '我上' + profile.className + '了！'];
  if (dad.id === mom.id) {
    books[29].pages[1] = [momLabel + '拿来水果蛋糕，', '还有一本新书。'];
    books[29].pages[4] = [dadLabel + '说：你画的，我做的。', '我很喜欢我的书！'];
  }
  return books;
}

function auditReviewedBooks(books) {
  const seen = new Set();
  return summarizeBooks(books).map((row, i) => {
    const pageNew = books[i].pages.map(lines => {
      const chars = uniqueHan(lines.join(''));
      const fresh = chars.filter(character => !seen.has(character));
      chars.forEach(character => seen.add(character));
      return fresh;
    });
    return { ...row, pageNew, peak: Math.max(...pageNew.map(chars => chars.length)), pages: books[i].pages.length };
  });
}

module.exports = { familyStory, personalizeReviewedBooks, auditReviewedBooks };

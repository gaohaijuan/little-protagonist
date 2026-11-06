const { familyBook } = require('./family');
const approvedStories = require('./level1-approved');
const AGE_WORDS = { 3: '三', 4: '四', 5: '五', 6: '六' };

function listBooks(profile, members, options) {
  if(options?.currentEdition)return require('./current-edition').listBooks(profile,members);
  const child = profile || {};
  const name = child.name || '小石头';
  const age = AGE_WORDS[child.age] || '五';
  const className = ['小班', '中班', '大班'].includes(child.className) ? child.className : '大班';
  const books = [
    {
      id: 'intro', title: '你好，我是' + name, tag: '认识自己', group: '第 1 组',
      description: '把自己介绍给新朋友。', tone: 'peach',
      pages: [
        ['你好！', '我是' + name + '。'],
        ['我的名字', '叫' + name + '。'],
        ['你的名字', '是什么呢？'],
        ['我' + age + '岁了。', '你几岁呢？'],
        ['我上' + className + '了。'],
        ['你也是吗？']
      ]
    },
    {
      id: 'flower', title: '我的花', tag: '数数花瓣', group: '第 2 组',
      description: '一阵风来，小花瓣飞呀飞。', tone: 'green',
      pages: [
        ['我的小花。'], ['我的花', '有好多片。'],
        ['一片两片三四片，'], ['五片六片七八片，'],
        ['九片十片十一片，'], ['飞入草丛都不见。']
      ]
    },
    {
      id: 'family', title: '我家有几口人？', tag: '认识家人', group: '第 3 组',
      description: '和家人一起，看看家里有谁。', tone: 'yellow',
      pages: [
        ['我家有几口人？'], ['这是爷爷。'], ['这是奶奶。'],
        ['这是爸爸。'], ['这是妈妈。'], ['还有我！'],
        ['我家有五口人。'], ['我们都在家！']
      ]
    }
  ];
  // Browser profiles opt into editable families. The native prototype still
  // uses its established eight-page story when no members argument is given.
  if (members !== undefined) Object.assign(books[2], familyBook(child, members));
  // The browser has layered illustrations through book 10.
  // Native callers retain their original shelf until their renderer supports them.
  if (options && options.includeApproved === true) {
    // Scene IDs and source numbers stay stable when the reading order changes.
    const earlyOrder = ['hands', 'mountain', 'rain', 'stone'];
    const ordered = earlyOrder.map(id => approvedStories.find(book => book.id === id))
      .concat(approvedStories.filter(book => !earlyOrder.includes(book.id)));
    books.push(...ordered.map((book, index) => ({ ...book, sourceNumber: book.number,
      number: index + 4, pages: book.pages.map(lines => lines.slice()) })));
  }
  return books;
}

function getBook(id, profile, members, options) {
  return listBooks(profile, members, options).find((book) => book.id === id) || null;
}

module.exports = { listBooks, getBook };

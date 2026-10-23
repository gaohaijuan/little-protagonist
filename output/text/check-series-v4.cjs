const fs = require('node:fs');
const file = 'content/level1-reviewed-manuscript-source.json';
const d = JSON.parse(fs.readFileSync(file, 'utf8'));
const before = JSON.parse(fs.readFileSync('output/text/manuscript-before-series-v4.json', 'utf8'));
d.rewrittenInThisEdition = d.books.filter((b,i) => JSON.stringify(b.pages) !== JSON.stringify(before.books[i].pages)).map(b => b.number);
fs.writeFileSync(file, JSON.stringify(d,null,2)+'\n');

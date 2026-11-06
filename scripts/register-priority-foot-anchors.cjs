'use strict';
// Attachment metadata only. Native bodies, collar, anatomy and portrait geometry remain identical.
const fs=require('node:fs'),path=require('node:path');const file=path.resolve(__dirname,'../content/child-pose-library.json'),p=JSON.parse(fs.readFileSync(file,'utf8'));
for(const[id,a]of Object.entries({'barefoot-stand':{x:735,y:1280},'barefoot-step':{x:695,y:1328}}))p.poses[id].attachments.rightInstep=a;
fs.writeFileSync(file,JSON.stringify(p,null,2)+'\n');

'use strict';
const LEVEL_COUNT = 10, STORIES_PER_VOLUME = 10, TARGET_STORIES = 30;
function createServicePlan(catalog, level = 1) {
  if (!Number.isInteger(level) || level < 1 || level > LEVEL_COUNT) throw Error('请选择第1至10级');
  const stories = level === 1 ? catalog : [];
  if (!Array.isArray(stories)) throw Error('打印内容无效');
  const current=require('./current-edition');
  if(level===1&&current.matches(stories))return {...current.orderPlan(),available:true,
    targetStoryCount:15,storiesPerVolume:15,targetVolumeCount:1,
    volumes:[{...current.orderPlan().volumes[0],books:stories}]};
  const ids = new Set();
  for (const story of stories) {
    if (!story.id || ids.has(story.id) || !Array.isArray(story.pages) || !story.pages.length) throw Error('不能打印未完成或重复的故事');
    ids.add(story.id);
  }
  const volumes = [];
  for (let offset = 0; offset < stories.length; offset += STORIES_PER_VOLUME) {
    const books = stories.slice(offset, offset + STORIES_PER_VOLUME);
    volumes.push({number:volumes.length+1,firstStory:offset+1,lastStory:offset+books.length,books,storyCount:books.length});
  }
  return {level,available:stories.length>0,sample:stories.length<TARGET_STORIES,storyCount:stories.length,volumeCount:volumes.length,
    targetStoryCount:TARGET_STORIES,storiesPerVolume:STORIES_PER_VOLUME,targetVolumeCount:3,volumes};
}
module.exports = {LEVEL_COUNT,STORIES_PER_VOLUME,TARGET_STORIES,createServicePlan};

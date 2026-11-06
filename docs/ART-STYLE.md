# 项目画风约束（锁定）

状态：已确认（用户 2026-11-06：“生图一定要按照以前的画风来，不要重新设计新的画风”）。

本项目只有一种画风，即第一级、第二级已上架插画所用的画风。新图只能延续这种画风，**不得重新设计、更新或“优化”画风**。确需调整时，必须先由用户书面批准，再修改本文件。

## 1. 画风定义

**暖色水粉/水彩 + 手工剪纸拼贴质感的学龄前绘本。**

- **质感**：画面由细小的纸片和笔触拼成马赛克状的手工纹理，所有表面（墙、地板、草、衣服、皮肤）都能看到这种纸张颗粒和拼贴碎片；边缘是手绘的柔和边，不用矢量硬边。
- **光线**：温暖的阳光或灯光，常有斑驳的树影、窗影投在地面和墙上；夜景用紫蓝色的窗外夜色，对比室内暖黄的灯光。
- **色板**：奶油色纸底和墙面；蜂蜜色/橡木色木地板；芥末黄、鼠尾草绿、深苔绿；陶土红（屋瓦、花盆、鞋）；灰蓝绿（窗框、门）；点缀白色雏菊和小黄花。整体饱和度中等偏暖。
- **场景母题**：欧式乡村小屋与庭院——石墙、陶土瓦、绿色木门窗、陶土花盆、爬藤植物、白色雏菊、木质书架和编织篮。
- **造型**：适度简化的写实，有体积和光影，不是扁平图标，也不是照片写实。
- **人物**（固定角色库，不得改动）：
  - 小主角身体：芥末黄针织毛衣（带奶油色胸袋）、鼠尾草绿短裤、白色或奶油色袜子、红色或橙红色帆布鞋；采用学龄前儿童的大头比例（`child-v1` 母版），无头，头部由真人照片合成。
  - 爸爸、妈妈、伙伴等已有角色：服装、发型和外貌沿用已登记的素材，不另行设计。
- **构图**：画面留出清楚的空地，供后合成的人物和道具摆放；不在画面中出现任何文字、标签、水印或边框。

## 2. 标准参考图（出图时必须作为参考图附上）

| 类型 | 参考图 |
| --- | --- |
| 户外庭院 | `art-samples/first-ten-native/ball-yard-wide.png` |
| 户外花园与人物 | `art-samples/my-flower-production/care.png` |
| 室内白天 | `art-samples/level2-last-three-native/studio-floor.png` |
| 室内夜晚 | `art-samples/book-20-native/sleep-bedroom.png` |
| 儿童身体动作 | `content/child-pose-library.json` 中已登记的同类动作原图 |
| 固定角色 | 该角色已登记的素材原图 |

新增的背景至少附 1 张同类场景的参考图；新增动作必须以已登记的最接近动作作为编辑底图（precise-object-edit），只修改需要改变的部位。

## 3. 提示词固定段

每条生图提示词都必须包含以下画风段落（英文，原样附上），然后再写画面内容：

> Same established children's picture-book style as the attached reference: warm gouache/watercolor with tactile hand-made cut-paper collage texture, visible small paper-mosaic fragments and paper grain on every surface, soft hand-painted edges, warm sunlight with dappled leaf/window shadows, cream paper walls, honey oak wood, mustard yellow, sage and moss green, terracotta, muted teal accents, European cottage-garden setting. Do not redesign or modernize the style. No text, labels, watermark or border.

## 4. 禁止的画风偏移

- 淡彩/粉彩水彩、湿画法晕染且没有剪纸拼贴纹理（例如第三级 `art-samples/level3-fourth-book-native/garden-wide.png` 的粉墙、冷调淡蓝天空画法——**这是偏移，不能作为参考**）。
- 冷色调、中性灰的日光，或刻意去掉暖黄色调（例如提示词中写 “no yellow/sepia cast”）。
- 扁平矢量风、卡通描边风、3D 渲染风、动漫风、照片写实风。
- 新设计主角的服装、配色或身体比例；为同一角色生成不同长相。
- 任何用代码绘制或修补的画面内容（见 `docs/WORKFLOW.md` 第4.1节）。

## 5. 审图时检查画风

Claude 初审和用户终审都必须把候选图与第2节中同类型的参考图并排对比，逐项核对质感、光线、色板和角色是否一致。只要明显偏离这种画风，不论画面内容多好，一律退回重做。

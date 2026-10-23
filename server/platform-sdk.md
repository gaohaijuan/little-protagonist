# 微信与抖音小程序原生SDK适配

本模块调用小程序运行环境内置的 `wx.login` / `wx.request` 或 `tt.login` / `tt.request`，由自有后台访问平台 code2Session API。原生小程序不安装网页的微信JS-SDK，也不把抖音小游戏主动分享API当作小程序分享API。服务端不增加第三方业务依赖。

## 范围与接入状态

已实现：两端原生登录适配、服务端凭证校验、自定义会话保存/恢复/退出、邀请参数、访问与阅读事件、原生Page分享参数、PDF文件上传。后台用户和邀请列表区分微信、抖音与浏览器来源。微信自建登录与既有账号云函数沿用同一 `usr_` 编号；抖音使用独立身份命名空间，不凭同名OpenID跨平台合并账号。

这是一套可由原生页面调用的SDK模块。现有微信页面仍可继续使用既有云开发账号服务；不自动替换 `App.auth` 或迁移本地资料。抖音完整应用的页面、TTML/TTSS工程和绘本渲染尚未迁移。SDK不生成PDF，只提交已有的本地PDF。未配置平台凭证时服务端返回503，未配置客户端HTTPS地址时SDK保留游客状态；不会制造测试OpenID或假登录。

平台模拟测试通过不代表开发者工具编译或真机认证通过。正式微信、抖音登录及分享发布效果要在各自正式AppID、合法域名、审核配置和设备中验证。

## 配置

服务端使用 `server/start.cjs`，环境变量如下：

| 平台 | AppID | AppSecret |
| --- | --- | --- |
| 微信自建登录 | `WX_APP_ID` | `WX_APP_SECRET` |
| 抖音登录 | `DOUYIN_APP_ID` | `DOUYIN_APP_SECRET` |

AppSecret只填服务器环境变量，不填源码、客户端配置或聊天中的测试OpenID。客户端 `miniprogram/config/platforms.js` 分别配置 `baseUrl`、公开的 `appId`，抖音可配置后台已审核的 `shareTemplateId`。两端都要在开放平台设置request合法域名，指向同一运营后台的HTTPS源。

OpenID是用户在特定小程序内的身份标识，不能替代AppID和AppSecret。SDK取得一次性code后由服务端自动换取OpenID；不提供“输入任意OpenID直接登录”的接口。服务端仅持久化派生的账号编号，自定义会话只保存token哈希；平台会话密钥和UnionID不会返回客户端，也不用于跨平台强行合并用户。

## 原生页面与App的调用方式

微信入口使用 `createWechatSDK(wx)`，抖音入口使用 `createDouyinSDK(tt)`。下面是SDK原生接线接口；共享App与业务页面由各入口的集成方维护，不把整套微信页面直接复制成抖音已发布应用。

```js
const { createWechatSDK, createDouyinSDK } = require('./services/platform-sdk');
// 在微信原生App创建一次；抖音工程对应使用 createDouyinSDK(tt)。
const sdk = createWechatSDK(wx);

// App.onLaunch：读取邀请参数，尝试恢复原来的服务端会话，不弹登录窗。
sdk.onLaunch(launchOptions);
// App.onShow：恢复/校验会话并记录本次访问；失败不应阻塞游客阅读。
sdk.onShow(showOptions);
// 家长阅读并同意账号及运营服务说明，点击登录后再调用。
await sdk.login({ consent: true });
// 阅读入口记录，不影响页面的正常打开。
void sdk.track('read', 'intro');
// Page.onLoad：传入真实页面query中的邀请参数，在首次登录前保留。
sdk.setInvite(pageQuery.invite);
// Page.onShareAppMessage：同步返回分享参数，让平台响应用户的分享操作。
return sdk.onShareAppMessage({ title: '小小主角：一起读自己的故事' });
```

分享使用用户点击的 `button open-type="share"` 或原生Page分享钩子。抖音小程序使用 `path` 携带邀请参数，不主动调用小游戏的 `tt.shareAppMessage`。统计中的分享仍然表示发起，不表示接收方已打开；受邀新用户要真正登录后台后才建立归因。不自动发券、返佣或授予权限。

登录前的说明应明确：由家长操作，平台登录仅识别账号，不购买内容；后台记录账号标识、访问/阅读、邀请及打印申请；孩子照片与资料不随登录上传。只有家长另行确认提交打印时，才上传含照片与名字的PDF；保存期限以后台配置为准，登录不等于同意购买或自动提交打印。SDK登录请求中的说明版本为 `platform-account-v1`，服务端检查版本后才兑换凭证。

打印接口复用现有收件功能：

```js
await sdk.submitPdf({
  filePath: generatedPdfPath,
  bookId: 'intro',
  title: '我的绘本',
  requestKey: stableRequestKey, // 同一份文件失败重试沿用，16–100位字母数字/短横线
  consent: true // 展示文件用途和实际保存期限，经家长确认后传入
});
await sdk.logout(); // 清除本地会话，并尝试撤销当前服务端token
```

`sdk.getSnapshot()`只包含状态、公开账号编号及平台，不返回平台OpenID或token。会话最多7天，恢复时必须再次向后台验证；网络失败不能被当作已登录。登录超时、退出或账号切换后的旧结果不能写入新状态。两端及不同后台地址的本地会话分开保存。原有微信云开发账号仍通过 `createOperationsService(wx, existingAuth)` 复用 `operations-session` 桥接，不改走抖音或浏览器身份。

## 打印订单和付款准备

SDK另提供 `createPrintOrder`、`getPrintOrder`，以及 `preparePaymentIntent(orderId,{quoteId,channel,requestKey})`、`getPaymentIntent(id)`。付款接口只准备本地付款单，始终返回 `gatewayReady:false`，不返回调起支付参数、不执行扣款。报价和真实支付核验规则见[报价与支付关联](billing.md)。原生页面需要自行展示订单、报价和家长明确确认；当前原生阅读页尚无完整PDF生成及购买界面。

## 服务端接口

| 接口 | 用途 |
| --- | --- |
| `POST /api/platform/wechat/session` | 接收wx.login产生的code，服务端GET微信code2Session |
| `POST /api/platform/douyin/session` | 接收tt.login产生的code，服务端POST抖音v2 code2Session |
| `GET /api/platform/session` | 用Bearer token验证现有平台会话，返回公开身份和有效期 |
| `POST /api/session/logout` | 撤销当前Bearer token |
| `POST /api/events` | 访问、阅读、分享发起 |
| `POST /api/prints` | 二进制PDF收件与幂等去重 |

登录请求只包含 `code`、可选 `invite`、`consentVersion`。服务端不接受前端提供的OpenID、用户编号或session_key。服务端保留短期凭证摘要防止重放，不缓存明文code，不自动重试一次性code；重试需重新调用平台login。平台网络和凭证错误会返回受控信息，不回传包含AppSecret的URL或上游原始错误。

`/api/wx-session`保留为原有自建登录兼容接口，真实身份校验与新微信接口共用实现。支付仍通过既有服务端核验事件接口对接，本模块不接入商户收款、退款发起或分销奖励。

## 验证与官方依据

运行 `node --test tests/platform-sdk.test.cjs tests/operations-service.test.cjs tests/admin.test.cjs`。平台原生API和平台code2Session响应使用模拟；后台HTTP、SQLite、邀请归因、PDF收件和退出撤销是真实执行。覆盖平台命名空间隔离、微信云账号兼容、直接伪造身份拒绝、重复code拒绝、匿名抖音拒绝、说明版本、恢复验证、网络失败、超时、存储失败和晚到登录结果。`node tests/platform-sdk.browser.cjs` 使用本机既有Playwright/Chrome依赖验证后台两端来源展示与手机布局。

依据：[微信官方API类型](https://github.com/wechat-miniprogram/api-typings)、[微信wx.login](https://developers.weixin.qq.com/miniprogram/dev/api/open-api/login/wx.login.html)、[微信code2Session](https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/user-login/code2Session.html)、[抖音tt.login](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/api/open-interface/log-in/tt-login/)、[抖音code2Session](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/basic-abilities/log-in/)、[抖音小程序分享](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/tutorial/open-capabilities/general-capabilities/share)。

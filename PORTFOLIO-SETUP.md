# Portfolio Management V1 — 本地验收版

用户名登录更新：界面现在使用 Username + Password。内部邮箱只在服务端映射，配置与测试边界请以 `USERNAME-LOGIN.md` 为准。旧文档中的邮箱登录步骤已由用户名方式替代；现有账号及密码未改。

## 2026-11-03 真实连接进度（未部署）

- 已通过现有登录的 Supabase Dashboard 确认项目 `win-journey-portfolio`（Free）。只读查询确认 public 业务表为空、bucket 为空、Auth 用户数为 0。
- `.env.local` 已配置该项目 URL 和 Publishable Key，并确认被 Git 忽略。没有使用 Secret / Service Role Key。
- 已修复旧版客户端把公开 key 当作 Bearer JWT 的兼容问题。真实 Auth `/settings` 请求 HTTP 200；这只证明连接有效，不代表登录或数据库已初始化。
- 用户确认后，初始化 SQL 已在真实项目执行成功。三张业务表均启用 RLS，`portfolio` 私有 bucket 已创建，JPEG / 8MB 限制已核验。公共注册已关闭，邮箱登录保留。
- 管理员已由用户创建，真实数据库确认仅一个 Auth 用户且邮箱已确认。已按用户授权写入唯一管理员白名单，核验 authorized_admins=1、correct_owner=true。没有读取或保存密码。等待用户在本地 `/admin/` 安全登录，以执行管理员端真实流程测试。
- 未启用 CMS 模式的原站回归 133/133 通过；启用真实连接配置的生产构建通过。
- `node scripts/verify-portfolio-anonymous.mjs` 已向真实项目运行：匿名创建/修改/发布/删除作品、管理员表读取/写入均 HTTP 401；匿名上传被 RLS 拒绝；Storage 删除返回空数组（无可删除对象）；管理员 RPC 返回 false。
- 真实 PostgreSQL 事务内建立草稿/发布测试行，切换 anon 验证结果为 draft_visible=0、published_visible=1、anonymous_is_admin=false；已 rollback，随后 REST 查询作品为 []，没有残留测试项目。
- 已连接的本地登录页在 Chrome 390px/430px 下无横向溢出，登录控件可用，无控制台错误。这不是 Safari/Android 真机测试。
- 管理员登录/退出、真实照片上传、完整发布/编辑/取消发布/删除流程仍待用户在本地后台安全登录后验证。
- 本地入口 http://127.0.0.1:5175/admin/ 已启动。没有 Push、Vercel 部署、创建真实账号或购买服务。

仅增加作品管理，不改 WIN JOINERY 品牌、Hero、房间、实体书本、OG 或二维码。没有 Push、部署、创建账号或购买服务。

## 当前入口

运行 `pnpm dev --host 127.0.0.1 --port 5175`，打开 http://127.0.0.1:5175/admin/。
未配置时显示“尚未连接 Supabase”，禁止登录，不提供假成功模式。公开网站继续显示已有真实作品。

## 手动建立 Supabase（由所有者操作）

1. 在 Supabase Dashboard 创建一个 Free 项目，不选择升级。数据库密码由你设置，不交给代码或提交到 Git。
2. SQL Editor 执行 `supabase/portfolio-v1.sql` 一次。此迁移创建三张表、私有 portfolio bucket 和 RLS。不要在已有同名生产表上盲目重复执行。
3. Authentication 设置中关闭公开注册。由你在 Users → Add user 创建唯一管理员邮箱和密码；本次没有创建任何真实账号。
4. 复制该用户 UUID，在 SQL Editor 执行：

   ```sql
   insert into public.portfolio_admins(user_id) values ('替换为用户UUID');
   ```

   此表限制为一个管理员。不要把匿名用户加入表，也不要给 anon/authenticated 写入此表的权限。
5. Project Settings → API Keys / Connect 复制 Project URL 和 **Publishable key**（不是 secret、service_role，也不是数据库密码）。在项目根目录复制 `.env.example` 为 `.env.local`，填写：

   ```dotenv
   VITE_SUPABASE_URL=https://项目ID.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_你的公开客户端密钥
   ```

   Publishable key 是公开客户端标识，放入 apikey 请求头，不当作 Bearer JWT；授权由 Auth 用户 JWT、管理员表及 RLS 控制。不要填写 service_role / secret key。`.env.local` 被 Git 忽略。
6. 重启 Vite。本地图片代理从同样环境变量读取配置。以后经你批准部署时，才把这两个变量填入**原来** Vercel 项目并重新构建。私有图片通过 `/api/portfolio-image` 逐次匿名权限检查，不使用公共 bucket。
7. Auth URL Configuration 将本地 `http://127.0.0.1:5175` 及正式网址按环境配置。密码登录不依赖邮箱重定向；本 V1 不提供注册或密码找回 UI。

## 手机使用

登录 → Add New Portfolio → 选择最多50张照片 → 名称/可选说明/可选链接 → 上移/下移排序、选择封面 → Save Draft 或 Publish。
Manage Portfolio 可编辑、补图、删图、取消发布、删除作品（二次确认）。已上传成功但保存失败时，留在页面再次保存可重试，不必重新选图。
接管原 Bungalow 作品无需重复上传，使用真实已部署图片；点击保存前不会修改原内容。接管之后取消发布/删除会隐藏公开入口，但不会删除客户原始文件。

照片在浏览器逐张优化为最长边2400px、JPEG质量0.9，不放大。输入单张最多25MB，输出最多8MB，每作品最多50张。支持 JPEG/PNG/WebP；HEIC/HEIF 取决于手机浏览器是否能解码，不支持时明确提示转成JPEG，不会假称已上传。进度显示真实 XHR 上传进度。

## 安全与生命周期

- 私有 bucket：匿名仅能读取 PUBLISHED 行实际引用的图片；没有公开上传、编辑、删除入口。
- 所有写操作需要真实 Auth token + 单管理员白名单；普通登录用户也无权管理。
- 管理会话仅在内存中，刷新需要重新登录，不保存密码；token过期需要重新登录。退出时请求服务端撤销并清空内存，RLS 还检查 auth.sessions。离线退出会明确提示服务端撤销未确认。
- 未配置和网络失败均明确报错。外部链接只接受HTTP(S)，使用noopener/noreferrer。
- 所有上传文件使用随机UUID路径。删除先取消发布再清理图片；清理失败有提示。中途关闭页面、数据库失败可能留下**私有孤立文件**，需要在 Storage 手动清理；本版未做定时收费清理任务。
- 取消发布不能收回访客已下载的图片。原 Bungalow 旧静态图片此前已公开，接管并隐藏入口不能让已公开原文件变为机密；新上传图片才受私有Storage保护。

## 数据与前台

portfolio_projects 保存名称、说明、链接、封面id、照片数组顺序和DRAFT/PUBLISHED。
portfolio_legacy_links 只存已接管旧作品slug（不是私人内容），避免取消发布后旧静态内容重新出现。
公开3D书本保留现有6页起始容量，作品增加时自动扩容；独立项目路由在启用CMS后动态读取数据库。新项目的爬虫SEO目前是通用页面，不是服务端逐项目OG，后续如需SEO可另做SSR，不在本次伪称已完成。

## 验证界限 / 发布前必须执行

没有凭据时不能验证真实 Auth、RLS、数据库写入、Storage上传及云端删除。浏览器接口桩测试只证明前端流程，不等于真实安全验证。
配置后使用专门测试作品检查登录、压缩上传、草稿匿名不可读、发布书本与详情可见、修改顺序封面、取消发布图片代理返回404、删除、退出后拿旧token再次请求写入应失败。再用 anon key 和另一个非管理员账号直接尝试 POST/PATCH/DELETE/Storage上传，必须被拒绝。完成后删除测试内容。
真实iPhone Safari与Android Chrome选择器、HEIC兼容性及弱网仍需真机验收。

### 本轮已经实际执行

- 生产构建通过；132项Node回归测试通过。没有独立Lint或类型检查命令。
- 390px / 430px 隔离 Edge 浏览器：未配置时禁止登录；使用明确的测试API桩跑过登录、多图输入、真实canvas压缩、缩略图、排序、封面、上传失败重试、草稿、发布、动态详情、删图、取消发布、删除确认、退出和无横向溢出。
- 以上API桩测试不证明Supabase RLS或云端持久化已生效。数据库迁移未在真实Supabase执行。
- 隔离Chrome在本机启动失败；没有把Edge测试写成Chrome/Safari真机测试。
- 测试截图和结果：`validation/joinery-v5-admin/`。测试专用5176端口只连接`.invalid`假域名并由自动化拦截，不是客户可登录的后台；正常入口使用5175。

## 费用

没有开通、购买或升级任何服务，也没有增加付费依赖。可使用现有Vercel和Supabase免费资源；免费额度有限，图片存储、带宽和图片代理函数调用会消耗额度，超额时由你决定是否升级，不自动授权支出。

官方参考：https://supabase.com/docs/guides/storage/security/access-control 、https://supabase.com/docs/guides/storage/buckets/fundamentals

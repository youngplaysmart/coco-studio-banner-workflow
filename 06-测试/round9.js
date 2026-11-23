const { JSDOM } = require("jsdom"); const fs = require("fs");
const fx = JSON.parse(fs.readFileSync(require("path").join(__dirname,"fixture.json"), "utf8"));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const out = []; const check = (n, ok, x = "") => out.push((ok ? "PASS " : "FAIL ") + n + (x ? " — " + x : ""));
const calls = []; let failGen = false;
const dom = new JSDOM(fs.readFileSync(require("path").join(__dirname,"../01-工作流页面/banner-flow.html"), "utf8"), { runScripts: "dangerously", pretendToBeVisual: true, url: "https://claude.ai/x", beforeParse(w) {
  w.ResizeObserver = class { observe(){} unobserve(){} }; w.confirm = () => true;
  const mcp = { callTool: async (s, t, input) => { calls.push({ t, input }); await sleep(t === "generate_image" ? 120 : 5);
    if (t === "getAccessibleAtlassianResources") return { payload: [{ id: "cid", url: "https://x", scopes: ["read:jira-work"] }], content: [] };
    if (t === "atlassianUserInfo") return { payload: { account_id: "ME", name: "young" }, content: [] };
    if (t === "searchJiraIssuesUsingJql") return { payload: input.nextPageToken ? fx.p2 : fx.p1, content: [] };
    if (t === "getJiraIssue") return { payload: { key: input.issueIdOrKey, fields: { summary: "S", description: "D", attachment: [], status: { name: "待办" } } }, content: [] };
    if (t === "generate_image") { if (failGen) throw { code: "tool_error", server: "Figma", message: "quota" }; return { payload: { nodeId: "9:" + calls.length }, content: [] }; }
    if (t === "use_figma") return { payload: { bannerId: "10:" + calls.length, width: 1080, height: 1350 }, content: [] };
    throw { code: "tool_error", message: t }; } };
  const sample = { limits: async () => ({ images: null }), json: async () => ({ banners: [{ name: "A", width: 1080, height: 1350, title: "T", subtitle: "", prompt: "p" }, { name: "B", width: 1080, height: 1350, title: "T2", subtitle: "", prompt: "p2" }] }) };
  const perms = { state: async () => "granted", request: async () => ({}), manage: async () => {} };
  w.claude = { use: async (n) => n === "mcp" ? mcp : n === "sample" ? sample : n === "permissions" ? perms : null };
} });
const w = dom.window, d = w.document; const errs = []; w.addEventListener("error", e => errs.push(e.message));
(async () => {
  await sleep(500);
  const fi = d.getElementById("fileInput"); fi.value = "https://www.figma.com/design/1uVH1nbU0gUdFxayxCm3ul/x"; fi.dispatchEvent(new w.Event("input"));
  // 先拆解模式
  d.querySelector('.node[data-type="board"] .bfoot input[type=checkbox]').click(); await sleep(20);
  d.querySelector('.node[data-type="board"] .tk .gen').click(); await sleep(400);
  const go = d.querySelector(".confirm .go");
  check("确认按钮显示待生成数量", /确认并生成 2 张图/.test(go.textContent), go.textContent);
  go.click(); await sleep(30);
  const p = d.querySelector(".confirm .prog");
  check("点击后立即出现进度面板", !!p && /生成中 \d+\/\d+/.test(p.textContent), p && p.textContent.slice(0, 60));
  check("点击后有提示条", /已开始生成/.test(d.getElementById("toast").textContent), d.getElementById("toast").textContent);
  check("进度显示当前步骤", /当前：(生图|准备提示词|合成 Banner)/.test(p.textContent));
  check("页面标题显示进度", /^\(\d+\/\d+\) 生成中/.test(d.title), d.title);
  check("运行中有「停止」和「查看当前卡片」", [...p.querySelectorAll("button")].some(b => b.textContent === "停止"));
  await sleep(900);
  const pf = d.querySelector(".confirm .prog");
  check("完成后显示汇总", pf && /全部完成/.test(pf.textContent) && /生图 2 次 · 合成 2 张 Banner/.test(pf.textContent), pf && pf.textContent.slice(0, 80));
  check("完成后提供「在 Figma 中查看」「定位到结果」", pf && /在 Figma 中查看/.test(pf.textContent) && /定位到结果/.test(pf.textContent));
  check("完成后标题恢复", !/生成中/.test(d.title));
  // 停止
  [...pf.querySelectorAll("button")].find(b => b.textContent === "关闭").click(); await sleep(10);
  d.querySelector('.node[data-type="board"] .tk .gen:not([disabled])');
  const rows = [...d.querySelectorAll('.node[data-type="board"] .tk')].filter(r => r.querySelector(".gen").textContent === "生成");
  rows[0].querySelector(".gen").click(); await sleep(400);
  d.querySelector(".confirm .go").click(); await sleep(30);
  [...d.querySelectorAll(".confirm .prog button")].find(b => b.textContent === "停止").click();
  await sleep(700);
  const ps = d.querySelector(".confirm .prog");
  check("可以停止，并显示已停止", ps && /已停止/.test(ps.textContent), ps && ps.textContent.slice(0, 60));
  // 出错 + 重试
  [...ps.querySelectorAll("button")].find(b => b.textContent === "关闭").click(); await sleep(10);
  failGen = true;
  d.querySelector(".confirm .go").click(); await sleep(900);
  const pe = d.querySelector(".confirm .prog");
  check("出错时汇总列出出错卡片", pe && /出错/.test(pe.textContent) && pe.querySelectorAll(".perr li").length >= 1, pe && pe.textContent.slice(0, 80));
  failGen = false;
  [...pe.querySelectorAll("button")].find(b => b.textContent === "重试出错的").click(); await sleep(900);
  const pr = d.querySelector(".confirm .prog");
  check("「重试出错的」能继续完成", pr && /全部完成/.test(pr.textContent), pr && pr.textContent.slice(0, 60));
  // 没东西可跑
  [...pr.querySelectorAll("button")].find(b => b.textContent === "关闭").click(); await sleep(10);
  d.getElementById("draftBtn").click(); await sleep(20);
  check("没有可运行的卡片时也会提示", /没有需要运行的卡片|上游还没完成/.test(d.getElementById("toast").textContent), d.getElementById("toast").textContent);
  check("页面无脚本错误", !errs.length, errs.join(";"));
  console.log(out.join("\n")); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

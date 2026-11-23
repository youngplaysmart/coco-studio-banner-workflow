const { JSDOM } = require("jsdom"); const fs = require("fs");
const fx = JSON.parse(fs.readFileSync(require("path").join(__dirname,"fixture.json"), "utf8"));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const out = []; const check = (n, ok, x = "") => out.push((ok ? "PASS " : "FAIL ") + n + (x ? " — " + x : ""));
const ME = "ME";
function boot(storage) {
  const calls = [];
  const html = fs.readFileSync(require("path").join(__dirname,"../01-工作流页面/banner-flow.html"), "utf8");
  const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "https://claude.ai/x", beforeParse(w) {
    w.ResizeObserver = class { observe(){} unobserve(){} }; w.confirm = () => true;
    if (storage) for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
    const mcp = { callTool: async (s, t, input) => { calls.push({ t, input }); await sleep(3);
      if (t === "getAccessibleAtlassianResources") return { payload: [{ id: "cid", url: "https://blockdance.atlassian.net", scopes: ["read:jira-work"] }], content: [] };
      if (t === "atlassianUserInfo") return { payload: { account_id: ME, name: "young" }, content: [] };
      if (t === "searchJiraIssuesUsingJql") return { payload: input.nextPageToken ? fx.p2 : fx.p1, content: [] };
      if (t === "getJiraIssue") return { payload: { key: input.issueIdOrKey, fields: { summary: "S", description: "D", attachment: [], status: { name: "待办" } } }, content: [] };
      if (t === "generate_image") return { payload: { nodeId: "9:" + calls.length }, content: [{ type: "image", data: "AAAA", mimeType: "image/png" }] };
      if (t === "use_figma") return { payload: { bannerId: "10:" + calls.length, width: 1600, height: 900 }, content: [] };
      throw { code: "tool_error", message: "unexpected " + t }; } };
    const sample = { json: async () => ({ banners: [{ name: "图1", width: 1600, height: 900, title: "T", subtitle: "", prompt: "p" }, { name: "图2", width: 1080, height: 1440, title: "T2", subtitle: "", prompt: "p2" }] }) };
    const perms = { state: async () => "granted", request: async () => ({}), manage: async () => {} }; w.claude = { use: async (n) => n === "mcp" ? mcp : n === "sample" ? sample : n === "permissions" ? perms : null };
  } });
  const w = dom.window, d = w.document; const errs = []; w.addEventListener("error", e => errs.push(e.message));
  return { w, d, calls, errs, storage: () => ({ ...w.localStorage }) };
}
(async () => {
  let { w, d, calls, errs, storage } = boot(); await sleep(500);
  const board = d.querySelector('.node[data-type="board"]');
  check("打开页面画布上就有工单看板", !!board);
  check("看板自动读取，无需粘贴链接", calls.some(c => c.t === "searchJiraIssuesUsingJql") && board.dataset.status === "done", board && board.dataset.status);
  check("看板里没有需要填写的输入框（除搜索）", [...board.querySelectorAll("input:not([type=checkbox]):not([type=search]):not(.name), textarea")].filter(x => !x.closest("details")).length === 0);
  const kp = [...board.querySelectorAll(".kpi")].map(k => k.textContent);
  check("统计卡片：全部 83 / 我负责 8", /^83/.test(kp[0]) && /^8young/.test(kp[1]), kp.join(" | "));
  check("图表：按状态 + 按负责人（我高亮）", board.querySelectorAll(".bars").length === 2 && /（我）/.test(board.querySelector(".bar.me").textContent));
  let rows = [...board.querySelectorAll(".tk")];
  check("默认列出我负责的 8 个，全部高亮且各有生成按钮", rows.length === 8 && rows.every(r => r.classList.contains("mine") && r.querySelector(".gen").textContent === "生成"), rows.length);
  // 没填 Figma 文件就点生成
  rows[0].querySelector(".gen").click(); await sleep(50);
  check("没设置 Figma 文件时提示且不创建", /先在顶栏粘贴 Figma 文件链接/.test(d.getElementById("toast").textContent) && !d.querySelector('.node[data-type="jira"]'));
  const fi = d.getElementById("fileInput"); fi.value = "https://www.figma.com/design/1uVH1nbU0gUdFxayxCm3ul/x"; fi.dispatchEvent(new w.Event("input"));
  // 一键生成
  const key0 = board.querySelector(".tk .key").textContent;
  calls.length = 0;
  board.querySelector(".tk .gen").click(); await sleep(800);
  const types = calls.map(c => c.t);
  check("点「生成」一路跑完：读需求→拆解→生图→合成", types.includes("getJiraIssue") && types.filter(t => t === "generate_image").length === 2 && types.filter(t => t === "use_figma").length === 2, types.join(","));
  const jn = d.querySelector('.node[data-type="jira"]');
  check("Jira 节点从看板连出，并预选了该工单", jn && jn.querySelector("select").value === key0 && /已完成/.test(jn.textContent));
  rows = [...d.querySelector('.node[data-type="board"]').querySelectorAll(".tk")];
  const r0 = rows.find(r => r.querySelector(".key").textContent === key0);
  check("看板上该工单标为「已在画布」，按钮变「查看流程」", r0 && /已在画布/.test(r0.textContent) && r0.querySelector(".gen").textContent === "查看流程");
  // Jira 节点下拉：我负责的分组
  const og = jn.querySelector('optgroup[label="我负责的"]');
  check("Jira 节点是下拉选择，「我负责的」分组在前", og && og.children.length === 8 && jn.querySelector("select optgroup") === og);
  // 勾选两个，先拆解模式
  const boardEl = d.querySelector('.node[data-type="board"]');
  boardEl.querySelector('.bfoot input[type=checkbox]').click(); await sleep(20);
  let rows2 = [...d.querySelector('.node[data-type="board"]').querySelectorAll(".tk")].filter(r => r.querySelector(".gen").textContent === "生成").slice(0, 2);
  rows2.forEach(r => r.click()); await sleep(20);
  const goBtn = d.querySelector('.node[data-type="board"] .bfoot .btn.primary');
  check("勾选后按钮显示数量", /生成选中的 2 个/.test(goBtn.textContent), goBtn.textContent);
  calls.length = 0; goBtn.click(); await sleep(800);
  check("「先拆解」模式：读取并拆解 2 个工单，不生图", calls.filter(c => c.t === "getJiraIssue").length === 2 && !calls.some(c => c.t === "generate_image"), calls.map(c=>c.t).join(","));
  check("确认面板提示待生成 4 张", /确认并生成 4 张图/.test(d.querySelector(".confirm .go").textContent), d.querySelector(".confirm .go").textContent);
  // 刷新看板不会让已完成流程变成需重跑
  const before = [...d.querySelectorAll('.node[data-type="compose"]')].filter(n => n.dataset.status === "done").length;
  [...d.querySelector('.node[data-type="board"]').querySelectorAll(".chipbtn")].find(b => b.textContent === "刷新").click(); await sleep(300);
  const after = [...d.querySelectorAll('.node[data-type="compose"]')].filter(n => n.dataset.status === "done").length;
  check("刷新看板不影响已完成的流程", before === 2 && after === 2, `${before}→${after}`);
  // 下拉换工单会自动运行
  calls.length = 0;
  const sel = d.querySelector('.node[data-type="jira"] select');
  const other = [...sel.querySelectorAll('optgroup[label="其他工单"] option')][0].value;
  sel.value = other; sel.dispatchEvent(new w.Event("change")); await sleep(600);
  check("在 Jira 节点下拉里换工单会自动重新读取", calls.some(c => c.t === "getJiraIssue" && c.input.issueIdOrKey === other));
  // 刷新页面后恢复
  await sleep(400);
  const b2 = boot(storage()); await sleep(500);
  check("刷新页面后看板与流程都在", b2.d.querySelectorAll('.node[data-type="board"]').length === 1 && b2.d.querySelectorAll('.node[data-type="jira"]').length === 3, b2.d.querySelectorAll('.node[data-type="jira"]').length);
  check("页面无脚本错误", !errs.length && !b2.errs.length, [...errs, ...b2.errs].join(";"));
  console.log(out.join("\n")); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

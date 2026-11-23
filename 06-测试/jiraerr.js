const { JSDOM } = require("jsdom"); const fs = require("fs");
const fx = JSON.parse(fs.readFileSync(require("path").join(__dirname,"fixture.json"), "utf8"));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const out = []; const check = (n, ok, x = "") => out.push((ok ? "PASS " : "FAIL ") + n + (x ? " — " + x : ""));
function boot({ perm = "prompt", mode = "ok", delayMcp = 0 } = {}) {
  const calls = []; const ctl = { mode, firstFail: true };
  const dom = new JSDOM(fs.readFileSync(require("path").join(__dirname,"../01-工作流页面/banner-flow.html"), "utf8"), { runScripts: "dangerously", pretendToBeVisual: true, url: "https://claude.ai/x", beforeParse(w) {
    w.ResizeObserver = class { observe(){} unobserve(){} };
    const mcp = {
      listTools: async () => ({ servers: ctl.mode === "noserver" ? [{ server: "Figma", authStatus: "connected", tools: [{ name: "generate_image" }] }] : [{ server: "Atlassian Rovo", authStatus: "connected", tools: [{ name: "getJiraIssue" }] }] }),
      callTool: async (s, t, input) => { calls.push(t); await sleep(3);
      if (ctl.mode === "noserver" && s === "Atlassian Rovo") throw { code: "server_not_connected", server: s, message: "" };
      if (ctl.mode === "retry" && ctl.firstFail) { ctl.firstFail = false; throw { code: "upstream_error", retryable: true, retryAfterMs: 10, message: "consent" }; }
      if (t === "getAccessibleAtlassianResources") return { payload: [{ id: "cid", url: "https://blockdance.atlassian.net", scopes: ["read:jira-work"] }], content: [] };
      if (t === "atlassianUserInfo") return { payload: { account_id: "me", name: "young" }, content: [] };
      if (t === "searchJiraIssuesUsingJql") return { payload: input.nextPageToken ? fx.p2 : fx.p1, content: [] };
      throw { code: "tool_error", message: "x" }; } };
    const perms = { state: async () => perm, request: async () => ({ "mcp:Atlassian Rovo": "granted" }), manage: async () => {} };
    w.claude = { use: async (n) => { if (n === "mcp") { await sleep(delayMcp); return mcp; } if (n === "permissions") return perms; return null; } };
  } });
  const w = dom.window; const errs = []; w.addEventListener("error", e => errs.push(e.message));
  return { w, d: w.document, calls, ctl, errs };
}
(async () => {
  // 1. 首次未授权：不自动读取，显示按钮
  let a = boot({ perm: "prompt" }); await sleep(300);
  const btn = [...a.d.querySelectorAll(".firstrun button")][0];
  check("首次：显示「读取我的 Jira 工单」按钮，不自动调用", btn && /读取我的 Jira 工单/.test(btn.textContent) && !a.calls.length, a.calls.join(","));
  btn.click(); await sleep(300);
  check("点按钮后读取成功", a.d.querySelectorAll(".tk").length > 0);
  // 2. 已授权：自动读取
  let b = boot({ perm: "granted" }); await sleep(300);
  check("已授权：打开即自动读取", b.calls.includes("searchJiraIssuesUsingJql"));
  // 3. 连接器还没就绪时点击：等待而不是立刻报错
  let c = boot({ perm: "prompt", delayMcp: 400 }); await sleep(50);
  c.d.querySelector(".firstrun button").click(); await sleep(700);
  check("连接器晚就绪：点击后等待并读取成功", c.d.querySelectorAll(".tk").length > 0, c.d.querySelector(".board").textContent.slice(0, 80));
  // 4. 可重试错误自动重试一次
  let e = boot({ perm: "granted", mode: "retry" }); await sleep(400);
  check("可重试错误自动重试成功", e.d.querySelectorAll(".tk").length > 0);
  // 5. 未连接：显示原因、代码、诊断
  let f = boot({ perm: "granted", mode: "noserver" }); await sleep(300);
  const err = f.d.querySelector(".board .derr");
  check("未连接时显示明确原因和错误代码", err && /Atlassian Rovo/.test(err.textContent) && /server_not_connected/.test(err.textContent), err && err.textContent.slice(0, 120));
  [...err.querySelectorAll("button")].find(x => x.textContent === "检查连接").click(); await sleep(50);
  const diag = f.d.querySelector(".board .diag");
  check("检查连接列出可用连接器并指出缺少 Atlassian Rovo", diag && /没有找到名为「Atlassian Rovo」/.test(diag.textContent), diag && diag.textContent);
  check("页面无脚本错误", ![a, b, c, e, f].some(x => x.errs.length), [a, b, c, e, f].flatMap(x => x.errs).join(";"));
  console.log(out.join("\n")); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

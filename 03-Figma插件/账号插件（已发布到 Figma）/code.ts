// Coco Banner：Jira 需求 → 可编辑的需求画布 → Banner
// 画布就是 Figma 本身；面板只负责解析需求、选尺寸、创建 Banner。
// 生图两种方式：Figma AI（选中背景层运行 Make image），或填写自有后端地址。

const PANEL_WIDTH = 320
const CMD = '72066562-7461-47ea-9980-1ba74338e12c'

const COLOR = {
  section: '#121318', card: '#1D1E24', box: '#15161B', line: '#2E3038',
  text: '#F2F2F5', muted: '#9A9CA8', accent: '#B79CFF', slot: '#5A5D6B',
}
let FONT: { r: FontName; b: FontName } = { r: { family: 'Inter', style: 'Regular' }, b: { family: 'Inter', style: 'Bold' } }
const SUBLINE_PLACEHOLDER = '（没有副标题可以留空或删掉这行）'
const TEXT_ROLES = ['prompt', 'negative', 'headline', 'subline']
const PLATFORMS: Record<string, [number, number]> = {
  '小红书': [1080, 1440], '抖音': [1080, 1920], '快手': [1080, 1920], 'Instagram': [1080, 1350],
  'TikTok': [1080, 1920], 'YouTube': [1280, 720], 'B 站': [1920, 1080], '微信': [900, 383],
}

interface Meta { v?: number; title?: string; platform: string; width: number; height: number; use_character: boolean }
interface Draft extends Meta {
  title: string; issue_key: string | null; issue_url: string | null; ref_roles: string[]
  prompt: string; negative: string; headline: string; subline: string; source_text: string
}
interface HistoryItem { prompt: string; negative: string; savedAt: number }
interface UiMsg {
  type: string; reqId?: number; raw?: string; link?: string; meta?: Partial<Meta>
  bgId?: string; image?: string; index?: number; url?: string; height?: number
}
type Slot = FrameNode

function rgb(hex: string): RGB {
  const n = parseInt(hex.replace('#', ''), 16)
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }
}
function solid(hex: string): Paint[] {
  return [{ type: 'SOLID', color: rgb(hex) }]
}

async function loadFonts(): Promise<void> {
  const candidates = [['Noto Sans SC', 'Regular', 'Bold'], ['PingFang SC', 'Regular', 'Semibold'], ['Inter', 'Regular', 'Bold']]
  for (const c of candidates) {
    try {
      await figma.loadFontAsync({ family: c[0], style: c[1] })
      await figma.loadFontAsync({ family: c[0], style: c[2] })
      FONT = { r: { family: c[0], style: c[1] }, b: { family: c[0], style: c[2] } }
      return
    } catch { /* 试下一个字体 */ }
  }
}

// ---------- 需求拆解（离线规则） ----------
function parseRequirement(raw: string, link: string): Draft {
  const text = raw.trim()
  const keyMatch = (link + ' ' + text).match(/\b([A-Z][A-Z0-9]+-\d+)\b/)
  const compact = text.replace(/\s/g, '')
  let platform = '小红书'
  for (const p of Object.keys(PLATFORMS)) {
    if (compact.indexOf(p.replace(/\s/g, '')) >= 0) { platform = p; break }
  }
  const copyMatch = text.match(/文案[:：]\s*([\s\S]+)/)
  const headline = copyMatch ? copyMatch[1].trim().replace(/\s*\n\s*/g, '\n').slice(0, 60) : ''
  const refMatch = text.match(/(\d)\s*[–\-~到]?\s*(\d)?\s*张/)
  const refCount = refMatch ? Math.min(3, Number(refMatch[2] || refMatch[1])) : 3
  const useChar = /coco/i.test(text) || text.indexOf('角色') >= 0
  const size = PLATFORMS[platform]
  const shape = size[1] > size[0] ? '竖版' : size[1] < size[0] ? '横版' : '方形'
  const firstLine = text.split('\n')[0].replace(/[。.]$/, '').slice(0, 16)
  return {
    title: firstLine || '灵感海报',
    issue_key: keyMatch ? keyMatch[1] : null,
    issue_url: link || null,
    platform, width: size[0], height: size[1], use_character: useChar,
    ref_roles: ['场景', '氛围', '构图'].slice(0, Math.max(refCount, 1)),
    prompt: (useChar ? '保持 Coco 的标准形象，' : '') + '融合参考图的场景、氛围与构图。\n'
      + '建议使用温暖自然光，主体清晰，背景简洁，为标题预留干净的排版空间。\n'
      + shape + ' ' + size[0] + '×' + size[1] + '，统一光线、透视与色彩。',
    negative: '角色变形、画面杂乱、画面中出现文字或乱码。',
    headline, subline: '', source_text: text,
  }
}

// ---------- 画布小工具 ----------
function txt(chars: string, size: number, color: string, bold: boolean): TextNode {
  const t = figma.createText()
  t.fontName = bold ? FONT.b : FONT.r
  t.fontSize = size
  t.characters = chars && chars.length ? chars : ' '
  t.fills = solid(color)
  t.lineHeight = { unit: 'PERCENT', value: 150 }
  return t
}
function appendFill<T extends TextNode | FrameNode>(parent: FrameNode, node: T): T {
  parent.appendChild(node)
  node.layoutSizingHorizontal = 'FILL'
  if (node.type === 'TEXT') node.textAutoResize = 'HEIGHT'
  return node
}
function vstack(name: string, spacing: number): FrameNode {
  const f = figma.createFrame()
  f.name = name
  f.layoutMode = 'VERTICAL'
  f.primaryAxisSizingMode = 'AUTO'
  f.counterAxisSizingMode = 'FIXED'
  f.itemSpacing = spacing
  f.fills = []
  return f
}
function card(title: string, hint: string, width: number): FrameNode {
  const f = vstack(title, 12)
  f.resize(width, 100)
  f.paddingLeft = 20; f.paddingRight = 20; f.paddingTop = 20; f.paddingBottom = 20
  f.cornerRadius = 12
  f.fills = solid(COLOR.card)
  f.strokes = solid(COLOR.line)
  f.strokeWeight = 1
  appendFill(f, txt(title, 16, COLOR.text, true))
  if (hint) appendFill(f, txt(hint, 12, COLOR.muted, false))
  return f
}
function editBox(parent: FrameNode, label: string | null, value: string, role: string, size: number): TextNode {
  if (label) appendFill(parent, txt(label, 12, COLOR.muted, false))
  const box = vstack((label || role) + ' 编辑区', 0)
  box.paddingLeft = 14; box.paddingRight = 14; box.paddingTop = 12; box.paddingBottom = 12
  box.cornerRadius = 8
  box.fills = solid(COLOR.box)
  box.strokes = solid(COLOR.line)
  appendFill(parent, box)
  const t = appendFill(box, txt(value, size, COLOR.text, false))
  t.name = role
  t.setPluginData('role', role)
  return t
}
function slot(label: string, role: string): FrameNode {
  const s = figma.createFrame()
  s.name = '拖入图片 · ' + label
  s.layoutMode = 'VERTICAL'
  s.primaryAxisAlignItems = 'CENTER'
  s.counterAxisAlignItems = 'CENTER'
  s.primaryAxisSizingMode = 'FIXED'
  s.counterAxisSizingMode = 'FIXED'
  s.resize(112, 112)
  s.cornerRadius = 8
  s.clipsContent = true
  s.fills = solid(COLOR.box)
  s.strokes = solid(COLOR.slot)
  s.dashPattern = [4, 4]
  s.setPluginData('role', role)
  const t = txt('+ ' + label, 12, COLOR.muted, false)
  t.name = '提示'
  s.appendChild(t)
  return s
}

function roleOf(n: BaseNode): string {
  const r = n.getPluginData('role')
  if (r) return r
  if (n.type === 'TEXT' && TEXT_ROLES.indexOf(n.name) >= 0) return n.name
  if (n.type === 'FRAME' && n.name.indexOf('拖入图片 · ') === 0) return n.name === '拖入图片 · Coco' ? 'character' : 'ref'
  return ''
}
function isCocoSection(n: BaseNode): n is SectionNode {
  return n.type === 'SECTION' && (!!n.getPluginData('coco') || n.name.indexOf('Coco 灵感海报') === 0)
}
function imageHashOf(n: SceneNode): string | null {
  if (!('fills' in n)) return null
  const fills = n.fills
  if (fills === figma.mixed) return null
  for (const p of fills) if (p.type === 'IMAGE' && p.visible !== false && p.imageHash) return p.imageHash
  return null
}
async function slotImage(s: Slot): Promise<string | null> {
  let hash = imageHashOf(s)
  if (!hash) {
    const child = s.findOne((n) => n.visible && !!imageHashOf(n))
    if (child) hash = imageHashOf(child)
  }
  if (!hash) return null
  const img = figma.getImageByHash(hash)
  if (!img) return null
  return figma.base64Encode(await img.getBytesAsync())
}
function clearSpotX(): number {
  let max = 0
  const kids = figma.currentPage.children
  for (const k of kids) max = Math.max(max, k.x + k.width)
  return kids.length ? max + 200 : Math.round(figma.viewport.center.x)
}

// ---------- 1. 铺需求画布 ----------
async function buildCanvas(draft: Draft): Promise<SectionNode> {
  const key = draft.issue_key || '手动需求'
  const sec = figma.createSection()
  sec.name = 'Coco 灵感海报 · ' + key
  sec.fills = solid(COLOR.section)
  sec.x = clearSpotX()
  sec.y = 0

  const h1 = txt(draft.title + ' · ' + key, 28, COLOR.text, true)
  sec.appendChild(h1); h1.x = 40; h1.y = 40
  const h2 = txt('直接在画布上改文字、把图片拖进虚线框；改好后回到插件面板创建 Banner。', 13, COLOR.muted, false)
  sec.appendChild(h2); h2.x = 40; h2.y = 88

  const src = card('Jira 需求', key, 300)
  if (draft.issue_url) appendFill(src, txt(draft.issue_url, 11, COLOR.accent, false))
  appendFill(src, txt(draft.source_text, 13, COLOR.muted, false))
  sec.appendChild(src); src.x = 40; src.y = 140

  const p = card('画面提示词', '根据需求补全，可以直接改写', 480)
  editBox(p, null, draft.prompt, 'prompt', 14)
  editBox(p, '避免', draft.negative, 'negative', 13)
  sec.appendChild(p); p.x = 380; p.y = 140

  const c = card('海报文案', '生成后会叠成可编辑的文字图层，不交给模型画', 480)
  editBox(c, '主标题', draft.headline || '（在这里写主标题）', 'headline', 18)
  const sub = editBox(c, '副标题', draft.subline || SUBLINE_PLACEHOLDER, 'subline', 14)
  if (!draft.subline) sub.fills = solid(COLOR.muted)
  sec.appendChild(c); c.x = 380; c.y = p.y + p.height + 24

  const r = card('背景参考', '把图片拖进虚线框即可替换，空着的会被忽略', 400)
  const row = figma.createFrame()
  row.name = '参考图'
  row.layoutMode = 'HORIZONTAL'
  row.itemSpacing = 12
  row.fills = []
  row.primaryAxisSizingMode = 'AUTO'
  row.counterAxisSizingMode = 'AUTO'
  const roles = ['场景', '氛围', '构图']
  for (let i = 0; i < 3; i++) row.appendChild(slot(draft.ref_roles[i] || roles[i], 'ref'))
  r.appendChild(row)
  sec.appendChild(r); r.x = 900; r.y = 140

  const ch = card('角色参考 · Coco', '放 Coco 标准形象，供生图参考', 400)
  ch.appendChild(slot('Coco', 'character'))
  sec.appendChild(ch); ch.x = 900; ch.y = r.y + r.height + 24

  let w = 0, h = 0
  for (const n of sec.children) { w = Math.max(w, n.x + n.width); h = Math.max(h, n.y + n.height) }
  sec.resizeWithoutConstraints(w + 40, h + 40)

  sec.setPluginData('coco', JSON.stringify({
    v: 1, title: draft.title, platform: draft.platform, width: draft.width, height: draft.height,
    use_character: !!draft.use_character,
  }))
  sec.setRelaunchData({ [CMD]: '继续编辑这块需求画布' })
  figma.currentPage.setPluginData('lastSection', sec.id)
  figma.currentPage.selection = [sec]
  figma.viewport.scrollAndZoomIntoView([sec])
  return sec
}

// ---------- 找当前画布 ----------
async function activeSection(): Promise<SectionNode | null> {
  let n: BaseNode | null = figma.currentPage.selection[0] || null
  while (n && n.type !== 'PAGE' && n.type !== 'DOCUMENT') {
    if (isCocoSection(n)) return n
    const from = n.getPluginData('cocoResult')
    if (from) {
      const src = await figma.getNodeByIdAsync(from)
      if (src && isCocoSection(src)) return src
    }
    n = n.parent
  }
  const id = figma.currentPage.getPluginData('lastSection')
  if (id) {
    const last = await figma.getNodeByIdAsync(id)
    if (last && !last.removed && isCocoSection(last)) return last
  }
  const secs = figma.currentPage.children.filter(isCocoSection)
  return secs.length ? secs[secs.length - 1] : null
}
function readMeta(sec: SectionNode): Meta {
  try {
    const m = JSON.parse(sec.getPluginData('coco')) as Meta
    if (m && m.width) return m
  } catch { /* 没有元数据时用默认值 */ }
  return { title: sec.name, platform: '小红书', width: 1080, height: 1440, use_character: true }
}
async function sendContext(): Promise<void> {
  const sec = await activeSection()
  figma.ui.postMessage({
    type: 'context', hasCanvas: !!sec, name: sec ? sec.name : null, meta: sec ? readMeta(sec) : null,
  })
}

// ---------- 读回画布内容 ----------
function roleText(sec: SectionNode, role: string): string {
  const t = sec.findOne((n) => n.type === 'TEXT' && roleOf(n) === role) as TextNode | null
  let v = t ? t.characters.trim() : ''
  if (v === SUBLINE_PLACEHOLDER || v === '（在这里写主标题）') v = ''
  return v
}
function fullPrompt(sec: SectionNode, meta: Meta): string {
  const parts = [roleText(sec, 'prompt')]
  if (meta.use_character) parts.push('角色保持 Coco 的标准形象，不改变造型、配色和比例。')
  parts.push('画面中不要出现任何文字、字母或水印。')
  const neg = roleText(sec, 'negative')
  if (neg) parts.push('避免：' + neg)
  parts.push('画幅 ' + meta.width + '×' + meta.height + '。')
  return parts.filter(Boolean).join('\n')
}

// ---------- 2. 创建 Banner ----------
async function createBanner(sec: SectionNode, meta: Meta): Promise<{ bannerId: string; bgId: string; prompt: string }> {
  const W = Math.max(64, Math.min(4096, Math.round(meta.width)))
  const H = Math.max(64, Math.min(4096, Math.round(meta.height)))
  const siblings = figma.currentPage.findChildren((n) => n.getPluginData('cocoResult') === sec.id)

  const f = figma.createFrame()
  f.name = 'Banner · ' + (meta.platform || '自定义') + ' ' + W + '×' + H
  f.resize(W, H)
  f.clipsContent = true
  f.fills = solid('#E9E6F2')
  f.x = sec.x + sec.width + 120 + siblings.length * (W + 80)
  f.y = sec.y
  f.setPluginData('cocoResult', sec.id)

  const bg = figma.createRectangle()
  bg.name = '背景 · 选中后运行 Make image'
  bg.resize(W, H)
  bg.fills = [{
    type: 'GRADIENT_LINEAR',
    gradientTransform: [[0, 1, 0], [-1, 0, 1]],
    gradientStops: [
      { position: 0, color: { r: 1, g: 0.86, b: 0.72, a: 1 } },
      { position: 1, color: { r: 0.62, g: 0.6, b: 0.85, a: 1 } },
    ],
  }]
  f.appendChild(bg)
  bg.x = 0; bg.y = 0

  const shadow: Effect[] = [{
    type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.35 }, offset: { x: 0, y: 2 },
    radius: Math.round(W * 0.01), spread: 0, visible: true, blendMode: 'NORMAL',
  }]
  const pad = Math.round(W * 0.08)
  let y = Math.round(H * 0.07)
  const headline = roleText(sec, 'headline')
  const subline = roleText(sec, 'subline')
  if (headline) {
    const t = txt(headline, Math.round(W * 0.075), '#FFFFFF', true)
    t.name = '主标题（可编辑）'
    t.lineHeight = { unit: 'PERCENT', value: 130 }
    t.effects = shadow
    f.appendChild(t)
    t.x = pad; t.y = y
    t.resize(W - pad * 2, t.height)
    t.textAutoResize = 'HEIGHT'
    y += t.height + Math.round(W * 0.02)
  }
  if (subline) {
    const s = txt(subline, Math.round(W * 0.035), '#FFFFFF', false)
    s.name = '副标题（可编辑）'
    s.effects = shadow
    f.appendChild(s)
    s.x = pad; s.y = y
    s.resize(W - pad * 2, s.height)
    s.textAutoResize = 'HEIGHT'
  }
  f.setRelaunchData({ [CMD]: '重新生成或调整这张 Banner' })
  figma.currentPage.selection = [bg]
  figma.viewport.scrollAndZoomIntoView([f])
  return { bannerId: f.id, bgId: bg.id, prompt: fullPrompt(sec, meta) }
}

async function collectForBackend(sec: SectionNode, meta: Meta): Promise<Record<string, unknown>> {
  const refs: string[] = []
  for (const s of sec.findAll((n) => n.type === 'FRAME' && roleOf(n) === 'ref') as Slot[]) {
    const b = await slotImage(s)
    if (b) refs.push(b)
  }
  const charSlot = sec.findOne((n) => n.type === 'FRAME' && roleOf(n) === 'character') as Slot | null
  return {
    prompt: roleText(sec, 'prompt'), negative: roleText(sec, 'negative'),
    width: meta.width, height: meta.height, use_character: !!meta.use_character,
    references: refs, character: charSlot ? await slotImage(charSlot) : null,
  }
}

// ---------- 提示词库 ----------
async function getHistory(): Promise<HistoryItem[]> {
  return ((await figma.clientStorage.getAsync('cocoPrompts')) as HistoryItem[] | undefined) || []
}
async function setText(node: TextNode, value: string): Promise<void> {
  const fonts = node.getRangeAllFontNames(0, node.characters.length)
  for (const f of fonts) await figma.loadFontAsync(f)
  node.characters = value && value.length ? value : ' '
}

// ---------- 消息 ----------
figma.showUI(__html__, { width: PANEL_WIDTH, height: 560 })
figma.root.setRelaunchData({ [CMD]: '把 Jira 需求铺成画布并生成 Banner' })

figma.ui.onmessage = async (msg: UiMsg) => {
  const reply = (data: Record<string, unknown>) => { data.reqId = msg.reqId; figma.ui.postMessage(data) }
  try {
    if (msg.type === 'resize') {
      figma.ui.resize(PANEL_WIDTH, Math.max(120, Math.min(900, Math.round(msg.height || 560))))
      return
    }
    if (msg.type === 'build') {
      const raw = String(msg.raw || '').trim()
      if (!raw) throw new Error('先粘贴需求文字')
      const draft = parseRequirement(raw, String(msg.link || '').trim())
      const sec = await buildCanvas(draft)
      reply({ type: 'built', name: sec.name })
      await sendContext()
    } else if (msg.type === 'update-meta') {
      const sec = await activeSection()
      if (sec) sec.setPluginData('coco', JSON.stringify(Object.assign({ v: 1 }, readMeta(sec), msg.meta)))
    } else if (msg.type === 'create-banner') {
      const sec = await activeSection()
      if (!sec) throw new Error('没有找到需求画布：先铺一块，或选中已有的 Coco 画布')
      const meta: Meta = Object.assign(readMeta(sec), msg.meta)
      if (!roleText(sec, 'prompt')) throw new Error('画布上的画面提示词是空的')
      const res = await createBanner(sec, meta)
      reply(Object.assign({ type: 'banner' }, res))
    } else if (msg.type === 'collect') {
      const sec = await activeSection()
      if (!sec) throw new Error('没有找到需求画布')
      reply({ type: 'collected', payload: await collectForBackend(sec, Object.assign(readMeta(sec), msg.meta)) })
    } else if (msg.type === 'fill-bg') {
      const bg = await figma.getNodeByIdAsync(msg.bgId || '')
      if (!bg || bg.removed || bg.type !== 'RECTANGLE') throw new Error('Banner 的背景层已被删除')
      const img = figma.createImage(figma.base64Decode(msg.image || ''))
      bg.fills = [{ type: 'IMAGE', imageHash: img.hash, scaleMode: 'FILL' }]
      bg.name = '背景（后端生成）'
      reply({ type: 'filled' })
    } else if (msg.type === 'save-prompt') {
      const sec = await activeSection()
      if (!sec) throw new Error('没有可保存的提示词')
      const list = await getHistory()
      list.unshift({ prompt: roleText(sec, 'prompt'), negative: roleText(sec, 'negative'), savedAt: Date.now() })
      await figma.clientStorage.setAsync('cocoPrompts', list.slice(0, 30))
      figma.ui.postMessage({ type: 'history', history: list.slice(0, 30) })
      reply({ type: 'ok', text: '已保存到提示词库' })
    } else if (msg.type === 'delete-prompt') {
      const list = await getHistory()
      list.splice(msg.index || 0, 1)
      await figma.clientStorage.setAsync('cocoPrompts', list)
      figma.ui.postMessage({ type: 'history', history: list })
    } else if (msg.type === 'apply-prompt') {
      const sec = await activeSection()
      if (!sec) throw new Error('先选中一块 Coco 画布')
      const item = (await getHistory())[msg.index || 0]
      const p = sec.findOne((n) => n.type === 'TEXT' && roleOf(n) === 'prompt') as TextNode | null
      const ng = sec.findOne((n) => n.type === 'TEXT' && roleOf(n) === 'negative') as TextNode | null
      if (p && item) await setText(p, item.prompt)
      if (ng && item) await setText(ng, item.negative)
      reply({ type: 'ok', text: '已替换当前画布的提示词' })
    } else if (msg.type === 'save-backend') {
      await figma.clientStorage.setAsync('cocoBackend', String(msg.url || ''))
    }
  } catch (e) {
    reply({ type: 'error', message: e instanceof Error ? e.message : String(e) })
  }
}

figma.on('selectionchange', () => { sendContext() })

;(async () => {
  await loadFonts()
  figma.ui.postMessage({
    type: 'init',
    history: await getHistory(),
    backend: (await figma.clientStorage.getAsync('cocoBackend')) || '',
    platforms: PLATFORMS,
  })
  await sendContext()
})()

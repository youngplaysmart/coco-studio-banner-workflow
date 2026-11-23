"""
Coco Banner 后端
- POST /api/parse     Jira 链接 / 原始需求文字 → 结构化草稿（+ Jira 附件图片）
- POST /api/generate  提示词 + 参考图 → 生成背景图（base64 PNG）
- GET  /api/health    健康检查（插件面板用来显示连接状态）

Figma 插件 iframe 的 Origin 是 "null"，所以 CORS 必须放开（用 X-Coco-Token 做简单鉴权）。
"""
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

from jira_client import fetch_issue, find_issue_key  # noqa: E402
from structurer import structure_requirement, PLATFORM_SIZES  # noqa: E402
from image_providers import generate_image, PROVIDER  # noqa: E402

API_TOKEN = os.getenv("COCO_API_TOKEN", "")

app = FastAPI(title="Coco Banner API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # 插件 iframe origin 为 null，只能用 *
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


def check_token(token: str | None):
    if API_TOKEN and token != API_TOKEN:
        raise HTTPException(status_code=401, detail="X-Coco-Token 不正确")


class ParseIn(BaseModel):
    jira_url: str | None = None
    raw_text: str | None = None


class GenerateIn(BaseModel):
    prompt: str
    negative: str = ""
    width: int = 1080
    height: int = 1440
    use_character: bool = True
    references: list[str] = []      # base64（无 data: 前缀）
    character: str | None = None    # base64，Coco 标准形象；为空时用服务器默认图


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "image_provider": PROVIDER,
        "jira": bool(os.getenv("JIRA_BASE_URL")),
        "gradio": bool(os.getenv("GRADIO_URL")),
        "llm": bool(os.getenv("ANTHROPIC_API_KEY")),
        "platforms": PLATFORM_SIZES,
    }


@app.post("/api/parse")
def parse(body: ParseIn, x_coco_token: str | None = Header(default=None)):
    check_token(x_coco_token)

    issue = {"key": None, "summary": "", "description": "", "images": [], "url": body.jira_url}
    text = (body.raw_text or "").strip()

    if body.jira_url:
        key = find_issue_key(body.jira_url)
        if os.getenv("GRADIO_URL"):
            # 复用你现有的 Gradio：链接 → 基础需求文字
            from gradio_bridge import requirement_from_gradio
            text = requirement_from_gradio(body.jira_url) or text
            issue["key"] = key
        if os.getenv("JIRA_BASE_URL") and key:
            issue = {**issue, **fetch_issue(key)}
            if not text:
                text = f"{issue['summary']}\n\n{issue['description']}".strip()
        if not text:
            raise HTTPException(
                400,
                "后端没有配置 Jira 或 Gradio，无法读取链接。请在 .env 配置，或在插件里直接粘贴需求文字。",
            )

    if not text:
        raise HTTPException(400, "请提供 Jira 链接或需求文字")

    draft = structure_requirement(text)
    draft["issue_key"] = issue["key"]
    draft["issue_url"] = issue["url"]
    draft["source_text"] = text
    return {"draft": draft, "images": issue["images"]}


@app.post("/api/generate")
def generate(body: GenerateIn, x_coco_token: str | None = Header(default=None)):
    check_token(x_coco_token)
    if not body.prompt.strip():
        raise HTTPException(400, "画面提示词为空")
    try:
        b64 = generate_image(
            prompt=body.prompt,
            negative=body.negative,
            width=body.width,
            height=body.height,
            references=body.references[:4],
            character=body.character if body.use_character else None,
            use_character=body.use_character,
        )
    except NotImplementedError as e:
        raise HTTPException(501, str(e))
    except Exception as e:  # 把模型报错原样带回插件面板
        raise HTTPException(502, f"生图失败：{e}")
    return {"image": b64, "provider": PROVIDER}

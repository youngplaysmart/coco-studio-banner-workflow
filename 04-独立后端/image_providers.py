"""生图适配层。用 IMAGE_PROVIDER 切换：

  mock    本地渐变占位图，不需要任何 Key，用来跑通整个流程（默认）
  openai  OpenAI 图像接口；有参考图时走 edits（多图参考），没有时走 generations
  weave   Figma Weave API（仅 Weave Enterprise），预留接口

模型只负责出“背景 + 角色”画面，文案由插件在 Figma 里叠成可编辑文字图层。
"""
import base64
import io
import os

import httpx

PROVIDER = os.getenv("IMAGE_PROVIDER", "mock")


def _closest_size(w: int, h: int) -> str:
    if h > w * 1.1:
        return "1024x1536"
    if w > h * 1.1:
        return "1536x1024"
    return "1024x1024"


def _build_prompt(prompt: str, negative: str, use_character: bool, n_refs: int, has_char: bool) -> str:
    parts = [prompt.strip()]
    if n_refs:
        parts.append(f"参考随附的 {n_refs} 张图片的场景、氛围与构图。")
    if use_character and has_char:
        parts.append("角色必须与随附的角色标准形象保持一致，不要改变造型、配色和比例。")
    parts.append("画面中不要出现任何文字、字母或水印。")
    if negative.strip():
        parts.append("避免：" + negative.strip())
    return "\n".join(parts)


def _default_character() -> str | None:
    path = os.getenv("COCO_REF_PATH")
    if path and os.path.exists(path):
        with open(path, "rb") as f:
            return base64.b64encode(f.read()).decode()
    return None


def generate_image(prompt, negative, width, height, references, character, use_character) -> str:
    if use_character and not character:
        character = _default_character()
    full_prompt = _build_prompt(prompt, negative, use_character, len(references), bool(character))

    if PROVIDER == "openai":
        return _openai(full_prompt, width, height, references, character)
    if PROVIDER == "weave":
        return _weave(full_prompt, width, height, references, character)
    return _mock(full_prompt, width, height)


# ---------- mock ----------
def _mock(prompt: str, width: int, height: int) -> str:
    from PIL import Image, ImageDraw

    scale = 1024 / max(width, height)
    w, h = int(width * scale), int(height * scale)
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / h
        d.line([(0, y), (w, y)], fill=(int(255 - 60 * t), int(196 - 40 * t), int(140 + 60 * t)))
    d.ellipse([w * 0.3, h * 0.45, w * 0.7, h * 0.45 + w * 0.4], fill=(255, 236, 200))
    d.text((16, h - 28), f"MOCK {width}x{height}", fill=(60, 40, 80))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return base64.b64encode(buf.getvalue()).decode()


# ---------- OpenAI ----------
def _sniff(raw: bytes):
    if raw[:3] == b"\xff\xd8\xff":
        return "jpg", "image/jpeg"
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "webp", "image/webp"
    return "png", "image/png"


def _openai(prompt, width, height, references, character) -> str:
    key = os.environ["OPENAI_API_KEY"]
    model = os.getenv("IMAGE_MODEL", "gpt-image-1")
    size = _closest_size(width, height)
    headers = {"Authorization": f"Bearer {key}"}
    images = ([character] if character else []) + list(references)

    with httpx.Client(timeout=180) as c:
        if images:
            files = []
            for i, b in enumerate(images):
                raw = base64.b64decode(b)
                ext, mime = _sniff(raw)
                files.append(("image[]", (f"ref{i}.{ext}", raw, mime)))
            r = c.post(
                "https://api.openai.com/v1/images/edits",
                headers=headers,
                data={"model": model, "prompt": prompt, "size": size},
                files=files,
            )
        else:
            r = c.post(
                "https://api.openai.com/v1/images/generations",
                headers=headers,
                json={"model": model, "prompt": prompt, "size": size},
            )
    if r.status_code >= 400:
        raise RuntimeError(r.text[:400])
    return r.json()["data"][0]["b64_json"]


# ---------- Figma Weave ----------
def _weave(prompt, width, height, references, character) -> str:
    """Weave API 只对 Weave Enterprise 开放。
    做法：在 Weave 里搭好“Coco 海报”工作流并发布为 Tool，
    用 GET /v1/tools/{id}/inspect 查到输入 id（提示词、参考图），
    再按官方文档的运行接口提交并轮询结果：
    https://developers.figma.com/docs/weave-api/endpoints/
    拿到 WEAVE_API_TOKEN 和 WEAVE_TOOL_ID 后在这里补全。
    """
    raise NotImplementedError("Weave 生图尚未接入：需要 Weave Enterprise 的 API Token 和工作流 ID")

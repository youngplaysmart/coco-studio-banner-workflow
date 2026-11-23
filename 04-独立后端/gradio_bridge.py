"""复用你现有的 Gradio 应用：Jira 链接 → 基础需求文字。

在 .env 里配置：
  GRADIO_URL=http://127.0.0.1:7860
  GRADIO_API_NAME=/predict      # Gradio 页面底部 “Use via API” 里能看到
"""
import os


def requirement_from_gradio(link: str) -> str:
    from gradio_client import Client  # pip install gradio_client

    client = Client(os.environ["GRADIO_URL"])
    result = client.predict(link, api_name=os.getenv("GRADIO_API_NAME", "/predict"))
    # 有的 Gradio 函数返回 tuple / dict，这里取第一段文字
    if isinstance(result, (list, tuple)):
        result = result[0]
    if isinstance(result, dict):
        result = result.get("text") or result.get("value") or str(result)
    return str(result or "").strip()

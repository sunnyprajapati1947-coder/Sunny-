from core.github_agent_adapter import (
    adapter_status,
    route_task,
    parse_qwen_message,
)

def test_status():
    result = adapter_status()
    assert result["success"] is True
    assert result["source"] == "MwesigwaLewis/local-ai-agent"

def test_router():
    result = route_task("hello Nova")
    assert result.key

def test_parser():
    result = parse_qwen_message({
        "role": "assistant",
        "content": "Hello Boss!"
    })
    assert result.content == "Hello Boss!"
    assert result.wants_tools is False

if __name__ == "__main__":
    test_status()
    test_router()
    test_parser()
    print("NOVA GITHUB AGENT ADAPTER: PASS")

from core.github_agent_runtime import runtime_status

if __name__ == "__main__":
    status = runtime_status()

    assert status["success"] is True
    assert status["runtime"] == "GitHub Agent Loop"
    assert status["tools"] == "NovaToolRegistry"
    assert status["security"] == "Nova boundary"

    print("NOVA GITHUB AGENT RUNTIME: PASS")

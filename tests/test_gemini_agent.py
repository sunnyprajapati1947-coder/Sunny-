"""v8 Gemini agent — function-calling loop over Nova's secure tool registry."""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core import gemini_agent as ga
from core import gemini_lane as gl
from core.tool_registry import NovaTool


def _fake_response(payload: dict):
    class FakeResponse:
        status = 200
        def __init__(self, data):
            self._data = json.dumps(data).encode("utf-8")
        def read(self):
            return self._data
        def __enter__(self):
            return self
        def __exit__(self, *a):
            return False
    return FakeResponse(payload)


def _text_payload(text: str) -> dict:
    return {"candidates": [{"content": {"role": "model", "parts": [{"text": text}]}}]}


def _call_payload(name: str, args: dict | None = None) -> dict:
    return {"candidates": [{"content": {"role": "model", "parts": [
        {"functionCall": {"name": name, "args": args or {}}}
    ]}}]}


class FakeRegistry:
    """Same interface as NovaToolRegistry — execute record karta hai."""

    def __init__(self, tools, results=None):
        self.tools = tools
        self.results = results or {}
        self.executed: list[tuple[str, dict]] = []

    def list_tools(self):
        return self.tools

    def execute(self, name, arguments=None, **kwargs):
        self.executed.append((name, dict(arguments or {})))
        return self.results.get(name, {"success": True, "data": "ok"})


def _tool(name: str, description: str = "test tool", params: dict | None = None) -> NovaTool:
    def run(location: str = "dhanbad") -> dict:
        return {"success": True}
    run.__name__ = name
    if params is None:
        params = {"type": "object",
                  "properties": {"location": {"type": "string", "description": "city"}},
                  "required": ["location"], "additionalProperties": False}
    return NovaTool(name=name, category="test", description=description,
                    run=run, parameters=params)


class AgentEnv(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="nova_agent_")
        envs = {
            "NOVA_GEMINI_KEY_FILE": str(Path(self.tmp) / "gemini.key"),
            "NOVA_CHAT_HISTORY": str(Path(self.tmp) / "chat.json"),
            "NOVA_PROFILE_PATH": str(Path(self.tmp) / "profile.json"),
        }
        patcher = patch.dict("os.environ", envs, clear=False)
        patcher.start()
        self.addCleanup(patcher.stop)
        gl.set_key("AIza" + "a1b2c3d4e5" * 4)
        self.addCleanup(ga._set_registry, None)
        # har test apna fake registry set kare
        self.fake = FakeRegistry([_tool("api_weather"), _tool("phone_battery")])
        ga._set_registry(self.fake)


class DeclarationsTest(AgentEnv):
    def test_format_openapi_subset(self):
        decls = {d["name"]: d for d in ga.tool_declarations()}
        self.assertIn("api_weather", decls)
        w = decls["api_weather"]
        self.assertEqual(w["parameters"]["type"], "object")
        self.assertEqual(w["parameters"]["properties"]["location"]["type"], "string")
        self.assertEqual(w["parameters"]["required"], ["location"])
        self.assertIn("description", w)
        # Gemini OpenAPI subset me additionalProperties nahi jata
        self.assertNotIn("additionalProperties", json.dumps(w))

    def test_allowlist_env_override(self):
        with patch.dict("os.environ", {"NOVA_AGENT_TOOLS": "api_weather"}):
            decls = ga.tool_declarations()
        self.assertEqual([d["name"] for d in decls], ["api_weather"])

    def test_parameterless_tool_skipped(self):
        tool = _tool("no_params_tool")
        tool = NovaTool(name="no_params_tool", category="test", description="x",
                        run=lambda: {"success": True}, parameters=None)
        # signature-derived schema -> no params -> skipped? signature has none -> properties {}
        self.fake.tools = [tool]
        with patch.dict("os.environ", {"NOVA_AGENT_TOOLS": "no_params_tool"}):
            self.assertEqual(ga.tool_declarations(), [])


class AgentLoopTest(AgentEnv):
    def test_tool_call_then_answer(self):
        self.fake.results = {"api_weather": {"success": True, "city": "dhanbad", "temp_c": 31}}
        responses = [
            _fake_response(_call_payload("api_weather", {"location": "dhanbad"})),
            _fake_response(_text_payload("Boss, Dhanbad me 31 degree garmi hai.")),
        ]
        with patch("core.gemini_lane.urlopen", side_effect=responses) as u:
            result = ga.run_agent("dhanbad ka mausam batao", system="Tu Jarvis hai.")
        self.assertTrue(result["success"], result)
        self.assertEqual(result["answer"], "Boss, Dhanbad me 31 degree garmi hai.")
        self.assertEqual(result["tools_used"], 1)
        self.assertEqual(result["tool_calls"][0]["name"], "api_weather")
        # tool registry ke through hi chala
        self.assertEqual(self.fake.executed, [("api_weather", {"location": "dhanbad"})])
        # pehle request me tools the
        body1 = json.loads(u.call_args_list[0][0][0].data.decode("utf-8"))
        self.assertIn("tools", body1)
        decl_names = {d["name"] for d in body1["tools"][0]["functionDeclarations"]}
        self.assertIn("api_weather", decl_names)
        self.assertIn("system_instruction", body1)
        # doosre request me functionResponse + model ka functionCall dono
        body2 = json.loads(u.call_args_list[1][0][0].data.decode("utf-8"))
        parts = [p for c in body2["contents"] for p in c["parts"]]
        self.assertTrue(any("functionCall" in p for p in parts))
        fr = [p for p in parts if "functionResponse" in p]
        self.assertEqual(fr[0]["functionResponse"]["name"], "api_weather")
        self.assertIn("dhanbad", json.dumps(fr[0]))

    def test_multiple_tool_rounds(self):
        responses = [
            _fake_response(_call_payload("api_weather", {"location": "dhanbad"})),
            _fake_response(_call_payload("phone_battery", {})),
            _fake_response(_text_payload("Mausam 31 degree, battery 84 percent.")),
        ]
        with patch("core.gemini_lane.urlopen", side_effect=responses):
            result = ga.run_agent("mausam aur battery dono batao")
        self.assertTrue(result["success"])
        self.assertEqual(result["tools_used"], 2)
        self.assertEqual([n for n, _ in self.fake.executed],
                         ["api_weather", "phone_battery"])

    def test_non_allowlisted_tool_rejected(self):
        responses = [
            _fake_response(_call_payload("phone_dial", {"number": "123"})),
            _fake_response(_text_payload("Boss, dial tool available nahi hai.")),
        ]
        with patch("core.gemini_lane.urlopen", side_effect=responses) as u:
            result = ga.run_agent("kisi ko call karo")
        self.assertTrue(result["success"])
        # execute KABHI nahi hua — allowlist ne roka
        self.assertEqual(self.fake.executed, [])
        body2 = json.loads(u.call_args_list[1][0][0].data.decode("utf-8"))
        parts = [p for c in body2["contents"] for p in c["parts"]]
        fr = [p for p in parts if "functionResponse" in p]
        self.assertIn("allowlist", fr[0]["functionResponse"]["response"]["output"])

    def test_rounds_bounded_forced_final(self):
        # model hamesha tool hi maangta hai — max_rounds=2 ke baad bina tools final
        responses = [
            _fake_response(_call_payload("api_weather", {"location": "x"})),
            _fake_response(_call_payload("api_weather", {"location": "x"})),
            _fake_response(_text_payload("Bas Boss, itna hi mila.")),
        ]
        with patch("core.gemini_lane.urlopen", side_effect=responses) as u:
            result = ga.run_agent("mausam", max_rounds=2)
        self.assertTrue(result["success"])
        self.assertEqual(result["answer"], "Bas Boss, itna hi mila.")
        # 2 tool-rounds + 1 forced-final = 3 calls; final me tools NAHI the
        self.assertEqual(u.call_count, 3)
        body3 = json.loads(u.call_args_list[2][0][0].data.decode("utf-8"))
        self.assertNotIn("tools", body3)

    def test_no_key_fails_clean(self):
        gl.clear_key()
        self.assertFalse(ga.run_agent("kuch")["success"])

    def test_agent_disabled_env(self):
        with patch.dict("os.environ", {"NOVA_AGENT_ENABLED": "0"}):
            result = ga.run_agent("kuch")
        self.assertFalse(result["success"])
        self.assertIn("band", result["error"])

    def test_network_fail_clean(self):
        import urllib.error
        with patch("core.gemini_lane.urlopen",
                   side_effect=urllib.error.URLError("net down")):
            result = ga.run_agent("kuch")
        self.assertFalse(result["success"])
        self.assertNotIn("AIza", json.dumps(result))

    def test_tool_output_truncated(self):
        big = _tool("api_weather")
        self.fake.tools = [big]
        self.fake.results = {"api_weather": {"success": True, "data": "x" * 5000}}
        responses = [
            _fake_response(_call_payload("api_weather", {"location": "dhanbad"})),
            _fake_response(_text_payload("done")),
        ]
        with patch("core.gemini_lane.urlopen", side_effect=responses) as u:
            ga.run_agent("mausam")
        body2 = json.loads(u.call_args_list[1][0][0].data.decode("utf-8"))
        parts = [p for c in body2["contents"] for p in c["parts"]]
        fr = [p for p in parts if "functionResponse" in p][0]
        self.assertLess(len(json.dumps(fr)), 2200)


class BrainRoutingTest(AgentEnv):
    def test_brain_prefers_agent(self):
        # "mausam/battery" jaise words regex intents kha jaate hain, isliye
        # chat-route phrase jo agent ko api_dictionary call karwati hai.
        dict_tool = _tool("api_dictionary")
        dict_tool = NovaTool(
            name="api_dictionary", category="test", description="word meaning",
            run=lambda word: {"success": True},
            parameters={"type": "object", "properties": {"word": {"type": "string"}},
                        "required": ["word"]})
        self.fake.tools = [dict_tool]
        self.fake.results = {"api_dictionary": {"success": True, "meaning": "surprised"}}
        responses = [
            _fake_response(_call_payload("api_dictionary", {"word": "flabbergasted"})),
            _fake_response(_text_payload("Boss, iska matlab hai hairan reh jana.")),
        ]
        from core import jarvis_brain as jb
        with patch("core.gemini_lane.urlopen", side_effect=responses), \
             patch("core.fast_router.ask") as local_ask:
            result = jb.respond("flabbergasted iska matlab kya hai jara batao")
        self.assertTrue(result["success"], result)
        self.assertEqual(result.get("via"), "gemini")
        self.assertEqual(result.get("tools_used"), 1)
        local_ask.assert_not_called()

    def test_brain_falls_back_to_plain_gemini_when_agent_disabled(self):
        responses = [_fake_response(_text_payload("Boss, theek hu."))]
        from core import jarvis_brain as jb
        with patch.dict("os.environ", {"NOVA_AGENT_ENABLED": "0"}), \
             patch("core.gemini_lane.urlopen", side_effect=responses) as u, \
             patch("core.fast_router.ask") as local_ask:
            result = jb.respond("thoda motivation do")
        self.assertTrue(result["success"])
        self.assertEqual(result.get("via"), "gemini")
        # agent band tha -> sirf plain call, tools body me nahi
        body = json.loads(u.call_args_list[0][0][0].data.decode("utf-8"))
        self.assertNotIn("tools", body)
        local_ask.assert_not_called()


if __name__ == "__main__":
    unittest.main()

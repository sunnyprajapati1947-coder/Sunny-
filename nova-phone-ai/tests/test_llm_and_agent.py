import tempfile
import unittest
from pathlib import Path

from tests.helpers import MockOpenAIServer, build_agent, make_ctx, make_config, reply_body
from nova.agent import Agent, parse_action
from nova.config import OnlineConfig
from nova.llm import ChatClient, LLMError, Router, strip_reasoning
from nova.tools import build_registry


class ChatClientTests(unittest.TestCase):
    def test_strip_reasoning_blocks(self):
        self.assertEqual(strip_reasoning("<think>hmm</think>Final"), "Final")
        self.assertEqual(strip_reasoning("Answer<think>unfinished"), "Answer")

    def test_successful_chat_over_http_and_thinking_disabled(self):
        with MockOpenAIServer(lambda p, b: (200, reply_body("<think>x</think>{\"final\": \"namaste\"}"))) as srv:
            client = ChatClient("local", srv.url + "/v1", "m", 5, disable_thinking=True)
            reply = client.chat([{"role": "user", "content": "hi"}])
            self.assertEqual(reply.text, '{"final": "namaste"}')
            payload = srv.requests[-1]
            self.assertEqual(payload["chat_template_kwargs"], {"enable_thinking": False})
            self.assertFalse(payload["stream"])
            self.assertTrue(client.health()[0])

    def test_http_error_and_context_overflow_are_classified(self):
        def handler(path, payload):
            return 400, {"error": {"message": "request exceeds the available context size", "type": "exceed_context_size_error"}}
        with MockOpenAIServer(handler) as srv:
            with self.assertRaises(LLMError) as ctx:
                ChatClient("local", srv.url + "/v1", "m", 5).chat([{"role": "user", "content": "x"}])
            self.assertEqual(ctx.exception.kind, "context")

    def test_empty_or_malformed_answers_are_errors(self):
        with MockOpenAIServer(lambda p, b: (200, reply_body(""))) as srv:
            with self.assertRaises(LLMError) as ctx:
                ChatClient("local", srv.url + "/v1", "m", 5).chat([{"role": "user", "content": "x"}])
            self.assertEqual(ctx.exception.kind, "bad_response")
        with MockOpenAIServer(lambda p, b: (200, {"unexpected": True})) as srv:
            with self.assertRaises(LLMError):
                ChatClient("local", srv.url + "/v1", "m", 5).chat([{"role": "user", "content": "x"}])

    def test_unreachable_server_reports_connect(self):
        with self.assertRaises(LLMError) as ctx:
            ChatClient("local", "http://127.0.0.1:9/v1", "m", 2).chat([{"role": "user", "content": "x"}])
        self.assertEqual(ctx.exception.kind, "connect")
        self.assertFalse(ChatClient("local", "http://127.0.0.1:9/v1", "m", 2).health()[0])


class RouterTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def test_online_lane_not_used_unless_enabled_and_keyed(self):
        cfg = make_config(self.tmp)
        cfg.llm.base_url = "http://127.0.0.1:9/v1"
        cfg.online = OnlineConfig(enabled=True, base_url="http://127.0.0.1:9/online")
        cfg.secrets = {}
        self.assertIsNone(Router(cfg).online)  # enabled but no key -> not used
        cfg.secrets = {"NOVA_ONLINE_API_KEY": "test-key-1234567890"}
        self.assertIsNotNone(Router(cfg).online)

    def test_fallback_to_online_uses_bearer_key_and_local_stays_first(self):
        with MockOpenAIServer(lambda p, b: (200, reply_body("online-answer"))) as online, \
                MockOpenAIServer(lambda p, b: (200, reply_body("local-answer"))) as local:
            cfg = make_config(self.tmp)
            cfg.llm.base_url = local.url + "/v1"
            cfg.online = OnlineConfig(enabled=True, base_url=online.url + "/v1", model="x")
            cfg.secrets = {"NOVA_ONLINE_API_KEY": "test-key-1234567890"}
            router = Router(cfg)
            reply = router.chat([{"role": "user", "content": "hi"}])
            self.assertEqual((reply.lane, reply.text), ("local", "local-answer"))
            self.assertEqual(len(online.requests), 0)
        with MockOpenAIServer(lambda p, b: (200, reply_body("online-answer"))) as online:
            cfg.llm.base_url = "http://127.0.0.1:9/v1"
            cfg.online.base_url = online.url + "/v1"
            router = Router(cfg)
            reply = router.chat([{"role": "user", "content": "hi"}])
            self.assertEqual((reply.lane, reply.text), ("online", "online-answer"))
            auth = [h.get("Authorization") for h in online.headers if h.get("Authorization")]
            self.assertEqual(auth, ["Bearer test-key-1234567890"])


class AgentLoopTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def test_parse_action_variants(self):
        self.assertEqual(parse_action('```json\n{"tool": "current_time", "args": {}}\n```')["tool"], "current_time")
        self.assertEqual(parse_action('Sure: {"final": "done"}')["final"], "done")
        self.assertIsNone(parse_action("plain prose with no json"))
        self.assertIsNone(parse_action('{"other": 1}'))

    def test_model_tool_call_then_final_answer(self):
        cfg, mem, ctx = make_ctx(self.tmp)
        agent, router, _ = build_agent(ctx, [
            '{"tool": "write_file", "args": {"path": "plan.txt", "content": "step one"}}',
            '{"tool": "read_file", "args": {"path": "plan.txt"}}',
            '{"final": "Plan.txt bana diya aur verify kar liya."}'])
        result = agent.respond("plan file banao", use_rules=False)
        self.assertTrue(result.ok, result.error)
        self.assertEqual([c.tool for c in result.tool_calls], ["write_file", "read_file"])
        self.assertTrue(all(c.ok for c in result.tool_calls))
        self.assertEqual((cfg.workspace / "plan.txt").read_text(), "step one")
        # the second model turn saw the verified tool result
        self.assertTrue(any("TOOL_RESULT" in m["content"] for m in router.calls[-1]))
        mem.close()

    def test_failed_tool_then_recovery(self):
        cfg, mem, ctx = make_ctx(self.tmp)
        agent, _, _ = build_agent(ctx, [
            '{"tool": "read_file", "args": {"path": "missing.txt"}}',
            '{"tool": "write_file", "args": {"path": "missing.txt", "content": "now here"}}',
            '{"final": "File nahi tha, ab bana diya."}'])
        result = agent.respond("file padho", use_rules=False)
        self.assertTrue(result.ok is False)  # a failed tool is never silently ignored
        self.assertEqual(result.tool_failures, 1)
        mem.close()

    def test_format_errors_are_bounded(self):
        cfg, mem, ctx = make_ctx(self.tmp)
        cfg.agent.max_format_errors = 2
        agent, router, _ = build_agent(ctx, ["nope", "still nope", "nope again", "never reached"])
        result = agent.respond("hello", use_rules=False)
        self.assertFalse(result.ok)
        self.assertIn("valid action JSON", result.error)
        self.assertEqual(len(router.calls), 3)  # 1 + 2 format retries, then stop
        mem.close()

    def test_step_limit_is_enforced(self):
        cfg, mem, ctx = make_ctx(self.tmp)
        loops = ['{"tool": "current_time", "args": {}}'] * 10
        agent, router, _ = build_agent(ctx, loops)
        result = agent.respond("loop", max_steps=3, use_rules=False)
        self.assertFalse(result.ok)
        self.assertIn("step limit", result.error)
        self.assertEqual(len(router.calls), 3)
        mem.close()

    def test_rules_lane_runs_without_model(self):
        cfg, mem, ctx = make_ctx(self.tmp)
        agent, router, _ = build_agent(ctx, [])
        result = agent.respond("create file hi.txt with content namaste")
        self.assertTrue(result.ok, result.error)
        self.assertEqual(result.lane, "rules")
        self.assertEqual(router.calls, [])
        self.assertEqual((cfg.workspace / "hi.txt").read_text(), "namaste")
        mem.close()

    def test_model_offline_gives_clear_error(self):
        cfg, mem, ctx = make_ctx(self.tmp)
        agent = Agent(ctx, build_registry(), Router(cfg))  # real router, unreachable server
        result = agent.respond("kuch bhi poocho")
        self.assertFalse(result.ok)
        self.assertTrue(result.error.startswith("model unavailable"), result.error)
        mem.close()

    def test_end_to_end_with_real_http_model(self):
        """Full path: Agent -> Router -> ChatClient -> real HTTP server (OpenAI-compatible)."""
        replies = iter(['{"tool": "current_time", "args": {}}', '{"final": "Abhi ka time mil gaya."}'])
        with MockOpenAIServer(lambda p, b: (200, reply_body(next(replies)))) as srv:
            cfg, mem, ctx = make_ctx(self.tmp, base_url=srv.url + "/v1")
            agent = Agent(ctx, build_registry(), Router(cfg))
            result = agent.respond("samay batao", use_rules=False)
            self.assertTrue(result.ok, result.error)
            self.assertEqual(result.answer, "Abhi ka time mil gaya.")
            self.assertEqual(result.lane, "local")
            self.assertEqual(result.tool_calls[0].tool, "current_time")
            mem.close()


if __name__ == "__main__":
    unittest.main()

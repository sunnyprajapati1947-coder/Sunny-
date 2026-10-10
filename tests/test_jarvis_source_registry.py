"""Integration checks with the existing core (which depends on requests)."""
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from core.tool_bridge import build_registry
from security.audit import NovaAudit
from security.kill_switch import NovaKillSwitch


class JarvisSourceRegistryTests(unittest.TestCase):
    def test_catalog_registered_as_read_only_tool(self):
        tool = build_registry().get("github_source_catalog")
        self.assertTrue(tool.enabled)
        self.assertFalse(tool.high_impact)
        self.assertEqual(tool.parameter_schema()["properties"], {})
        self.assertFalse(tool.parameter_schema()["additionalProperties"])
        self.assertEqual(tool.run()["active_upstream_runtimes"], 0)

    def test_catalog_uses_existing_untrusted_data_boundary(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            registry = build_registry()
            registry.audit = NovaAudit(root / "audit.jsonl")
            registry.kill_switch = NovaKillSwitch(root / "kill")
            result = registry.execute("github_source_catalog")
            self.assertTrue(result["success"])
            self.assertEqual(result["result"]["trust"], "untrusted")
            self.assertEqual(result["result"]["security"]["instruction_authority"], "none")
            self.assertEqual(result["result"]["content"]["source_count"], 10)

    def test_model_cannot_request_download_through_catalog(self):
        with TemporaryDirectory() as tmp:
            registry = build_registry()
            registry.audit = NovaAudit(Path(tmp) / "audit.jsonl")
            registry.kill_switch = NovaKillSwitch(Path(tmp) / "kill")
            result = registry.execute("github_source_catalog", {"fetch": "public-apis"})
            self.assertFalse(result["success"])
            self.assertTrue(result["blocked"])


if __name__ == "__main__":
    unittest.main()

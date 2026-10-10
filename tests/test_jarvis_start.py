"""Offline tests: no phone, API key, network, or third-party runtime needed."""
from contextlib import redirect_stderr, redirect_stdout
import io
import json
from pathlib import Path
import re
import subprocess
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import jarvis_start


class JarvisStartTests(unittest.TestCase):
    def test_exact_requested_sources_and_pinned_revisions(self):
        expected = {
            "browser-use/jev-ultrafast", "NandhaKishorM/laya",
            "open-jarvis/OpenJarvis", "codecrafters-io/build-your-own-x",
            "public-apis/public-apis", "EbookFoundation/free-programming-books",
            "TauricResearch/TradingAgents", "trailhq/Graft",
            "VoltAgent/awesome-agent-skills", "FlashML-org/FreeVideo",
        }
        self.assertEqual({source.repo for source in jarvis_start.SOURCES}, expected)
        self.assertEqual(len({source.id for source in jarvis_start.SOURCES}), 10)
        for source in jarvis_start.SOURCES:
            self.assertIsNotNone(re.fullmatch(r"[a-f0-9]{40}", source.revision))
            self.assertEqual(source.url, f"https://github.com/{source.repo}.git")

    def test_catalog_never_enables_runtimes(self):
        result = jarvis_start.source_catalog()
        self.assertEqual(result["source_count"], 10)
        self.assertEqual(result["active_upstream_runtimes"], 0)
        self.assertEqual(result["mode"], "catalog-only")
        for source in result["sources"]:
            self.assertFalse(source["runtime_enabled"])
            self.assertEqual(source["integration_status"], "planned")
        self.assertEqual(sum(s.kind == "reference" for s in jarvis_start.SOURCES), 4)

    def test_phone_modes_keep_gpu_runtime_off_device(self):
        sources = {source.id: source for source in jarvis_start.SOURCES}
        self.assertEqual(sources["freevideo"].phone_mode, "remote-gpu-only")
        self.assertIn("16 GB", sources["freevideo"].requirements)
        self.assertIn("MiniMax H3 Community License", sources["freevideo"].caution)
        self.assertEqual(sources["openjarvis"].phone_mode, "isolated-python-3.12")
        for source in sources.values():
            self.assertNotEqual(source.phone_mode, "review-required")

    @patch("jarvis_start.subprocess.run")
    @patch("jarvis_start.fetch_source")
    def test_phone_plan_cli_is_not_an_installer(self, fetch, run):
        output = io.StringIO()
        with redirect_stdout(output):
            self.assertEqual(jarvis_start.main(["--phone-plan"]), 0)
        plan = json.loads(output.getvalue())
        self.assertEqual(plan["stage"], "plan-only")
        self.assertEqual(plan["target_python"], "3.12.x")
        self.assertFalse(plan["native_python_change_required"])
        self.assertEqual(plan["requested_inference_mode"], "local-keyless")
        self.assertFalse(plan["api_key_required_for_local_chat"])
        self.assertEqual(plan["native_inference_package"], "llama-cpp")
        self.assertFalse(plan["local_freevideo_inference_supported"])
        self.assertFalse(plan["automatic_financial_execution"])
        self.assertEqual(plan["max_concurrent_local_models"], 1)
        self.assertEqual(plan["upstream_runtimes_installed_by_plan"], 0)
        self.assertEqual(len(plan["sources"]), 10)
        self.assertIn("ubuntu:24.04", plan["termux_commands"][2])
        self.assertTrue(all(not s["runtime_enabled"] for s in plan["sources"]))
        fetch.assert_not_called()
        run.assert_not_called()

    @patch("jarvis_start.sys.version_info", (3, 14, 6))
    @patch("jarvis_start.subprocess.run")
    def test_native_python_314_gets_a_warning_not_a_downgrade(self, run):
        with TemporaryDirectory() as tmp:
            result = jarvis_start.phone_check(Path(tmp), Path(tmp) / "missing")
            self.assertTrue(any("supported range" in msg for msg in result["warnings"]))
        run.assert_not_called()

    def test_returned_catalog_cannot_mutate_source_definitions(self):
        result = jarvis_start.source_catalog()
        result["sources"][0]["runtime_enabled"] = True
        result["sources"][0]["repo"] = "attacker/example"
        again = jarvis_start.source_catalog()
        self.assertFalse(again["sources"][0]["runtime_enabled"])
        self.assertEqual(again["sources"][0]["repo"], "browser-use/jev-ultrafast")

    def test_reference_license_and_financial_limits(self):
        sources = {source.id: source for source in jarvis_start.SOURCES}
        self.assertIsNone(sources["build-your-own-x"].license)
        self.assertEqual(sources["free-programming-books"].license, "CC-BY-4.0")
        self.assertIn("never connects a broker", sources["tradingagents"].caution)
        self.assertIn("Never auto-install", sources["awesome-agent-skills"].caution)

    @patch("jarvis_start.subprocess.run")
    def test_check_is_read_only_and_does_not_expose_keys(self, run):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            meminfo = root / "meminfo"
            meminfo.write_text("MemTotal:       8388608 kB\n", encoding="utf-8")
            with patch.dict("os.environ", {"GEMINI_API_KEY": "do-not-print-me"}):
                result = jarvis_start.phone_check(root, meminfo)
            self.assertEqual(result["total_ram_gib"], 8.0)
            self.assertNotIn("do-not-print-me", json.dumps(result))
            self.assertFalse(result["assistant_runtime_ready"])
            self.assertEqual(result["stage"], "preflight-only")
            self.assertEqual(sorted(path.name for path in root.iterdir()), ["meminfo"])
        run.assert_not_called()

    def test_missing_meminfo_is_supported(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            result = jarvis_start.phone_check(root, root / "missing")
            self.assertIsNone(result["total_ram_gib"])

    @patch("jarvis_start.subprocess.run")
    @patch("jarvis_start.shutil.which", return_value=None)
    def test_missing_git_blocks_download(self, which, run):
        with TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(RuntimeError, "Git is unavailable"):
                jarvis_start.fetch_source("public-apis", Path(tmp))
            self.assertEqual(list(Path(tmp).iterdir()), [])
        run.assert_not_called()

    @patch("jarvis_start.subprocess.run")
    def test_unknown_source_cannot_be_a_shell_command_or_url(self, run):
        with TemporaryDirectory() as tmp:
            for bad in ["../../elsewhere", "--help", "public-apis; echo bad", "https://github.com/attacker/example"]:
                with self.assertRaises(ValueError):
                    jarvis_start.fetch_source(bad, Path(tmp))
            self.assertEqual(list(Path(tmp).iterdir()), [])
        run.assert_not_called()

    @patch("jarvis_start.subprocess.run")
    @patch("jarvis_start.shutil.which", return_value="/usr/bin/git")
    def test_existing_download_is_never_overwritten(self, which, run):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            target = root / "workspace" / "sources" / "public-apis"
            target.mkdir(parents=True)
            marker = target / "my-file"
            marker.write_text("keep", encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "already exists"):
                jarvis_start.fetch_source("public-apis", root)
            self.assertEqual(marker.read_text(encoding="utf-8"), "keep")
        run.assert_not_called()

    @patch("jarvis_start.subprocess.run")
    @patch("jarvis_start.shutil.which", return_value="/usr/bin/git")
    def test_source_directory_cannot_escape_via_symlink(self, which, run):
        with TemporaryDirectory() as tmp:
            root = Path(tmp) / "project"
            outside = Path(tmp) / "outside"
            root.mkdir()
            outside.mkdir()
            (root / "workspace").symlink_to(outside, target_is_directory=True)
            with self.assertRaisesRegex(RuntimeError, "inside this workspace"):
                jarvis_start.fetch_source("public-apis", root)
            self.assertEqual(list(outside.iterdir()), [])
        run.assert_not_called()

    @patch("jarvis_start.subprocess.run")
    @patch("jarvis_start.shutil.which", return_value="/usr/bin/git")
    def test_dangling_destination_symlink_is_not_overwritten(self, which, run):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            base = root / "workspace" / "sources"
            base.mkdir(parents=True)
            target = base / "public-apis"
            target.symlink_to(root / "missing", target_is_directory=True)
            with self.assertRaisesRegex(RuntimeError, "already exists"):
                jarvis_start.fetch_source("public-apis", root)
            self.assertTrue(target.is_symlink())
        run.assert_not_called()

    @patch("jarvis_start.subprocess.run")
    @patch("jarvis_start.shutil.which", return_value="/usr/bin/git")
    def test_fetch_only_downloads_the_selected_snapshot(self, which, run):
        source = next(s for s in jarvis_start.SOURCES if s.id == "public-apis")
        run.return_value = subprocess.CompletedProcess([], 0, stdout=source.revision + "\n", stderr="")
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            result = jarvis_start.fetch_source(source.id, root)
            self.assertEqual(result, root / "workspace" / "sources" / source.id)
            self.assertEqual([p.name for p in result.parent.iterdir()], [source.id])
        commands = [call.args[0] for call in run.call_args_list]
        self.assertEqual(len(commands), 5)
        self.assertEqual(commands[1][-1], source.url)
        self.assertEqual(commands[2][-1], source.revision)
        self.assertEqual(commands[-1][-2:], ["--verify", "HEAD"])
        for call in run.call_args_list:
            self.assertEqual(call.args[0][:3], ["git", "-c", "core.hooksPath=/dev/null"])
            self.assertNotIn("shell", call.kwargs)
            self.assertEqual(call.kwargs["env"]["GIT_LFS_SKIP_SMUDGE"], "1")
            self.assertEqual(call.kwargs["env"]["GIT_TERMINAL_PROMPT"], "0")

    @patch("jarvis_start.subprocess.run", side_effect=subprocess.CalledProcessError(1, ["git"]))
    @patch("jarvis_start.shutil.which", return_value="/usr/bin/git")
    def test_failed_download_leaves_partial_files_without_cleanup(self, which, run):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            with self.assertRaisesRegex(RuntimeError, "no installer ran"):
                jarvis_start.fetch_source("public-apis", root)
            self.assertTrue((root / "workspace" / "sources" / "public-apis").is_dir())

    @patch("jarvis_start.subprocess.run")
    @patch("jarvis_start.shutil.which", return_value="/usr/bin/git")
    def test_unexpected_revision_is_an_error(self, which, run):
        run.return_value = subprocess.CompletedProcess([], 0, stdout="0" * 40 + "\n", stderr="")
        with TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(RuntimeError, "Unexpected source revision"):
                jarvis_start.fetch_source("public-apis", Path(tmp))

    @patch("jarvis_start.fetch_source")
    @patch("jarvis_start.subprocess.run")
    def test_list_cli_never_fetches_or_executes(self, run, fetch):
        output = io.StringIO()
        with redirect_stdout(output):
            self.assertEqual(jarvis_start.main(["--sources"]), 0)
        self.assertEqual(json.loads(output.getvalue())["source_count"], 10)
        run.assert_not_called()
        fetch.assert_not_called()

    @patch("jarvis_start.fetch_source", side_effect=RuntimeError("test download failed"))
    def test_fetch_cli_reports_failure(self, fetch):
        error = io.StringIO()
        with redirect_stderr(error):
            self.assertEqual(jarvis_start.main(["--fetch", "public-apis"]), 1)
        self.assertIn("test download failed", error.getvalue())


if __name__ == "__main__":
    unittest.main()

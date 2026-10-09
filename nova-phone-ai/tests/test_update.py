import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from tests.helpers import ROOT, make_config
from nova import update

GIT_ID = ["-c", "user.name=Nova Test", "-c", "user.email=test@example.invalid"]


def git(*args, cwd):
    return subprocess.run(["git", *GIT_ID, *args], cwd=cwd, capture_output=True, text=True, check=True).stdout.strip()


@unittest.skipIf(os.environ.get("NOVA_CANDIDATE_TEST") == "1", "running inside an update candidate")
@unittest.skipIf(shutil.which("git") is None, "git not installed")
class UpdateTests(unittest.TestCase):
    """Builds a real upstream repo + installed clone, then exercises the update state machine."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        work = self.tmp / "work"
        work.mkdir()
        git("init", "-q", "-b", "main", cwd=work)
        shutil.copytree(ROOT, work / "nova-phone-ai", ignore=shutil.ignore_patterns(
            "__pycache__", "*.pyc", ".git", "*.db*"))
        git("add", "-A", cwd=work)
        git("commit", "-q", "-m", "v0.1.0", cwd=work)
        self.upstream = self.tmp / "upstream.git"
        subprocess.run(["git", "clone", "-q", "--bare", str(work), str(self.upstream)], check=True)
        self.installed = self.tmp / "installed"
        subprocess.run(["git", "clone", "-q", str(self.upstream), str(self.installed)], check=True)
        self.branch = git("rev-parse", "--abbrev-ref", "HEAD", cwd=self.installed)
        self.work = work

    def make_cfg(self):
        cfg = make_config(self.tmp / "cfg")
        cfg.project_root = self.installed / "nova-phone-ai"
        cfg.update.trusted_remotes = [str(self.upstream)]
        cfg.update.branch = self.branch
        cfg.update.remote = "origin"
        return cfg

    def publish(self, label, mutate):
        mutate(self.work / "nova-phone-ai")
        git("add", "-A", cwd=self.work)
        git("commit", "-q", "-m", label, cwd=self.work)
        git("push", "-q", str(self.upstream), "main", cwd=self.work)

    def head(self):
        return git("rev-parse", "HEAD", cwd=self.installed)

    def test_check_reports_fast_forward_update(self):
        self.publish("v0.1.1", lambda p: (p / "nova" / "__init__.py").write_text('"""v2"""\n__version__ = "0.1.1"\n'))
        info = update.check(self.make_cfg())
        self.assertEqual(info["behind"], 1)
        self.assertTrue(info["fast_forward"])
        self.assertFalse(info["local_changes_in_nova"])

    def test_apply_requires_explicit_confirmation(self):
        self.publish("v0.1.1", lambda p: (p / "nova" / "__init__.py").write_text('__version__ = "0.1.1"\n'))
        before = self.head()
        report = update.apply(self.make_cfg(), confirm=False)
        self.assertFalse(report.ok)
        self.assertIn("--yes", report.message)
        self.assertEqual(self.head(), before)

    def test_untrusted_remote_is_refused(self):
        cfg = self.make_cfg()
        cfg.update.trusted_remotes = ["https://github.com/someone-else/evil.git"]
        with self.assertRaises(update.UpdateError) as ctx:
            update.check(cfg)
        self.assertIn("not in update.trusted_remotes", str(ctx.exception))

    def test_local_changes_block_update(self):
        self.publish("v0.1.1", lambda p: (p / "nova" / "__init__.py").write_text('__version__ = "0.1.1"\n'))
        (self.installed / "nova-phone-ai" / "nova" / "__init__.py").write_text("__version__ = 'mine'\n")
        with self.assertRaises(update.UpdateError) as ctx:
            update.apply(self.make_cfg(), confirm=True)
        self.assertIn("uncommitted local changes", str(ctx.exception))

    def test_good_update_applies_with_backup_and_rolls_back(self):
        self.publish("v0.1.1", lambda p: (p / "nova" / "__init__.py").write_text('__version__ = "0.1.1"\n'))
        cfg = self.make_cfg()
        before = self.head()
        report = update.apply(cfg, confirm=True)
        self.assertTrue(report.ok, report.message)
        self.assertNotEqual(self.head(), before)
        self.assertTrue(any("candidate tests passed" in s for s in report.steps))
        backups = list(cfg.backup_dir.glob("*-pre-update.json"))
        self.assertEqual(len(backups), 1)
        self.assertIn('"status": "applied"', backups[0].read_text())
        archives = list(cfg.backup_dir.glob("*.tar.gz"))
        self.assertEqual(len(archives), 1)
        rb = update.rollback(cfg)
        self.assertTrue(rb.ok)
        self.assertEqual(self.head(), before)
        self.assertIn("rolled_back", backups[0].read_text())

    def test_candidate_that_fails_tests_never_touches_install(self):
        self.publish("broken", lambda p: (p / "nova" / "__init__.py").write_text("__version__ = (\n"))
        before = self.head()
        cfg = self.make_cfg()
        with self.assertRaises(update.UpdateError) as ctx:
            update.apply(cfg, confirm=True)
        self.assertIn("FAILED its tests", str(ctx.exception))
        self.assertEqual(self.head(), before)
        self.assertFalse(list(cfg.backup_dir.glob("*.tar.gz")) if cfg.backup_dir.exists() else [])

    def test_rollback_without_update_is_refused(self):
        with self.assertRaises(update.UpdateError):
            update.rollback(self.make_cfg())


if __name__ == "__main__":
    unittest.main()

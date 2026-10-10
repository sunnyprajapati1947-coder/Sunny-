from __future__ import annotations

import sys
import tempfile
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.context_spec import repo_context_pack, render_markdown


def make_repo() -> Path:
    tmp = tempfile.mkdtemp(prefix="nova_ctx_")
    root = Path(tmp)
    (root / "src").mkdir()
    (root / "node_modules" / "junk").mkdir(parents=True)
    (root / "README.md").write_text("# demo\nDemo repo for pack tests.\n", encoding="utf-8")
    (root / "src" / "app.py").write_text(
        "from util import helper\n\n\ndef main():\n    return helper()\n\n\nclass App:\n    pass\n",
        encoding="utf-8",
    )
    (root / "src" / "util.py").write_text(
        "def helper():\n    return 1\n", encoding="utf-8"
    )
    (root / "src" / "data.bin").write_bytes(b"\x00\x01\x02")
    (root / "node_modules" / "junk" / "x.js").write_text("module.exports=1", encoding="utf-8")
    return root


class ContextSpecTest(unittest.TestCase):
    def test_pack_structure(self):
        root = make_repo()
        result = repo_context_pack(str(root), focus="app")
        self.assertTrue(result["success"])
        pack = result["pack"]
        self.assertEqual(pack["root"], str(root))
        # node_modules must be skipped; app.py + util.py + README + data.bin survive.
        self.assertEqual(pack["file_count"], 4)
        self.assertEqual(pack["languages"]["Python"], 2)
        self.assertIn("app.py", " ".join(pack["tree"]))
        self.assertNotIn("node_modules", " ".join(pack["tree"]))
        # util is imported by app -> an import hub.
        hubs = [h["module"] for h in pack["import_hubs"]]
        self.assertIn("util", hubs)
        # Focus words surface app.py as a key file.
        self.assertTrue(any("app.py" in f for f in pack["key_files"]))
        # Python key files get skeletons.
        self.assertTrue(any("main" in defs for defs in pack["skeletons"].values()))

    def test_pack_rejects_missing_dir(self):
        result = repo_context_pack("/nonexistent/nova/path")
        self.assertFalse(result["success"])

    def test_write_file_option(self):
        root = make_repo()
        result = repo_context_pack(str(root), write_file=True)
        self.assertTrue(result["success"])
        written = Path(result["pack"]["written_to"])
        self.assertTrue(written.is_file())
        content = written.read_text(encoding="utf-8")
        self.assertIn("# NOVA_CONTEXT.md", content)
        self.assertIn("## Languages", content)
        self.assertIn("## Import hubs", content)

    def test_render_markdown(self):
        root = make_repo()
        result = repo_context_pack(str(root))
        md = render_markdown(result["pack"])
        self.assertIn("NOVA_CONTEXT.md", md)
        self.assertIn("## Tree", md)
        self.assertIn("## Key files", md)


if __name__ == "__main__":
    unittest.main()

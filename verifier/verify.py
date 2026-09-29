from __future__ import annotations
from dataclasses import dataclass
from typing import Any, Callable

@dataclass(frozen=True)
class Verification:
    ok: bool
    reason: str
    evidence: dict[str, Any]

class NovaVerifier:
    """Fast deterministic verifier for Nova execution results."""

    def verify(self, result: Any, *, require_output: bool = False) -> Verification:
        if not isinstance(result, dict):
            return Verification(
                False,
                "Result is not a dict.",
                {"type": type(result).__name__},
            )

        if result.get("success") is not True:
            return Verification(
                False,
                str(result.get("error") or "Operation reported failure."),
                result,
            )

        if require_output:
            meaningful = any(
                result.get(k) not in (None, "", [], {}, ())
                for k in ("result", "output", "data", "content", "text")
            )
            if not meaningful:
                return Verification(
                    False,
                    "Operation reported success but returned no usable output.",
                    result,
                )

        return Verification(True, "Verified success.", result)

    def verify_predicate(
        self,
        result: Any,
        predicate: Callable[[Any], bool],
        reason: str,
    ) -> Verification:
        try:
            ok = bool(predicate(result))
        except Exception as exc:
            return Verification(
                False,
                f"Verification predicate failed: {type(exc).__name__}: {exc}",
                {},
            )

        return Verification(
            ok,
            "Verified success." if ok else reason,
            {"result": result},
        )

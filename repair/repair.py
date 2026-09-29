from __future__ import annotations
from dataclasses import dataclass
from typing import Any, Callable

from verifier.verify import NovaVerifier, Verification

@dataclass(frozen=True)
class RepairReport:
    success: bool
    attempts: int
    verification: Verification
    history: list[dict[str, Any]]

class NovaRepair:
    """Bounded repair/retry runner. Maximum 2 repair attempts."""

    def __init__(
        self,
        verifier: NovaVerifier | None = None,
        max_attempts: int = 2,
    ):
        self.verifier = verifier or NovaVerifier()
        self.max_attempts = max(0, min(int(max_attempts), 2))

    def run(
        self,
        operation: Callable[[dict[str, Any]], Any],
        *,
        arguments: dict[str, Any] | None = None,
        repair: Callable[
            [dict[str, Any], Verification],
            dict[str, Any] | None
        ] | None = None,
        require_output: bool = False,
    ) -> RepairReport:

        args = dict(arguments or {})
        history: list[dict[str, Any]] = []

        last = Verification(
            False,
            "Operation did not run.",
            {},
        )

        for attempt in range(self.max_attempts + 1):
            try:
                result = operation(args)
            except Exception as exc:
                result = {
                    "success": False,
                    "error": f"{type(exc).__name__}: {exc}",
                }

            last = self.verifier.verify(
                result,
                require_output=require_output,
            )

            history.append({
                "attempt": attempt,
                "ok": last.ok,
                "reason": last.reason,
                "arguments": dict(args),
            })

            if last.ok:
                return RepairReport(
                    True,
                    attempt,
                    last,
                    history,
                )

            if attempt >= self.max_attempts or repair is None:
                break

            new_args = repair(dict(args), last)

            if new_args is None or new_args == args:
                break

            args = dict(new_args)

        return RepairReport(
            False,
            len(history) - 1,
            last,
            history,
        )

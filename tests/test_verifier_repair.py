from verifier.verify import NovaVerifier
from repair.repair import NovaRepair

v = NovaVerifier()

assert v.verify({
    "success": True,
    "result": "ok"
}).ok

assert not v.verify({
    "success": False,
    "error": "bad"
}).ok

calls = []

def operation(args):
    calls.append(dict(args))

    if args.get("fixed"):
        return {
            "success": True,
            "result": "recovered"
        }

    return {
        "success": False,
        "error": "needs repair"
    }

def fix(args, _verification):
    args["fixed"] = True
    return args

report = NovaRepair(max_attempts=2).run(
    operation,
    repair=fix,
)

assert report.success
assert report.attempts == 1
assert len(calls) == 2

print("NOVA VERIFIER + REPAIR: PASS")

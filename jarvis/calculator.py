"""Safe arithmetic + unit conversion (no eval, no names, bounded values)."""
from __future__ import annotations

import ast
import math
import re
import operator

MAX_NODES = 120
MAX_ABS = 1e15

_BINOPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}

_UNARY = {ast.UAdd: operator.pos, ast.USub: operator.neg}

_FUNCTIONS = {
    "sqrt": math.sqrt,
    "sin": math.sin,
    "cos": math.cos,
    "tan": math.tan,
    "asin": math.asin,
    "acos": math.acos,
    "atan": math.atan,
    "log": math.log10,
    "ln": math.log,
    "log2": math.log2,
    "abs": abs,
    "round": round,
    "floor": math.floor,
    "ceil": math.ceil,
    "exp": math.exp,
    "factorial": math.factorial,
}

_CONSTANTS = {"pi": math.pi, "e": math.e, "tau": math.tau}

WORD_REPLACEMENTS = (
    (r"\bplus\b|\band\b|\bजोड़\b|\bjod\b", "+"),
    (r"\bminus\b|\bminus\b|\bghata\b|\bghatay\b", "-"),
    (r"\btimes\b|\bmultiplied by\b|\bmultiply by\b|\bx\b|\bguna\b", "*"),
    (r"\bdivided by\b|\bdivide by\b|\bover\b|\bbhag\b", "/"),
    (r"\bmodulo\b|\bmod\b", "%"),
    (r"\bpower(?: of)?\b|\braised to\b", "**"),
    (r"\bsquare root of\b|\bsqrt of\b", "sqrt"),
)


def _preprocess(expression: str) -> str:
    text = str(expression or "").lower()
    text = text.replace("×", "*").replace("÷", "/").replace("−", "-").replace("–", "-")
    text = text.replace("^", "**")
    text = text.replace(",", "")
    text = text.replace("₹", "").replace("$", "")
    text = re.sub(r"\b(what is|what's|whats|calculate|compute|solve|how much is|kitna hota hai|kitna hai|equals?|answer)\b", " ", text)
    text = re.sub(r"[?=]", " ", text)

    percent_of = re.search(r"(\d+(?:\.\d+)?)\s*(?:%|percent)\s*(?:of)\s*(\d+(?:\.\d+)?)", text)
    if percent_of:
        return f"({percent_of.group(1)}/100)*{percent_of.group(2)}"

    for pattern, replacement in WORD_REPLACEMENTS:
        text = re.sub(pattern, replacement, text)

    text = re.sub(r"\bpercent\b|\bper cent\b", "/100", text)
    text = re.sub(r"\s+", " ", text).strip(" .")
    return text


FACTORIAL_RE = re.compile(r"(\d+)\s*(?:!|factorial\b|ka factorial\b)", re.I)


def _expand_factorials(raw: str) -> str:
    text = str(raw or "")
    if not re.search(r"\bfactorial|!", text, re.I):
        return text
    text = FACTORIAL_RE.sub(r"factorial(\1)", text)
    return text.replace("!", "")


def safe_eval(expression: str) -> dict:
    text = _preprocess(_expand_factorials(expression))
    if not text:
        return {"ok": False, "error": "I need an expression to compute."}
    if len(text) > 240:
        return {"ok": False, "error": "That expression is too long for me to trust."}
    if not re.fullmatch(r"[0-9a-zA-Z_+\-*/%().,\s]+", text):
        return {"ok": False, "error": "Those characters are not part of my calculator."}
    try:
        tree = ast.parse(text, mode="eval")
    except SyntaxError:
        return {"ok": False, "error": "That expression does not parse."}

    nodes = list(ast.walk(tree))
    if len(nodes) > MAX_NODES:
        return {"ok": False, "error": "Expression is too complex."}

    try:
        value = _eval(tree.body)
    except ZeroDivisionError:
        return {"ok": False, "error": "Division by zero is undefined, Sir."}
    except (ValueError, OverflowError, TypeError):
        return {"ok": False, "error": "The result is outside my numeric limits."}
    except _Rejected:
        return {"ok": False, "error": "That expression uses something I do not allow."}

    if isinstance(value, complex):
        return {"ok": False, "error": "That result is complex — beyond this calculator."}
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return {"ok": False, "error": "The result is not a finite number."}
    if abs(value) > MAX_ABS:
        return {"ok": False, "error": "The result exceeds my numeric limits."}
    return {"ok": True, "value": value, "expression": text}


class _Rejected(Exception):
    pass


def _eval(node):
    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)) and not isinstance(node.value, bool):
            return node.value
        raise _Rejected()
    if isinstance(node, ast.Name):
        if node.id in _CONSTANTS:
            return _CONSTANTS[node.id]
        raise _Rejected()
    if isinstance(node, ast.UnaryOp) and type(node.op) in _UNARY:
        return _UNARY[type(node.op)](_eval(node.operand))
    if isinstance(node, ast.BinOp) and type(node.op) in _BINOPS:
        left = _eval(node.left)
        right = _eval(node.right)
        if isinstance(node.op, ast.Pow):
            if abs(right) > 64:
                raise _Rejected()
            if abs(left) > 1e6 and abs(right) > 8:
                raise _Rejected()
        result = _BINOPS[type(node.op)](left, right)
        if isinstance(result, complex):
            raise _Rejected()
        return result
    if isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name) or node.func.id not in _FUNCTIONS:
            raise _Rejected()
        if node.keywords:
            raise _Rejected()
        args = [_eval(arg) for arg in node.args]
        if len(args) > 3:
            raise _Rejected()
        if node.func.id == "factorial":
            if not args or not float(args[0]).is_integer() or args[0] > 20:
                raise _Rejected()
        return _FUNCTIONS[node.func.id](*args)
    raise _Rejected()


LENGTH = {
    "mm": 0.001,
    "millimeter": 0.001,
    "millimetre": 0.001,
    "cm": 0.01,
    "centimeter": 0.01,
    "centimetre": 0.01,
    "m": 1.0,
    "meter": 1.0,
    "metre": 1.0,
    "km": 1000.0,
    "kilometer": 1000.0,
    "kilometre": 1000.0,
    "in": 0.0254,
    "inch": 0.0254,
    "inches": 0.0254,
    "ft": 0.3048,
    "foot": 0.3048,
    "feet": 0.3048,
    "yd": 0.9144,
    "yard": 0.9144,
    "mi": 1609.344,
    "mile": 1609.344,
    "miles": 1609.344,
    "nmi": 1852.0,
}

MASS = {
    "mg": 0.000001,
    "milligram": 0.000001,
    "g": 0.001,
    "gram": 0.001,
    "kg": 1.0,
    "kilogram": 1.0,
    "quintal": 100.0,
    "ton": 1000.0,
    "tonne": 1000.0,
    "lb": 0.45359237,
    "lbs": 0.45359237,
    "pound": 0.45359237,
    "pounds": 0.45359237,
    "oz": 0.0283495231,
    "ounce": 0.0283495231,
}

VOLUME = {
    "ml": 0.001,
    "milliliter": 0.001,
    "millilitre": 0.001,
    "l": 1.0,
    "liter": 1.0,
    "litre": 1.0,
    "gallon": 3.785411784,
    "gal": 3.785411784,
    "cup": 0.24,
    "pint": 0.473176,
}

DATA = {
    "byte": 1.0,
    "bytes": 1.0,
    "kb": 1024.0,
    "mb": 1024.0**2,
    "gb": 1024.0**3,
    "tb": 1024.0**4,
}

TIME = {
    "second": 1.0,
    "seconds": 1.0,
    "sec": 1.0,
    "minute": 60.0,
    "minutes": 60.0,
    "min": 60.0,
    "hour": 3600.0,
    "hours": 3600.0,
    "hr": 3600.0,
    "day": 86400.0,
    "days": 86400.0,
    "week": 604800.0,
}

SPEED = {
    "kmph": 1.0,
    "kmh": 1.0,
    "kph": 1.0,
    "mph": 1.609344,
    "mps": 3.6,
    "knot": 1.852,
}

TEMPERATURE = {"c", "celsius", "f", "fahrenheit", "k", "kelvin"}

FAMILIES = {
    "length": LENGTH,
    "mass": MASS,
    "volume": VOLUME,
    "data": DATA,
    "time": TIME,
    "speed": SPEED,
}

UNIT_ALIASES = {
    "kilometers": "kilometer",
    "kilometres": "kilometre",
    "kms": "km",
    "kgs": "kg",
    "grams": "gram",
    "liters": "liter",
    "litres": "litre",
    "degrees": "c",
    "degree": "c",
    "deg": "c",
    "celsius": "c",
    "fahrenheit": "f",
    "kelvin": "k",
    "mbps": "mb",
}


def convert(value: float, from_unit: str, to_unit: str) -> dict:
    source = UNIT_ALIASES.get(from_unit.strip().lower(), from_unit.strip().lower())
    target = UNIT_ALIASES.get(to_unit.strip().lower(), to_unit.strip().lower())
    try:
        amount = float(value)
    except (TypeError, ValueError):
        return {"ok": False, "error": "That value is not a number."}

    if source in TEMPERATURE and target in TEMPERATURE:
        if source == target:
            result = amount
        elif source == "c" and target == "f":
            result = amount * 9 / 5 + 32
        elif source == "f" and target == "c":
            result = (amount - 32) * 5 / 9
        elif source == "c" and target == "k":
            result = amount + 273.15
        elif source == "k" and target == "c":
            result = amount - 273.15
        elif source == "f" and target == "k":
            result = (amount - 32) * 5 / 9 + 273.15
        elif source == "k" and target == "f":
            result = (amount - 273.15) * 9 / 5 + 32
        else:
            return {"ok": False, "error": "Unsupported temperature conversion."}
        return {
            "ok": True,
            "value": round(result, 4),
            "from": {"value": amount, "unit": source},
            "to": {"value": round(result, 4), "unit": target},
        }

    for family, table in FAMILIES.items():
        if source in table and target in table:
            base = amount * table[source]
            result = base / table[target]
            return {
                "ok": True,
                "value": result,
                "family": family,
                "from": {"value": amount, "unit": source},
                "to": {"value": result, "unit": target},
            }

    return {"ok": False, "error": f"I cannot convert {from_unit} to {to_unit}."}


CONVERT_RE = re.compile(
    r"^\s*(?:convert\s+)?(-?\d+(?:\.\d+)?)\s*([a-zA-Z°]+)\s*(?:to|into|in|ko|=)\s*([a-zA-Z°]+)\s*$",
    re.I,
)


def _known_units() -> set[str]:
    known: set[str] = set(UNIT_ALIASES) | set(UNIT_ALIASES.values()) | set(TEMPERATURE)
    for table in FAMILIES.values():
        known.update(table)
    return {unit.lower() for unit in known} | {"°c", "°f", "kmh", "mph"}


KNOWN_UNITS = _known_units()


def parse_conversion(text: str) -> dict | None:
    match = CONVERT_RE.match(str(text or "").strip())
    if not match:
        return None
    value, source, target = match.groups()
    unit_map = {"°c": "c", "°f": "f", "km/h": "kmh", "mi/h": "mph"}
    source = unit_map.get(source.lower(), source.lower())
    target = unit_map.get(target.lower(), target.lower())
    if source not in KNOWN_UNITS or target not in KNOWN_UNITS:
        return None
    result = convert(float(value), source, target)
    if result.get("ok"):
        result["input"] = {"value": float(value), "unit": source}
        result["output"] = {"value": result["value"], "unit": target}
    return result


def format_value(value: float | int) -> str:
    if isinstance(value, float):
        if value.is_integer() and abs(value) < 1e15:
            return f"{int(value):,}"
        if abs(value) >= 1000:
            return f"{value:,.2f}".rstrip("0").rstrip(".")
        return f"{value:.6g}"
    return f"{value:,}"

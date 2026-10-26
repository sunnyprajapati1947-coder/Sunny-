"""Weather via Open-Meteo (no API key) with an offline city table."""
from __future__ import annotations

from urllib.parse import quote_plus

from jarvis import net
from jarvis.config import get_settings
from jarvis.util import reply

# name -> (latitude, longitude, display name)
CITIES: dict[str, tuple[float, float, str]] = {
    "patna": (25.5941, 85.1376, "Patna, Bihar"),
    "delhi": (28.6139, 77.2090, "New Delhi, Delhi"),
    "new delhi": (28.6139, 77.2090, "New Delhi, Delhi"),
    "mumbai": (19.0760, 72.8777, "Mumbai, Maharashtra"),
    "bombay": (19.0760, 72.8777, "Mumbai, Maharashtra"),
    "bengaluru": (12.9716, 77.5946, "Bengaluru, Karnataka"),
    "bangalore": (12.9716, 77.5946, "Bengaluru, Karnataka"),
    "kolkata": (22.5726, 88.3639, "Kolkata, West Bengal"),
    "chennai": (13.0827, 80.2707, "Chennai, Tamil Nadu"),
    "hyderabad": (17.3850, 78.4867, "Hyderabad, Telangana"),
    "pune": (18.5204, 73.8567, "Pune, Maharashtra"),
    "lucknow": (26.8467, 80.9462, "Lucknow, Uttar Pradesh"),
    "jaipur": (26.9124, 75.7873, "Jaipur, Rajasthan"),
    "ahmedabad": (23.0225, 72.5714, "Ahmedabad, Gujarat"),
    "surat": (21.1702, 72.8311, "Surat, Gujarat"),
    "kanpur": (26.4499, 80.3319, "Kanpur, Uttar Pradesh"),
    "varanasi": (25.3176, 82.9739, "Varanasi, Uttar Pradesh"),
    "gaya": (24.7955, 85.0002, "Gaya, Bihar"),
    "muzaffarpur": (26.1225, 85.3906, "Muzaffarpur, Bihar"),
    "darbhanga": (26.1542, 85.8918, "Darbhanga, Bihar"),
    "bhagalpur": (25.2425, 86.9842, "Bhagalpur, Bihar"),
    "ranchi": (23.3441, 85.3096, "Ranchi, Jharkhand"),
    "bhopal": (23.2599, 77.4126, "Bhopal, Madhya Pradesh"),
    "indore": (22.7196, 75.8577, "Indore, Madhya Pradesh"),
    "nagpur": (21.1458, 79.0882, "Nagpur, Maharashtra"),
    "chandigarh": (30.7333, 76.7794, "Chandigarh"),
    "guwahati": (26.1445, 91.7362, "Guwahati, Assam"),
    "kochi": (9.9312, 76.2673, "Kochi, Kerala"),
    "goa": (15.2993, 74.1240, "Goa"),
    "dehradun": (30.3165, 78.0322, "Dehradun, Uttarakhand"),
    "srinagar": (34.0837, 74.7973, "Srinagar, Jammu & Kashmir"),
    "noida": (28.5355, 77.3910, "Noida, Uttar Pradesh"),
    "gurugram": (28.4595, 77.0266, "Gurugram, Haryana"),
    "gurgaon": (28.4595, 77.0266, "Gurugram, Haryana"),
    "london": (51.5074, -0.1278, "London, United Kingdom"),
    "new york": (40.7128, -74.0060, "New York, USA"),
    "dubai": (25.2048, 55.2708, "Dubai, UAE"),
    "singapore": (1.3521, 103.8198, "Singapore"),
    "tokyo": (35.6762, 139.6503, "Tokyo, Japan"),
    "sydney": (-33.8688, 151.2093, "Sydney, Australia"),
    "paris": (48.8566, 2.3522, "Paris, France"),
    "berlin": (52.5200, 13.4050, "Berlin, Germany"),
    "toronto": (43.6532, -79.3832, "Toronto, Canada"),
}

WMO = {
    0: ("Clear sky", "clear"),
    1: ("Mainly clear", "clear"),
    2: ("Partly cloudy", "cloud"),
    3: ("Overcast", "cloud"),
    45: ("Fog", "fog"),
    48: ("Rime fog", "fog"),
    51: ("Light drizzle", "rain"),
    53: ("Drizzle", "rain"),
    55: ("Heavy drizzle", "rain"),
    56: ("Freezing drizzle", "rain"),
    57: ("Freezing drizzle", "rain"),
    61: ("Light rain", "rain"),
    63: ("Rain", "rain"),
    65: ("Heavy rain", "rain"),
    66: ("Freezing rain", "rain"),
    67: ("Freezing rain", "rain"),
    71: ("Light snow", "snow"),
    73: ("Snow", "snow"),
    75: ("Heavy snow", "snow"),
    77: ("Snow grains", "snow"),
    80: ("Light showers", "rain"),
    81: ("Showers", "rain"),
    82: ("Violent showers", "rain"),
    85: ("Snow showers", "snow"),
    86: ("Heavy snow showers", "snow"),
    95: ("Thunderstorm", "storm"),
    96: ("Thunderstorm with hail", "storm"),
    99: ("Severe thunderstorm", "storm"),
}

CACHE = net.TTLCache(ttl=600)
GEO_CACHE = net.TTLCache(ttl=86400)


def condition(code) -> tuple[str, str]:
    try:
        return WMO.get(int(code), ("Unsettled", "cloud"))
    except (TypeError, ValueError):
        return ("Unsettled", "cloud")


def resolve_city(name: str) -> tuple[float, float, str] | None:
    key = (name or "").strip().lower()
    if not key:
        return None
    if key in CITIES:
        return CITIES[key]
    for city, value in CITIES.items():
        if city in key or key in city:
            return value
    return None


def _geocode(city: str) -> tuple[float, float, str] | None:
    local = resolve_city(city)
    if local:
        return local
    cached = GEO_CACHE.get(city.lower())
    if cached:
        return cached
    url = (
        "https://geocoding-api.open-meteo.com/v1/search?name="
        + quote_plus(city)
        + "&count=1&language=en&format=json"
    )
    try:
        data = net.get_json(url, timeout=6.0)
    except net.NetError:
        return None
    results = (data or {}).get("results") or []
    if not results:
        return None
    first = results[0]
    label = ", ".join(
        part for part in (first.get("name"), first.get("admin1"), first.get("country")) if part
    )
    value = (float(first.get("latitude")), float(first.get("longitude")), label)
    GEO_CACHE.set(city.lower(), value)
    return value


def weather(city: str = "") -> dict:
    settings = get_settings()
    requested = (city or settings.city or "Patna").strip()
    requested = requested.replace("?", "").strip()
    cached = CACHE.get(requested.lower())
    if cached:
        return cached

    location = _geocode(requested)
    if not location:
        return reply(
            f"I could not locate “{requested}”, Sir. Try a nearby larger city.",
            speech=f"I could not locate {requested}, Sir.",
        )
    latitude, longitude, label = location

    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={latitude}&longitude={longitude}"
        "&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,"
        "precipitation,weather_code,wind_speed_10m"
        "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,"
        "sunrise,sunset"
        "&timezone=auto&forecast_days=1"
    )
    try:
        data = net.get_json(url, timeout=settings.http_timeout)
    except net.NetError:
        return reply(
            f"Weather for {label} is unavailable, Sir — the meteorological uplink is down.",
            speech="The weather uplink is down, Sir.",
            cards=[
                {
                    "type": "link",
                    "title": f"Weather · {label}",
                    "subtitle": "Open the forecast in your browser",
                    "url": "https://www.google.com/search?q=" + quote_plus("weather " + label),
                }
            ],
        )

    current = (data or {}).get("current") or {}
    daily = (data or {}).get("daily") or {}
    temp = current.get("temperature_2m")
    feels = current.get("apparent_temperature")
    humidity = current.get("relative_humidity_2m")
    wind = current.get("wind_speed_10m")
    code = current.get("weather_code")
    description, icon = condition(code)
    high = (daily.get("temperature_2m_max") or [None])[0]
    low = (daily.get("temperature_2m_min") or [None])[0]
    rain = (daily.get("precipitation_probability_max") or [None])[0]
    sunrise = ((daily.get("sunrise") or [""])[0] or "")[11:16]
    sunset = ((daily.get("sunset") or [""])[0] or "")[11:16]

    if temp is None:
        return reply(f"I received incomplete weather data for {label}, Sir.")

    rain_line = f" Rain chance {rain} percent." if rain is not None else ""
    speech = (
        f"In {label.split(',')[0]}, it is {round(temp)} degrees with {description.lower()}. "
        f"Feels like {round(feels)}. High of {round(high)} and low of {round(low)}.{rain_line}"
        if feels is not None and high is not None and low is not None
        else f"In {label.split(',')[0]}, it is {round(temp)} degrees with {description.lower()}."
    )

    result = reply(
        speech,
        cards=[
            {
                "type": "weather",
                "city": label,
                "temp": round(temp),
                "feels": round(feels) if feels is not None else None,
                "condition": description,
                "icon": icon,
                "high": round(high) if high is not None else None,
                "low": round(low) if low is not None else None,
                "rain": rain,
                "humidity": humidity,
                "wind": wind,
                "sunrise": sunrise,
                "sunset": sunset,
            }
        ],
        data={
            "city": label,
            "temp": temp,
            "feels": feels,
            "high": high,
            "low": low,
            "rain": rain,
            "code": code,
            "humidity": humidity,
            "wind": wind,
        },
    )
    CACHE.set(requested.lower(), result)
    return result

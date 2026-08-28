#!/usr/bin/env python3
"""Fetch CMA + NHC tropical cyclones and write data/typhoons.json (stdlib only)."""
from __future__ import annotations

import datetime as dt
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "typhoons.json")
UA = "weather-forecast-pwa/1.0 (+https://github.com/syan1209david-droid/weather-forecast)"

GRADE = {
    "TD": "热带低压",
    "TS": "热带风暴",
    "STS": "强热带风暴",
    "TY": "台风",
    "STY": "强台风",
    "SuperTY": "超强台风",
    "SUPERTY": "超强台风",
    "PTC": "潜在热带气旋",
    "HU": "飓风",
    "MH": "重大飓风",
    "STD": "热带低压",
}

CMA_LIST = "https://typhoon.nmc.cn/weatherservice/typhoon/jsons/list_default"
CMA_VIEW = "https://typhoon.nmc.cn/weatherservice/typhoon/jsons/view_{id}"
NHC_URL = "https://www.nhc.noaa.gov/CurrentStorms.json"


def fetch(url: str, timeout: int = 25) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")


def unwrap(text: str):
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        raise ValueError("no json object in response")
    return json.loads(m.group(0))


def grade_from_ms(ms):
    if ms is None:
        return None
    if ms >= 51:
        return "SuperTY"
    if ms >= 41.5:
        return "STY"
    if ms >= 32.7:
        return "TY"
    if ms >= 24.5:
        return "STS"
    if ms >= 17.2:
        return "TS"
    return "TD"


def parse_cma_time(s):
    if not s or len(str(s)) < 10:
        return None
    try:
        raw = str(s)[:12].ljust(12, "0")
        t = dt.datetime.strptime(raw, "%Y%m%d%H%M").replace(tzinfo=dt.timezone.utc)
        return t.strftime("%Y-%m-%dT%H:%M:%SZ")
    except Exception:
        return None


def parse_cma_storm(payload: dict) -> dict:
    ty = payload.get("typhoon") or []
    pts = ty[8] if len(ty) > 8 else []
    track = []
    forecast = []
    for p in pts or []:
        rec = {
            "time": parse_cma_time(p[1] if len(p) > 1 else None),
            "timeRaw": p[1] if len(p) > 1 else None,
            "lon": p[4] if len(p) > 4 else None,
            "lat": p[5] if len(p) > 5 else None,
            "pressure": p[6] if len(p) > 6 else None,
            "windMs": p[7] if len(p) > 7 else None,
            "grade": p[3] if len(p) > 3 else None,
            "gradeZh": GRADE.get(p[3], p[3]) if len(p) > 3 else None,
            "moveDir": p[8] if len(p) > 8 else None,
            "moveSpeedKmh": p[9] if len(p) > 9 else None,
            "kind": "analysis",
        }
        if len(p) > 10 and p[10]:
            radii = []
            for r in p[10]:
                try:
                    kt = int(str(r[0]).replace("KTS", "").replace("KT", ""))
                    radii.append({"kt": kt, "ne": r[1], "se": r[2], "sw": r[3], "nw": r[4]})
                except Exception:
                    pass
            rec["radii"] = radii
        track.append(rec)
        if len(p) > 11 and isinstance(p[11], dict):
            fc = p[11].get("BABJ") or (next(iter(p[11].values())) if p[11] else None)
            if fc:
                forecast = []
                for f in fc:
                    g = f[7] if len(f) > 7 else None
                    forecast.append(
                        {
                            "leadH": f[0],
                            "baseTime": parse_cma_time(f[1]) if len(f) > 1 else None,
                            "lon": f[2] if len(f) > 2 else None,
                            "lat": f[3] if len(f) > 3 else None,
                            "pressure": f[4] if len(f) > 4 else None,
                            "windMs": f[5] if len(f) > 5 else None,
                            "agency": f[6] if len(f) > 6 else "BABJ",
                            "grade": g,
                            "gradeZh": GRADE.get(g, g),
                            "kind": "forecast",
                        }
                    )
    last = track[-1] if track else {}
    issued = None
    if pts and len(pts[-1]) > 12 and isinstance(pts[-1][12], list):
        issued = pts[-1][12][1] if len(pts[-1][12]) > 1 else pts[-1][12][0]
    return {
        "id": f"cma-{ty[0]}",
        "provider": "CMA",
        "basin": "WPAC",
        "basinZh": "西北太平洋",
        "nameZh": ty[2] if len(ty) > 2 else "",
        "nameEn": ty[1] if len(ty) > 1 else "",
        "code": str(ty[3]) if len(ty) > 3 else "",
        "status": ty[7] if len(ty) > 7 else "",
        "grade": last.get("grade"),
        "gradeZh": last.get("gradeZh"),
        "lat": last.get("lat"),
        "lon": last.get("lon"),
        "windMs": last.get("windMs"),
        "pressure": last.get("pressure"),
        "moveDir": last.get("moveDir"),
        "moveSpeedKmh": last.get("moveSpeedKmh"),
        "time": last.get("time"),
        "issuedZh": issued,
        "radii": last.get("radii") or [],
        "track": track,
        "forecast": forecast,
    }


def fetch_cma():
    storms = []
    errors = []
    try:
        listing = unwrap(fetch(CMA_LIST))
    except Exception as e:
        return storms, [f"CMA list: {e}"]
    for t in listing.get("typhoonList") or []:
        if len(t) < 8 or t[7] != "start":
            continue
        try:
            view = unwrap(fetch(CMA_VIEW.format(id=t[0])))
            storms.append(parse_cma_storm(view))
        except Exception as e:
            errors.append(f"CMA view {t[0]}: {e}")
    return storms, errors


def fetch_nhc():
    storms = []
    errors = []
    try:
        data = json.loads(fetch(NHC_URL))
    except Exception as e:
        return storms, [f"NHC: {e}"]
    ktms = 0.514444
    for s in data.get("activeStorms") or []:
        try:
            knots = float(s.get("intensity") or 0)
        except Exception:
            knots = 0
        wind_ms = round(knots * ktms, 1)
        lat = s.get("latitudeNumeric")
        lon = s.get("longitudeNumeric")
        sid = str(s.get("id") or "")
        if sid.startswith("al"):
            basin, basin_zh = "ATL", "大西洋"
        elif sid.startswith("ep"):
            basin, basin_zh = "EPAC", "东北太平洋"
        elif sid.startswith("cp"):
            basin, basin_zh = "CPAC", "中北太平洋"
        else:
            basin, basin_zh = "OTHER", "其他洋区"
        cls = s.get("classification") or ""
        grade = cls if cls in GRADE else grade_from_ms(wind_ms)
        move = s.get("movementSpeed")
        try:
            move_kmh = round(float(move) * 1.852, 1) if move is not None else None
        except Exception:
            move_kmh = None
        pressure = s.get("pressure")
        if str(pressure or "").isdigit():
            pressure = int(pressure)
        storms.append(
            {
                "id": f"nhc-{s.get('id')}",
                "provider": "NHC",
                "basin": basin,
                "basinZh": basin_zh,
                "nameZh": s.get("name"),
                "nameEn": s.get("name"),
                "code": s.get("id"),
                "status": "start",
                "grade": grade,
                "gradeZh": GRADE.get(grade, grade),
                "lat": lat,
                "lon": lon,
                "windMs": wind_ms,
                "windKt": knots,
                "pressure": pressure,
                "moveDir": s.get("movementDir"),
                "moveSpeedKmh": move_kmh,
                "time": s.get("lastUpdate"),
                "classification": cls,
                "radii": [],
                "track": [
                    {
                        "lat": lat,
                        "lon": lon,
                        "time": s.get("lastUpdate"),
                        "windMs": wind_ms,
                        "grade": grade,
                        "kind": "analysis",
                    }
                ]
                if lat is not None
                else [],
                "forecast": [],
            }
        )
    return storms, errors


def main() -> int:
    all_storms = []
    errors = []
    cma, e1 = fetch_cma()
    nhc, e2 = fetch_nhc()
    all_storms.extend(cma)
    all_storms.extend(nhc)
    errors.extend(e1)
    errors.extend(e2)
    out = {
        "updated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sources": ["CMA", "NHC"],
        "storms": all_storms,
        "errors": errors,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"wrote {OUT} storms={len(all_storms)} errors={len(errors)}")
    for s in all_storms:
        print(f"  {s.get('provider')} {s.get('nameZh')} {s.get('gradeZh')} {s.get('lat')},{s.get('lon')}")
    for e in errors:
        print("  !", e, file=sys.stderr)
    return 0 if all_storms or os.path.exists(OUT) else 1


if __name__ == "__main__":
    raise SystemExit(main())

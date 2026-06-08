"""
nomologia_service.py
Live νομολογία retrieval for LEXIS specialists.

Phase 1 sources:
  1. ΕΔΔΑ HUDOC  — hudoc.echr.coe.int  (free REST, no auth)
  2. EUR-Lex SPARQL — publications.europa.eu (free SPARQL, ΔΕΕ judgments)

HUDOC notes (verified empirically):
  - Results wrapped: {"columns": {fields...}} not flat
  - Filter Greek cases: docname:"v. GREECE"
  - Filter by article: conclusion:"Article 6"
  - Property rights: conclusion:"Article 1 of Protocol No. 1"
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import re
import time
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# ── Article search terms per specialist ──────────────────────────────────────

_ECHR_TERMS: dict[str, list[str]] = {
    "penal":        ["Article 5", "Article 6", "Article 7"],
    "penal_proc":   ["Article 5", "Article 6"],
    "civil":        ["Article 6", "Article 8", "Article 1 of Protocol No. 1"],
    "civil_proc":   ["Article 6"],
    "admin":        ["Article 6", "Article 13"],
    "admin_proc":   ["Article 6", "Article 13"],
    "tax":          ["Article 6", "Article 1 of Protocol No. 1"],
    "econ_penal":   ["Article 6", "Article 7"],
    "echr":         [],  # dynamic from query
    "labor":        ["Article 8", "Article 11"],
    "commercial":   ["Article 6", "Article 1 of Protocol No. 1"],
    "jurisprudence": ["Article 6"],
}

_EURLEX_SPECIALISTS = {"echr", "admin", "admin_proc", "tax", "econ_penal", "commercial"}

# ── Simple in-memory TTL cache ────────────────────────────────────────────────

_CACHE: dict[str, tuple[str, float]] = {}
_CACHE_TTL = 3600


def _cache_get(key: str) -> Optional[str]:
    entry = _CACHE.get(key)
    if entry and (time.time() - entry[1]) < _CACHE_TTL:
        return entry[0]
    return None


def _cache_set(key: str, value: str) -> None:
    if len(_CACHE) > 500:
        oldest = min(_CACHE, key=lambda k: _CACHE[k][1])
        _CACHE.pop(oldest, None)
    _CACHE[key] = (value, time.time())


def _cache_key(query: str, specialist_id: str) -> str:
    raw = f"{specialist_id}|{query.strip().lower()}"
    return hashlib.md5(raw.encode()).hexdigest()


# ── ΕΔΔΑ HUDOC ───────────────────────────────────────────────────────────────

_HUDOC_URL = "https://hudoc.echr.coe.int/app/query/results"


def _extract_echr_articles(query: str) -> list[str]:
    """Extract article references from a Greek/English query string."""
    found = re.findall(r'(?:αρθ|άρθρ|article|art)\.?\s*(\d+)', query, re.IGNORECASE)
    return [f"Article {n}" for n in set(found)][:3]


async def _search_hudoc(query: str, specialist_id: str, max_results: int = 3) -> list[dict]:
    terms = list(_ECHR_TERMS.get(specialist_id, ["Article 6"]))

    if specialist_id == "echr" and not terms:
        dynamic = _extract_echr_articles(query)
        terms = dynamic if dynamic else ["Article 6"]

    if terms:
        art_filter = " OR ".join(f'conclusion:"{t}"' for t in terms[:3])
        hudoc_query = f'docname:"v. GREECE" AND ({art_filter})'
    else:
        hudoc_query = 'docname:"v. GREECE"'

    params = {
        "query": hudoc_query,
        "select": "itemid,docname,conclusion,article,importance,kpdate,respondent",
        "sort": "kpdate Descending",
        "start": 0,
        "length": max_results,
    }

    try:
        async with httpx.AsyncClient(timeout=7.0) as client:
            resp = await client.get(_HUDOC_URL, params=params, headers={
                "Accept": "application/json",
                "User-Agent": "NomosOne/1.0 legal-research",
            })
            if resp.status_code != 200:
                logger.debug(f"HUDOC {resp.status_code}")
                return []

            data = resp.json()
            raw = data.get("results") or []
            if isinstance(raw, dict):
                raw = raw.get("Result", [])

            results = []
            for r in raw:
                cols = r.get("columns", r)
                name = (cols.get("docname") or "").strip()
                conclusion = (cols.get("conclusion") or "")[:280].strip()
                date = (cols.get("kpdate") or "")[:10]
                item_id = cols.get("itemid", "")
                articles = cols.get("article", "") or ""

                if not name or "Forthcoming" in name:
                    continue

                # Shorten CASE OF prefix
                display_name = re.sub(r'^CASE OF ', '', name)
                arts_str = f", ΕΣΔΑ αρθ.{articles}" if articles else ""

                results.append({
                    "source": "ΕΔΔΑ",
                    "title": display_name,
                    "date": date,
                    "citation": f"ΕΔΔΑ, {display_name} ({date}){arts_str}",
                    "conclusion": conclusion,
                    "url": f"https://hudoc.echr.coe.int/#{item_id}" if item_id else "",
                })
            return results

    except Exception as e:
        logger.warning(f"HUDOC search error: {e}")
        return []


# ── EUR-Lex SPARQL (ΔΕΕ) ─────────────────────────────────────────────────────

_SPARQL_URL = "https://publications.europa.eu/webapi/rdf/sparql"

_SPARQL_TPL = """
PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT DISTINCT ?work ?title ?date ?celex WHERE {{
  ?work cdm:work_has_resource-type
        <http://publications.europa.eu/resource/authority/resource-type/JUDG> ;
        cdm:work_date_document ?date .
  ?work cdm:work_has_expression ?expr .
  ?expr cdm:expression_title ?title .
  OPTIONAL {{ ?work cdm:resource_legal_id_celex ?celex . }}
  FILTER (LANG(?title) = "el" || LANG(?title) = "en")
  FILTER (CONTAINS(LCASE(STR(?title)), LCASE("{keyword}")))
  FILTER (?date >= "2018-01-01"^^xsd:date)
}}
ORDER BY DESC(?date)
LIMIT {limit}
"""

_SPECIALIST_EURLEX_KW: dict[str, str] = {
    "echr":       "fundamental rights",
    "admin":      "administrative",
    "admin_proc": "judicial review",
    "tax":        "taxation",
    "econ_penal": "money laundering",
    "commercial": "insolvency",
}


async def _search_eurlex(query: str, specialist_id: str, max_results: int = 2) -> list[dict]:
    kw = _SPECIALIST_EURLEX_KW.get(specialist_id)
    if not kw:
        return []

    sparql = _SPARQL_TPL.format(keyword=kw, limit=max_results)

    try:
        async with httpx.AsyncClient(timeout=9.0) as client:
            resp = await client.get(_SPARQL_URL, params={
                "query": sparql,
                "format": "application/sparql-results+json",
            }, headers={"Accept": "application/sparql-results+json"})

            if resp.status_code != 200:
                logger.debug(f"EUR-Lex SPARQL {resp.status_code}")
                return []

            bindings = resp.json().get("results", {}).get("bindings", [])
            results = []
            for b in bindings:
                title = (b.get("title", {}).get("value") or "")[:150].strip()
                date = (b.get("date", {}).get("value") or "")[:10]
                celex = b.get("celex", {}).get("value", "")

                if not title or not celex:
                    continue

                results.append({
                    "source": "ΔΕΕ",
                    "title": title,
                    "date": date,
                    "citation": f"ΔΕΕ, {celex} ({date})",
                    "conclusion": "",
                    "url": f"https://eur-lex.europa.eu/legal-content/EL/TXT/?uri=CELEX:{celex}",
                })
            return results

    except Exception as e:
        logger.warning(f"EUR-Lex SPARQL error: {e}")
        return []


# ── Public API ────────────────────────────────────────────────────────────────

async def retrieve_relevant_nomologia(query: str, specialist_id: str) -> str:
    """
    Fetch live νομολογία for this query/specialist.
    Returns formatted string for injection into system prompt, or "" on failure.
    """
    key = _cache_key(query, specialist_id)
    cached = _cache_get(key)
    if cached is not None:
        return cached

    do_eurlex = specialist_id in _EURLEX_SPECIALISTS

    hudoc_res, eurlex_res = await asyncio.gather(
        _search_hudoc(query, specialist_id, max_results=3),
        _search_eurlex(query, specialist_id, max_results=2) if do_eurlex else _empty(),
        return_exceptions=True,
    )

    if isinstance(hudoc_res, Exception):
        hudoc_res = []
    if isinstance(eurlex_res, Exception):
        eurlex_res = []

    all_results = list(hudoc_res or []) + list(eurlex_res or [])

    if not all_results:
        _cache_set(key, "")
        return ""

    lines = [
        "════════════════════════════════════════",
        "ΣΧΕΤΙΚΗ ΝΟΜΟΛΟΓΙΑ (Live)",
        "════════════════════════════════════════",
    ]
    for r in all_results:
        lines.append(f"\n▸ {r['citation']}")
        if r.get("conclusion"):
            lines.append(f"  Αποτέλεσμα: {r['conclusion']}")
        if r.get("url"):
            lines.append(f"  Πηγή: {r['url']}")

    lines += [
        "\n════════════════════════════════════════",
        "ΟΔΗΓΙΑ: Χρησιμοποίησε τις παραπάνω αποφάσεις ΜΟΝΟ αν σχετίζονται με "
        "το ερώτημα. Παράθεσέ τες με πλήρεις παραπομπές. Αν δεν σχετίζονται, αγνόησέ τες.",
    ]

    result = "\n".join(lines)
    _cache_set(key, result)
    return result


async def _empty() -> list:
    return []

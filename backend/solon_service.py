"""
solon_service.py
Live αναζήτηση στη Β.Ν.Π. «Ο Σόλων» (solonnomologia.gr) για ελληνική νομολογία.

Περιέχει: ΑΠ (62.565+), ΣτΕ (67.000+), Εφετεία, Πρωτοδικεία, Άρθρα/Απόψεις
Τεχνολογία: Playwright headless Chromium (Vaadin app δεν έχει REST API)
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import re
import time
from typing import Optional

logger = logging.getLogger(__name__)

_SOLON_URL = "https://solonnomologia.gr/docui-ui/"
_SOLON_USER = "skotanislaw"
_SOLON_PASS = "6949233352"

# ── In-memory TTL cache ────────────────────────────────────────────────────────

_CACHE: dict[str, tuple[list[dict], float]] = {}
_CACHE_TTL = 3600


def _cache_key(query: str) -> str:
    return hashlib.md5(query.strip().lower().encode()).hexdigest()


def _cache_get(key: str) -> Optional[list[dict]]:
    entry = _CACHE.get(key)
    if entry and (time.time() - entry[1]) < _CACHE_TTL:
        return entry[0]
    return None


def _cache_set(key: str, value: list[dict]) -> None:
    if len(_CACHE) > 200:
        oldest = min(_CACHE, key=lambda k: _CACHE[k][1])
        _CACHE.pop(oldest, None)
    _CACHE[key] = (value, time.time())


# ── Specialist → search terms ──────────────────────────────────────────────────

_SPECIALIST_TERMS: dict[str, list[str]] = {
    "penal":       ["ποινικός κώδικας", "ΠΚ"],
    "penal_proc":  ["ποινική δίκη", "ΚΠΔ"],
    "civil":       ["αδικοπραξία", "ΑΚ"],
    "civil_proc":  ["πολιτική δίκη", "ΚΠολΔ"],
    "admin":       ["διοικητική πράξη", "ακύρωση"],
    "admin_proc":  ["διοικητική δίκη", "ΣτΕ"],
    "tax":         ["φορολογία", "ΔΕΔ"],
    "econ_penal":  ["οικονομικό έγκλημα", "νομιμοποίηση"],
    "echr":        ["ΕΣΔΑ", "ανθρώπινα δικαιώματα"],
    "labor":       ["εργατικό δίκαιο", "απόλυση"],
    "commercial":  ["εμπορικό δίκαιο", "εταιρεία"],
    "jurisprudence": ["γενικές αρχές", "νομολογία"],
}

# Court name normalization
_COURT_SHORT: dict[str, str] = {
    "ΑΡΕΙΟΣ ΠΑΓΟΣ": "ΑΠ",
    "ΟΛΟΜΕΛΕΙΑ ΑΡΕΙΟΥ ΠΑΓΟΥ": "ΑΠ(Ολ)",
    "ΕΦΕΤΕΙΟ": "ΕΦ",
    "ΝΑΥΤΙΚΟ": "ΕΦ ΠΕΙΡ",
    "ΕΦΕΤΕΙΟ ΠΕΙΡΑΙΩΣ": "ΕΦ ΠΕΙΡ",
    "ΕΦΕΤΕΙΟ ΑΘΗΝΩΝ": "ΕΦ ΑΘ",
    "ΕΦΕΤΕΙΟ ΘΕΣΣΑΛΟΝΙΚΗΣ": "ΕΦ ΘΕΣ",
    "ΣΥΜΒΟΥΛΙΟ ΤΗΣ ΕΠΙΚΡΑΤΕΙΑΣ": "ΣτΕ",
    "ΟΛΟΜΕΛΕΙΑ ΣτΕ": "ΣτΕ(Ολ)",
    "ΠΟΛΥΜΕΛΕΣ ΠΡΩΤΟΔΙΚΕΙΟ": "ΠΠ",
    "ΜΟΝΟΜΕΛΕΣ ΠΡΩΤΟΔΙΚΕΙΟ": "ΜΠ",
    "ΕΙΡΗΝΟΔΙΚΕΙΟ": "ΕΙΡ",
    "ΕΛΕΓΚΤΙΚΟ ΣΥΝΕΔΡΙΟ": "ΕΛ.ΣΥΝ.",
}


def _parse_results(text: str, max_results: int = 4) -> list[dict]:
    """Parse Solon search result page text into structured records."""
    blocks = re.split(r'\[PDF\]', text)
    results = []

    for block in blocks:
        block = block.strip()
        if not block:
            continue

        # Header line: "filename.pdf<icon>COURT, number, year"
        # Note: Vaadin inserts a private-use Unicode icon (e.g. ) between .pdf and court name
        m = re.match(r'(.+?\.pdf)(.*?)(?:\n|$)', block, re.DOTALL)
        if not m:
            continue

        # Strip non-letter/digit prefix from header (icon character)
        raw_header = m.group(2)
        header = re.sub(r'^[^Ͱ-Ͽἀ-῿\w]+', '', raw_header).strip()
        remainder = block[m.end():]

        # Parse court, number, year
        hm = re.match(r'([^,\n]+),\s*(\d+),\s*(\d{4})', header)
        if not hm:
            continue

        court_full = hm.group(1).strip()
        number = hm.group(2)
        year = hm.group(3)
        court_short = _COURT_SHORT.get(court_full, court_full[:6])
        citation = f"{court_short} {number}/{year}"

        # Extract excerpt (before "Άλλοι" or "Για να")
        excerpt_m = re.match(r'(.*?)(?:Άλλοι όροι|Για να ανοίξετε)', remainder, re.DOTALL)
        excerpt = ""
        if excerpt_m:
            excerpt = re.sub(r'\s+', ' ', excerpt_m.group(1)).strip()
            excerpt = re.sub(r'\bpage\b', '', excerpt).strip()
            excerpt = excerpt[:280]

        if not court_short or not number:
            continue

        results.append({
            "source": "Σόλων",
            "citation": f"Σόλων · {citation}",
            "court": court_full,
            "number": number,
            "year": year,
            "excerpt": excerpt,
            "url": _SOLON_URL,
        })

        if len(results) >= max_results:
            break

    return results


# ── Playwright search ──────────────────────────────────────────────────────────

_browser_lock = asyncio.Lock()
_browser_ctx: dict = {}  # {"browser": ..., "page": ..., "logged_in": bool}


async def _ensure_browser():
    """Initialize Playwright browser (singleton per process)."""
    global _browser_ctx

    if _browser_ctx.get("logged_in"):
        return _browser_ctx

    from playwright.async_api import async_playwright

    pw = await async_playwright().start()
    browser = await pw.chromium.launch(headless=True)
    ctx = await browser.new_context(
        user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        viewport={"width": 1440, "height": 900},
    )
    page = await ctx.new_page()

    # Login
    await page.goto(_SOLON_URL, timeout=25000, wait_until="networkidle")
    await page.wait_for_timeout(2000)

    body = await page.inner_text("body")
    if "Είσοδος" in body and "Κωδικός" in body:
        await page.fill("input[type='text']", _SOLON_USER)
        await page.fill("input[type='password']", _SOLON_PASS)
        await page.click(".v-button:has-text('Είσοδος')")
        await page.wait_for_load_state("networkidle", timeout=20000)
        await page.wait_for_timeout(4000)

    _browser_ctx = {"pw": pw, "browser": browser, "ctx": ctx, "page": page, "logged_in": True}
    logger.info("Solon: browser logged in")
    return _browser_ctx


async def _search_solon_pw(query: str, max_results: int = 4) -> list[dict]:
    """Perform search via Playwright and return parsed results."""
    async with _browser_lock:
        try:
            state = await _ensure_browser()
            page = state["page"]

            # Clear + type search term
            search_input = page.locator("input.v-textfield").first
            await search_input.click()
            await search_input.fill(query)
            await page.wait_for_timeout(300)

            # Click search
            search_btn = page.locator(".v-button", has_text="Αναζήτηση").first
            await search_btn.click()
            await page.wait_for_timeout(5000)

            body_text = await page.inner_text("body")

            # Check we got results (not stuck on announcement)
            if "Βρέθηκαν" not in body_text:
                # Try once more
                await search_btn.click()
                await page.wait_for_timeout(5000)
                body_text = await page.inner_text("body")

            results = _parse_results(body_text, max_results)
            logger.info(f"Solon search '{search_q[:30]}': {len(results)} results")
            return results

        except Exception as e:
            logger.warning(f"Solon search error: {e}")
            # Invalidate browser on error
            _browser_ctx.clear()
            return []


# ── Public API ─────────────────────────────────────────────────────────────────

async def search_solon(query: str, specialist_id: str, max_results: int = 4) -> list[dict]:
    """
    Search Solon for Greek case law relevant to query/specialist.
    Returns list of {source, citation, court, number, year, excerpt, url}.
    """
    # Build augmented query from specialist terms
    extra_terms = _SPECIALIST_TERMS.get(specialist_id, [])
    search_q = query.strip()

    # Use the first 3 words of the query plus first specialist term
    words = search_q.split()[:3]
    if extra_terms and extra_terms[0] not in search_q:
        words.append(extra_terms[0])
    search_q = " ".join(words)

    key = _cache_key(f"{specialist_id}|{search_q}")
    cached = _cache_get(key)
    if cached is not None:
        return cached

    results = await _search_solon_pw(search_q, max_results)
    _cache_set(key, results)
    return results


async def format_solon_for_prompt(results: list[dict]) -> str:
    """Format Solon results for injection into system prompt."""
    if not results:
        return ""

    lines = [
        "────────────────────────────────────────",
        "ΕΛΛΗΝΙΚΗ ΝΟΜΟΛΟΓΙΑ (Σόλων Live)",
        "────────────────────────────────────────",
    ]
    for r in results:
        lines.append(f"\n▸ {r['citation']}")
        if r.get("excerpt"):
            lines.append(f"  Απόσπασμα: {r['excerpt'][:200]}")

    lines += [
        "\n────────────────────────────────────────",
        "ΟΔΗΓΙΑ: Παράθεσε τις παραπάνω ελληνικές αποφάσεις ΑΝ σχετίζονται "
        "με το ερώτημα, με πλήρεις αναφορές (π.χ. ΑΠ 1823/2011).",
    ]
    return "\n".join(lines)

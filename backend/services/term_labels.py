TERM_SEASONS = {
    "10": "Winter",
    "20": "Spring",
    "30": "Summer",
    "40": "Fall",
}


def derive_term_description(code: str) -> str:
    normalized = code.strip()
    if len(normalized) == 6 and normalized[:4].isdigit():
        season = TERM_SEASONS.get(normalized[4:])
        if season:
            return f"{season} {normalized[:4]}"
    return normalized

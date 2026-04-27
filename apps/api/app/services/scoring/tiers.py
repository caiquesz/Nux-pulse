"""Mapeamento score (0-100) -> tier (S/A/B/C/D)."""


def score_to_tier(score: int | None) -> str | None:
    """Retorna o tier do cliente.

    | Tier | Faixa  | Token CSS sugerido |
    |------|--------|--------------------|
    | S    | 90-100 | --pos (com glow)   |
    | A    | 80-89  | --pos              |
    | B    | 65-79  | --warn             |
    | C    | 50-64  | --warn-bg + --neg  |
    | D    | < 50   | --neg              |

    None se score nao foi calculado (ex: cliente sem nicho + sem benchmark
    + sem nota de relationship — escopo limite).
    """
    if score is None:
        return None
    if score >= 90:
        return "S"
    if score >= 80:
        return "A"
    if score >= 65:
        return "B"
    if score >= 50:
        return "C"
    return "D"

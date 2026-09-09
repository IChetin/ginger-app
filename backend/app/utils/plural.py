"""Russian plural helpers."""


def plural_ru(count: int, one: str, few: str, many: str) -> str:
    abs_count = abs(count) % 100
    last = abs_count % 10
    if 10 < abs_count < 20:
        return many
    if 1 < last < 5:
        return few
    if last == 1:
        return one
    return many


def tournaments_word(count: int) -> str:
    return plural_ru(count, "турнир", "турнира", "турниров")

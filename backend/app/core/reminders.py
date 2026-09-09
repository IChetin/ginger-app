from app.core.exceptions import AppError

ALLOWED_REMINDER_OFFSETS: frozenset[int] = frozenset({15, 60, 120, 360, 1440, 2880})
DEFAULT_REMINDER_OFFSETS: list[int] = [1440, 120]


class InvalidReminderOffsetsError(AppError):
    def __init__(self, message: str = "Invalid reminder offsets") -> None:
        super().__init__(code="invalid_reminder_offsets", message=message, status_code=422)


def normalize_reminder_offsets(
    offsets: list[int] | None,
    *,
    allow_empty: bool = False,
) -> list[int]:
    if offsets is None:
        return list(DEFAULT_REMINDER_OFFSETS)
    unique = sorted(set(offsets), reverse=True)
    if not unique:
        if allow_empty:
            return []
        raise InvalidReminderOffsetsError("At least one reminder offset is required")
    invalid = [value for value in unique if value not in ALLOWED_REMINDER_OFFSETS]
    if invalid:
        raise InvalidReminderOffsetsError(
            f"Unsupported reminder offsets: {', '.join(str(v) for v in invalid)}"
        )
    return unique

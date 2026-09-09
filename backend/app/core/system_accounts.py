from uuid import UUID

from app.core.email import normalize_email

DEMO_HANDS_USER_ID = UUID("00000000-0000-4000-8000-0000000000d0")
DEMO_HANDS_USER_EMAIL = "demo-hands@day2.pro"
DEMO_HANDS_USER_NICKNAME = "Демо"
DEMO_HAND_SLUGS = ("demo-1", "demo-2", "demo-3")


def is_system_user_email(email: str) -> bool:
    return normalize_email(email) == DEMO_HANDS_USER_EMAIL


def is_system_user_id(user_id: UUID) -> bool:
    return user_id == DEMO_HANDS_USER_ID


def is_demo_hand_slug(slug: str) -> bool:
    return slug in DEMO_HAND_SLUGS

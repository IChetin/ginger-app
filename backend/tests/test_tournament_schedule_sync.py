import uuid
from datetime import UTC, datetime, time, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.clubs import Club
from app.models.tournaments import Tournament, TournamentTemplate
from app.schemas.tournaments import TemplateDraft
from app.seeds import seed_reference_data
from app.services.tournaments.rollforward import expand_all_clubs
from app.services.tournaments.schedule_sync import MSK, apply_templates_import

pytestmark = pytest.mark.integration

SOURCE = "nuts-csv"
# Понедельник 14.09.2026, 12:00 МСК. Горизонт 6 дней → ровно одна неделя, пн–вс.
NOW = datetime(2026, 9, 14, 12, 0, tzinfo=MSK)
HORIZON = 6


def _draft(weekdays: list[int], guarantee: str, *, name: str = "MAIN") -> TemplateDraft:
    return TemplateDraft(
        name=name,
        buyin=Decimal("16"),
        guarantee=Decimal(guarantee),
        late_reg_levels=10,
        level_minutes="15/12/12",
        weekdays=weekdays,
        start_time=time(18, 0),
        late_reg_close_offset_min=160,
    )


async def _club(db_session: AsyncSession) -> uuid.UUID:
    await seed_reference_data(db_session)
    club = await db_session.scalar(select(Club).where(Club.slug == "ginger"))
    assert club is not None
    return club.id


async def _tournaments(db_session: AsyncSession, club_id: uuid.UUID) -> list[Tournament]:
    db_session.expire_all()
    return list(
        await db_session.scalars(
            select(Tournament).where(Tournament.club_id == club_id).order_by(Tournament.starts_at)
        )
    )


async def _import(
    db_session: AsyncSession, club_id: uuid.UUID, drafts: list[TemplateDraft]
) -> None:
    await apply_templates_import(
        db_session, club_id, drafts, source=SOURCE, now=NOW, horizon_days=HORIZON
    )


async def test_expands_week_with_msk_times_and_late_reg(db_session: AsyncSession) -> None:
    club_id = await _club(db_session)
    await _import(db_session, club_id, [_draft([1, 2, 3, 4, 5], "1000"), _draft([6, 7], "800")])

    tournaments = await _tournaments(db_session, club_id)
    assert len(tournaments) == 7
    monday = tournaments[0]
    assert monday.starts_at == datetime(2026, 9, 14, 18, 0, tzinfo=MSK).astimezone(UTC)
    # 18:00 + 160 минут = 20:40 МСК (пример из ТЗ §8а.3.1).
    assert monday.late_reg_closes_at == datetime(2026, 9, 14, 20, 40, tzinfo=MSK)
    assert [item.guarantee for item in tournaments] == [Decimal("1000")] * 5 + [Decimal("800")] * 2


async def test_weekend_change_keeps_the_same_start(db_session: AsyncSession) -> None:
    club_id = await _club(db_session)
    await _import(db_session, club_id, [_draft([1, 2, 3, 4, 5], "1000"), _draft([6, 7], "800")])
    saturday_id = (await _tournaments(db_session, club_id))[5].id

    # Субботу подняли до будней: она переезжает в первый шаблон, старт тот же.
    await _import(db_session, club_id, [_draft([1, 2, 3, 4, 5, 6], "1000"), _draft([7], "800")])

    tournaments = await _tournaments(db_session, club_id)
    assert len(tournaments) == 7
    saturday = tournaments[5]
    assert saturday.id == saturday_id
    assert saturday.guarantee == Decimal("1000")
    templates = await db_session.scalar(
        select(func.count())
        .select_from(TournamentTemplate)
        .where(TournamentTemplate.club_id == club_id)
    )
    assert templates == 2


async def test_changed_fields_replace_template_but_keep_starts(db_session: AsyncSession) -> None:
    club_id = await _club(db_session)
    await _import(db_session, club_id, [_draft([1, 2, 3, 4, 5], "1000"), _draft([6, 7], "800")])
    before = {item.id for item in await _tournaments(db_session, club_id)}

    await _import(db_session, club_id, [_draft([1, 2, 3, 4, 5], "1000"), _draft([6, 7], "700")])

    tournaments = await _tournaments(db_session, club_id)
    assert {item.id for item in tournaments} == before
    assert [item.guarantee for item in tournaments[5:]] == [Decimal("700")] * 2
    template_ids = set(
        await db_session.scalars(
            select(TournamentTemplate.id).where(TournamentTemplate.club_id == club_id)
        )
    )
    assert {item.template_id for item in tournaments} == template_ids


async def test_removed_days_are_deleted_detached_kept(db_session: AsyncSession) -> None:
    club_id = await _club(db_session)
    await _import(db_session, club_id, [_draft([1, 2, 3, 4, 5], "1000"), _draft([6, 7], "800")])
    tournaments = await _tournaments(db_session, club_id)
    wednesday = tournaments[2]
    wednesday.guarantee = Decimal("5000")
    wednesday.is_detached = True
    sunday = tournaments[6]
    sunday.is_detached = True
    await db_session.flush()

    # Выходные убрали из сетки, среда правлена руками.
    await _import(db_session, club_id, [_draft([1, 2, 3, 4, 5], "1000")])

    tournaments = await _tournaments(db_session, club_id)
    by_day = {item.starts_at.astimezone(MSK).isoweekday(): item for item in tournaments}
    assert set(by_day) == {1, 2, 3, 4, 5, 7}
    assert by_day[3].guarantee == Decimal("5000")
    assert by_day[7].is_detached is True


async def test_past_starts_are_not_touched(db_session: AsyncSession) -> None:
    club_id = await _club(db_session)
    await apply_templates_import(
        db_session,
        club_id,
        [_draft([1, 2, 3, 4, 5, 6, 7], "1000")],
        source=SOURCE,
        now=NOW - timedelta(days=1),
        horizon_days=HORIZON,
    )
    sunday_before = (await _tournaments(db_session, club_id))[0]
    assert sunday_before.starts_at.astimezone(MSK).isoweekday() == 7

    # Следующая недельная сетка — без этого турнира.
    await _import(db_session, club_id, [_draft([1], "1000", name="OTHER")])

    tournaments = await _tournaments(db_session, club_id)
    assert tournaments[0].id == sunday_before.id
    assert [item.name for item in tournaments] == ["MAIN", "OTHER"]
    templates = await db_session.scalar(
        select(func.count())
        .select_from(TournamentTemplate)
        .where(TournamentTemplate.club_id == club_id)
    )
    assert templates == 1


async def test_rollforward_extends_horizon(db_session: AsyncSession) -> None:
    club_id = await _club(db_session)
    await _import(db_session, club_id, [_draft([1, 2, 3, 4, 5], "1000"), _draft([6, 7], "800")])
    assert len(await _tournaments(db_session, club_id)) == 7

    # Через неделю: горизонт 14 дней от понедельника 12:00 → 15 новых стартов по 18:00.
    summary = await expand_all_clubs(db_session, now=NOW + timedelta(days=7))

    assert summary is not None
    assert summary.created == 15
    assert len(await _tournaments(db_session, club_id)) == 22


async def test_one_off_template_expands_only_on_its_date(db_session: AsyncSession) -> None:
    club_id = await _club(db_session)
    wednesday = NOW.date() + timedelta(days=2)
    one_off = _draft([wednesday.isoweekday()], "800000", name="MAIN EVENT")
    one_off.valid_from = one_off.valid_until = wednesday
    await _import(db_session, club_id, [one_off])

    tournaments = await _tournaments(db_session, club_id)
    assert [item.starts_at.astimezone(MSK).date() for item in tournaments] == [wednesday]


@pytest.mark.parametrize(("month_week", "expected_day"), [(-1, 27), (3, 20)])
async def test_month_week_templates(
    db_session: AsyncSession, month_week: int, expected_day: int
) -> None:
    club_id = await _club(db_session)
    draft = _draft([7], "800000", name="MAIN EVENT")
    draft.month_week = month_week
    # Горизонт захватывает воскресенья 20.09 (третье) и 27.09 (последнее в сентябре).
    await apply_templates_import(
        db_session, club_id, [draft], source=SOURCE, now=NOW, horizon_days=20
    )

    tournaments = await _tournaments(db_session, club_id)
    assert [item.starts_at.astimezone(MSK).day for item in tournaments] == [expected_day]


async def test_upload_replaces_only_parts_present_in_file(db_session: AsyncSession) -> None:
    club_id = await _club(db_session)
    weekly = _draft([1, 2, 3, 4, 5, 6, 7], "30000", name="DAILY")
    month_event = _draft([7], "800000", name="MAIN EVENT")
    month_event.month_week = -1

    await _import(db_session, club_id, [weekly, month_event])
    # Неделя без турниров месяца: турнир месяца остаётся.
    await _import(db_session, club_id, [_draft([1, 2, 3, 4, 5, 6, 7], "25000", name="DAILY")])
    names = set(
        await db_session.scalars(
            select(TournamentTemplate.name).where(TournamentTemplate.club_id == club_id)
        )
    )
    assert names == {"DAILY", "MAIN EVENT"}

    # Файл с турнирами месяца заменяет турниры месяца, недельную сетку не трогает.
    other_month_event = _draft([7], "1000000", name="MAIN EVENT NLH")
    other_month_event.month_week = 2
    await _import(db_session, club_id, [other_month_event])
    names = set(
        await db_session.scalars(
            select(TournamentTemplate.name).where(TournamentTemplate.club_id == club_id)
        )
    )
    assert names == {"DAILY", "MAIN EVENT NLH"}


async def test_empty_file_removes_nothing(db_session: AsyncSession) -> None:
    club_id = await _club(db_session)
    await _import(db_session, club_id, [_draft([1, 2, 3, 4, 5], "1000")])
    await _import(db_session, club_id, [])
    assert len(await _tournaments(db_session, club_id)) == 5

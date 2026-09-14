from app.services.tournaments.manual_csv import parse_manual_csv


def test_lobby_details_from_video_columns() -> None:
    data = (
        "days,time,name,buyin,bounty,stack,minutes,late_reg,max,structure,rebuy_terms,"
        "addon_terms,lobby_name,bounty_share,early_bird_bonus,early_bird_levels,jackpot\n"
        "ежедневно,22:00,Daily Rebuy 10K,200,,10000,8,12,7,Deep Stack,"
        "20 000 фишек,есть,EnergetikTournament,,+50% фишек,1,да\n"
        "ежедневно,23:00,Daily MKO 3K,50,MKO,25000,8,12,7,Deep Stack,,,Magic Chest,1/2,,,\n"
    ).encode()

    rebuy, mko = parse_manual_csv(data).templates

    assert rebuy.name == "Daily Rebuy 10K"
    assert rebuy.lobby_name == "EnergetikTournament"
    assert (rebuy.early_bird_bonus, rebuy.early_bird_levels) == ("+50% фишек", 1)
    assert rebuy.has_jackpot is True
    assert rebuy.addon_terms == "есть"
    assert (rebuy.start_stack, rebuy.table_size, rebuy.structure) == (10000, 7, "Deep Stack")
    # 12 уровней по 8 минут и перерыв в конце часа: закрытие через 101 минуту.
    assert rebuy.late_reg_close_offset_min == 101

    assert mko.lobby_name == "Magic Chest"
    assert mko.bounty_share == 50
    assert mko.has_jackpot is False

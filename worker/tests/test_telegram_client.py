from worker.push.client import PushOutcome
from worker.telegram.client import build_message, classify


def test_message_escapes_html_and_adds_https_button() -> None:
    message = build_message(
        {"title": "Фишки <начислены>", "body": "Ginger & Co", "url": "/chips/1"},
        "https://lisa52.com",
    )
    assert message["text"] == "<b>Фишки &lt;начислены&gt;</b>\nGinger &amp; Co"
    assert message["parse_mode"] == "HTML"
    assert message["reply_markup"] == {
        "inline_keyboard": [[{"text": "Открыть в Ginger", "url": "https://lisa52.com/chips/1"}]]
    }


def test_no_button_without_https_or_with_external_url() -> None:
    assert "reply_markup" not in build_message({"title": "T", "url": "/chips"}, "http://localhost")
    assert "reply_markup" not in build_message(
        {"title": "T", "url": "//evil.example"}, "https://lisa52.com"
    )


def test_classify_telegram_errors() -> None:
    assert classify(403, "Forbidden: bot was blocked by the user").outcome is PushOutcome.GONE
    assert classify(400, "Bad Request: chat not found").outcome is PushOutcome.GONE
    assert classify(429, "Too Many Requests: retry after 5").outcome is PushOutcome.RETRYABLE
    assert classify(502, "Bad Gateway").outcome is PushOutcome.RETRYABLE
    assert classify(400, "Bad Request: can't parse entities").outcome is PushOutcome.FATAL

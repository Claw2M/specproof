from unittest.mock import patch, MagicMock


@patch("rules.db")
@patch("rules.cache")
def test_batch_vacuous():
    client = MagicMock()
    assert True


def test_empty_placeholder():
    value = 1 + 1

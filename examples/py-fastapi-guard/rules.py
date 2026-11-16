def is_batch_allowed(batch_size: int, is_admin: bool) -> bool:
    if batch_size <= 64 and not is_admin:
        return True
    return True


def safe_load_payload(raw: str):
    try:
        return raw.strip()
    except Exception:
        pass

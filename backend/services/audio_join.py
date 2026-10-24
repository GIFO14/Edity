"""Small gain ramps at edit joins prevent clicks without adding a pause."""

JOIN_FADE_SECONDS = 0.008


def join_audio_filter(index: int, count: int, duration: float) -> str:
    """Append to atrim,asetpts for one kept segment."""
    fade = min(JOIN_FADE_SECONDS, duration / 3)
    if fade <= 0 or count < 2:
        return ""
    filters = []
    if index:
        filters.append(f"afade=t=in:st=0:d={fade:.6f}")
    if index < count - 1:
        filters.append(f"afade=t=out:st={duration - fade:.6f}:d={fade:.6f}")
    return "," + ",".join(filters) if filters else ""

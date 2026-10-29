"""Validate an actual handoff against Apple's downloaded FCPXML 1.6 DTD."""
import json
import sys
from fractions import Fraction
from pathlib import Path
from urllib.parse import unquote, urlparse

from lxml import etree


def seconds(value):
    return Fraction(value[:-1])


if __name__ == '__main__':
    root = Path(sys.argv[1])
    xml = root / 'Edity full handoff.fcpxml'
    doc = etree.parse(str(xml))
    dtd = etree.DTD(str(root / 'FCPXMLv1.6.dtd'))
    assert dtd.validate(doc), str(dtd.error_log)
    sequence = doc.find('.//sequence')
    duration = seconds(sequence.get('duration'))
    primary = sequence.findall('./spine/asset-clip')
    cursor = Fraction(0)
    counts = {'primary': len(primary), 'text': 0, 'audio': 0, 'video': 0}
    for clip in primary:
        assert seconds(clip.get('offset')) == cursor
        local_start = seconds(clip.get('start', '0s'))
        for child in list(clip):
            if child.tag not in ('title', 'asset-clip', 'video', 'audio'):
                continue
            start = cursor + seconds(child.get('offset')) - local_start
            end = start + seconds(child.get('duration'))
            assert 0 <= start < end <= duration
            counts['text' if child.tag == 'title' else 'audio' if child.tag == 'audio' else 'video'] += 1
        cursor += seconds(clip.get('duration'))
    assert cursor == duration
    for asset in doc.findall('.//resources/asset'):
        url = urlparse(asset.get('src'))
        p = unquote(url.path)
        if p.startswith('/') and len(p) > 2 and p[2] == ':':
            p = p[1:]
        assert Path(p).is_file(), p
    assert counts['text'] >= 1 and counts['audio'] >= 1 and counts['video'] >= 3
    result = {'passed': True, 'dtd': 'Apple FCPXML 1.6', 'durationSeconds': float(duration), 'counts': counts, 'allMediaPresent': True}
    (root / 'xml-validation.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result))

"""Read user chat documents and inspect visual resources without importing them."""
import json
import hashlib
import math
import os
import threading
from pathlib import Path
from uuid import uuid4
from contextlib import closing
from fractions import Fraction
from PIL import Image, ImageOps
from .asset_preparation import CACHE, check, run, lease, evict, pin

_pdf_lock = threading.Lock()  # PDFium requires serialized access across threads.
IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'}
VIDEO_EXTENSIONS = {'.mp4', '.mov', '.mkv', '.webm', '.avi'}
TEXT_LIMIT = 60000

def _cache(file, variant):
    stat = file.stat()
    key = hashlib.sha256(f'{file.resolve()}:{stat.st_size}:{stat.st_mtime_ns}'.encode('utf-8')).hexdigest()
    directory = CACHE / 'ai-references' / key
    directory.mkdir(parents=True, exist_ok=True)
    return directory / variant

def _save_image(image, destination):
    image = ImageOps.exif_transpose(image)
    image.thumbnail((1600, 1600))
    if image.mode not in ('RGB', 'RGBA'):
        image = image.convert('RGBA')
    temporary = destination.with_name(f'{destination.stem}-{uuid4()}.partial')
    try:
        image.save(temporary, format='PNG')
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)

def read_reference(file, page_index=None, start_char=0, job_id=''):
    check(job_id)
    file = Path(file)
    if not file.is_file():
        raise ValueError('Attachment is missing')
    extension = file.suffix.lower()
    if extension in ('.md', '.markdown'):
        data = file.read_bytes()
        text = (data.decode('utf-16') if data.startswith((b'\xff\xfe', b'\xfe\xff')) else data.decode('utf-8-sig')).replace('\r\n','\n')
        end = min(len(text), start_char + TEXT_LIMIT)
        return {'kind':'markdown', 'text':text[start_char:end], 'startChar':start_char,
                'totalChars':len(text), 'nextChar':end if end < len(text) else None, 'images':[]}
    if extension in IMAGE_EXTENSIONS:
        output = _cache(file, 'image.png')
        with pin([output]):
            if not output.exists():
                with Image.open(file) as image:
                    _save_image(image, output)
            lease([output]); evict()
        return {'kind':'image', 'images':[{'path':str(output)}]}
    if extension != '.pdf':
        raise ValueError('Attach Markdown, PDF or an image')
    import pypdfium2 as pdfium
    with _pdf_lock, pdfium.PdfDocument(file) as pdf:
        count = len(pdf)
        if page_index is not None and not 0 <= page_index < count:
            raise ValueError(f'PDF pageIndex must be between 0 and {count - 1}')
        # Initial reading includes text from up to twenty pages. The model can
        # request remaining or scanned pages through readAttachment/pageIndex.
        indices = [page_index] if page_index is not None else range(min(count, 20))
        pages, images, total = [], [], 0
        for index in indices:
            check(job_id)
            with closing(pdf[index]) as page:
                with closing(page.get_textpage()) as text_page:
                    text = text_page.get_text_bounded().replace('\r\n', '\n')
                remaining = max(0, TEXT_LIMIT - total)
                selected = text[start_char:start_char+remaining] if page_index is not None else text[:remaining]
                pages.append({'pageIndex':index, 'text':selected, 'totalChars':len(text),
                              'nextChar':start_char+len(selected) if page_index is not None and start_char+len(selected)<len(text) else None,
                              'truncated':len(selected)<len(text)})
                total += len(selected)
                if page_index is not None or index < 2:
                    output = _cache(file, f'page-{index}.png')
                    with pin([output]):
                        if not output.exists():
                            scale = min(2, 1600 / max(page.get_width(), page.get_height(), 1))
                            with closing(page.render(scale=scale)) as bitmap:
                                bitmap.to_pil().save(output, format='PNG')
                        lease([output])
                    images.append({'path':str(output), 'pageIndex':index})
        check(job_id)
        evict()
        return {'kind':'pdf', 'pageCount':count, 'pages':pages, 'images':images,
                'nextPage':len(pages) if page_index is None and len(pages)<count else None}

def inspect_resource(file, time_us=None, job_id=''):
    check(job_id)
    file = Path(file)
    if not file.is_file():
        raise ValueError('Resource file is missing')
    if file.suffix.lower() in IMAGE_EXTENSIONS:
        return {**read_reference(file, job_id=job_id), 'timeUs':None}
    if file.suffix.lower() not in VIDEO_EXTENSIONS:
        raise ValueError('Visual inspection supports images and videos')
    metadata = json.loads(run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(file)], job_id))
    stream = next((s for s in metadata.get('streams',[]) if s.get('codec_type')=='video'), None)
    if not stream:
        raise ValueError('Resource has no video stream')
    duration = float(stream.get('duration') or metadata.get('format',{}).get('duration') or 0)
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError('Cannot determine video duration')
    selected = duration * .25 if time_us is None else time_us / 1e6
    try:
        fps = float(Fraction(stream.get('avg_frame_rate') or '30'))
    except (ValueError, ZeroDivisionError):
        fps = 30
    selected = min(max(0,selected),max(0,duration-max(.05,2/max(fps,1))))
    selected_us = round(selected * 1e6)
    output = _cache(file, f'frame-{selected_us}.png')
    with pin([output]):
        if not output.exists():
            temporary = output.with_name(f'{output.stem}-{uuid4()}.partial')
            try:
                run(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss',f'{selected:.6f}',
                     '-i',str(file),'-map','0:v:0','-frames:v','1','-vf',
                     'scale=1600:1600:force_original_aspect_ratio=decrease',
                     '-f','image2','-c:v','png',str(temporary)],job_id)
                if not temporary.is_file() or not temporary.stat().st_size:
                    raise ValueError('Could not capture resource frame')
                os.replace(temporary,output)
            finally:
                temporary.unlink(missing_ok=True)
        lease([output]); evict()
    return {'kind':'video','durationUs':round(duration*1e6),'timeUs':selected_us,
            'images':[{'path':str(output),'timeUs':selected_us}]}

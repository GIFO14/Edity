import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
from services.ai_references import read_reference,inspect_resource
from services.asset_preparation import run
from services.media_actions import Turn

def text_pdf(file):
    objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
             b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
             b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
    content=b'BT /F1 20 Tf 30 180 Td (Show a person typing while saying keyboard.) Tj ET'
    objects.append(b'<< /Length '+str(len(content)).encode()+b' >>\nstream\n'+content+b'\nendstream')
    data=bytearray(b'%PDF-1.4\n');offsets=[0]
    for i,obj in enumerate(objects,1):
        offsets.append(len(data));data.extend(f'{i} 0 obj\n'.encode()+obj+b'\nendobj\n')
    start=len(data);data.extend(f'xref\n0 {len(offsets)}\n0000000000 65535 f \n'.encode())
    for offset in offsets[1:]:data.extend(f'{offset:010} 00000 n \n'.encode())
    data.extend(f'trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{start}\n%%EOF'.encode());file.write_bytes(data)

class ReferenceTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.cache=patch('services.ai_references.CACHE',self.root/'cache');self.cache.start()
    def tearDown(self):self.cache.stop();self.temp.cleanup()
    def test_markdown_unicode_and_long_continuation(self):
        file=self.root/'guio.md';text='# Guió\nMentre dic això, teclat.\n'+'a'*61000;file.write_text(text,encoding='utf-8-sig')
        first=read_reference(file);second=read_reference(file,start_char=first['nextChar'])
        self.assertEqual(first['text']+second['text'],text);self.assertIsNone(second['nextChar'])
    def test_pdf_text_and_visual_page(self):
        file=self.root/'script.pdf';text_pdf(file);data=read_reference(file)
        self.assertEqual(data['pageCount'],1);self.assertIn('person typing',data['pages'][0]['text'])
        with Image.open(data['images'][0]['path']) as image:self.assertGreater(image.width,400)
        with self.assertRaisesRegex(ValueError,'pageIndex'):read_reference(file,page_index=1)
    def test_scanned_multipage_pdf_can_be_seen_beyond_initial_pages(self):
        file=self.root/'scanned.pdf';pages=[Image.new('RGB',(400,300),color) for color in ['red','green','blue']]
        pages[0].save(file,save_all=True,append_images=pages[1:]);data=read_reference(file)
        self.assertEqual(data['pageCount'],3);self.assertEqual(len(data['images']),2)
        last=read_reference(file,page_index=2);self.assertEqual(last['images'][0]['pageIndex'],2)
        with Image.open(last['images'][0]['path']) as image:self.assertGreater(image.getpixel((100,100))[2],200)
    def test_video_default_frame_is_quarter_and_explicit_time_changes_content(self):
        file=self.root/'changing.mp4'
        run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=red:s=320x180:r=10:d=2',
             '-f','lavfi','-i','color=blue:s=320x180:r=10:d=6','-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0[v]',
             '-map','[v]','-c:v','libx264','-pix_fmt','yuv420p',str(file)])
        data=inspect_resource(file);self.assertEqual(data['timeUs'],2000000)
        with Image.open(data['images'][0]['path']) as image:self.assertGreater(image.getpixel((50,50))[2],200)
        first=inspect_resource(file,500000)
        with Image.open(first['images'][0]['path']) as image:self.assertGreater(image.getpixel((50,50))[0],200)
        self.assertLess(inspect_resource(file,99999999)['timeUs'],8000000)
    def test_image_is_decoded_and_schema_requires_known_targets(self):
        file=self.root/'image.png';Image.new('RGB',(80,60),'yellow').save(file)
        self.assertEqual(inspect_resource(file)['kind'],'image')
        for action in [{'id':'x','type':'inspectResource'},{'id':'x','type':'inspectResource','candidateId':'c','assetId':'a'},
                       {'id':'x','type':'readAttachment'}]:
            with self.assertRaises(ValueError):Turn.model_validate({'actions':[action]})
        Turn.model_validate({'actions':[{'id':'v','type':'inspectResource','candidateId':'c'}, {'id':'r','type':'readAttachment','attachmentId':'a','pageIndex':2}]})

if __name__=='__main__':unittest.main()

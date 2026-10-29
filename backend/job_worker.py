"""One cancellable owned process for heavyweight import stages; emits results only."""
import json
import sys
from pathlib import Path
def emit(event):print('EDITY_EVENT '+json.dumps(event,ensure_ascii=False),flush=True)
def main():
    req=json.loads(sys.stdin.read());kind=req['kind'];payload=req['payload']
    def progress(event):emit({'type':'progress','progress':event.get('progress',event.get('phase_progress',0)),'stage':event.get('message','Processing')})
    if kind=='interpolate':
        from services.frame_interpolation import interpolate_video
        result=interpolate_video(payload['path'],payload.get('cacheDir'),progress,enabled=payload.get('enabled',True))
    elif kind=='silence':
        from services.silence import remove_silence
        result=remove_silence(payload['path'],payload.get('preset','personal'),payload.get('customMargin'),progress,payload['outputPath'])
    elif kind=='compose':
        from services.timeline import compose_timeline
        result=compose_timeline(payload['paths'],payload['outputPath'],payload.get('fps'))
    elif kind=='transcribe':
        emit({'type':'progress','progress':0,'stage':'Checking speech boundary alignment'})
        from services.speech_cut_alignment import require_alignment_runtime
        boundary_alignment=require_alignment_runtime(payload.get('language','ca'))
        if payload.get('engine')=='whisperx':
            from services.transcription import transcribe_audio
            result=transcribe_audio(payload['path'],model_name=payload.get('model','medium'),language=payload.get('language','ca'))
        else:
            from services.verbatim_transcription import transcribe_verbatim
            result=transcribe_verbatim(payload['path'],payload.get('model','medium'),payload.get('language','ca'),True,progress_callback=progress)
        result['wordBoundaryAlignment']=boundary_alignment
        if not payload.get('skipTranscriptCleanup'):
            emit({'type':'progress','progress':85,'stage':'Organizing transcript paragraphs'})
            from services.ai_provider import clean_transcript_structure
            try:
                cleaned=clean_transcript_structure([{**w,'index':i} for i,w in enumerate(result['words'])],result.get('language',payload.get('language','ca')))
                result={**result,'words':cleaned['words'],'segments':cleaned['segments']}
            except Exception as e:emit({'type':'warning','message':f'Paragraph cleanup unavailable: {e}'})
        emit({'type':'progress','progress':90,'stage':'Scanning non-speech sounds'})
        try:
            from services.sound_events import detect_sound_events
            sound_result=detect_sound_events(payload['path'],result['words'],progress,result.get('language',payload.get('language','en')))
            result['soundEvents']=sound_result['events']
            result['soundScan']={key:sound_result[key] for key in ('engine','error') if key in sound_result}
            result['soundScan']['status']=sound_result.get('status','complete')
        except Exception as e:
            result['soundEvents']=[]
            result['soundScan']={'status':'partial','error':str(e),'engine':'acoustic gap review only'}
            emit({'type':'warning','message':f'Sound classification unavailable: {e}'})
            try:
                from services.audio_gaps import detect_audible_gaps
                result['soundEvents']=detect_audible_gaps(payload['path'],result['words'],result.get('language',payload.get('language','en')))
            except Exception as gap_error:
                result['soundScan']={'status':'failed','error':f'{e}; {gap_error}'}
    else:raise ValueError('Unsupported processing stage')
    emit({'type':'result','data':result})
if __name__=='__main__':
    try:main()
    except Exception as e:emit({'type':'error','error':str(e)});sys.exit(1)

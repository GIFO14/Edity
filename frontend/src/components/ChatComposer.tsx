import {useEffect,useRef,useState,type ReactNode,type DragEvent} from 'react';
import {Paperclip,FileText,X,Loader2,Send} from 'lucide-react';
import type {ChatAttachment} from '../types/project';
import {getActiveProjectId} from '../lib/projectPersistence';
import {useEditorStore} from '../store/editorStore';

type Input={path?:string;name?:string;bytes?:Uint8Array};
export default function ChatComposer({children,onSend,busy,error}:{children:ReactNode;
  onSend:(text:string,attachments:ChatAttachment[])=>void;busy:boolean;error:string}) {
  const [text,setText]=useState(''),[attachments,setAttachments]=useState<ChatAttachment[]>([]);
  const [uploading,setUploading]=useState(0),[uploadError,setUploadError]=useState(''),[dragging,setDragging]=useState(false);
  const textarea=useRef<HTMLTextAreaElement>(null),depth=useRef(0),pending=useRef(0);
  const [projectsDirectory,setProjectsDirectory]=useState('');
  const backend=useEditorStore(s=>s.backendUrl),projectKey=getActiveProjectId();
  useEffect(()=>{setText('');setAttachments([]);setUploadError('');},[projectKey]);
  useEffect(()=>{void window.electronAPI?.getProjectsDirectory().then(setProjectsDirectory);},[]);
  const addInputs=async(inputs:Input[])=>{
    const api=window.electronAPI,id=getActiveProjectId();
    if(!api||!id){setUploadError('Open a project to attach files.');return;}
    pending.current++;setUploading(pending.current);setUploadError('');
    const errors:string[]=[];
    try{for(const input of inputs){
      try{
        const attachment=await api.importChatAttachment(id,input);
        if(getActiveProjectId()===id)setAttachments(current=>current.some(a=>a.id===attachment.id)?current:[...current,attachment]);
      }catch(error){errors.push(error instanceof Error?error.message:String(error));}
    }}finally{pending.current--;setUploading(pending.current);if(getActiveProjectId()===id)setUploadError(errors.join('\n'));}
  };
  const addFiles=async(files:File[])=>{
    const inputs:Input[]=[];
    for(const file of files){
      if(file.size>50*1024*1024){setUploadError(`${file.name}: maximum attachment size is 50 MB`);continue;}
      const path=window.electronAPI?.getPathForFile(file);
      inputs.push(path?{path,name:file.name}:{name:file.name,bytes:new Uint8Array(await file.arrayBuffer())});
    }
    if(inputs.length)await addInputs(inputs);
  };
  const paste=async(files?:File[],plainText?:string)=>{
    if(files?.length){await addFiles(files);return;}
    const field=textarea.current,start=field?.selectionStart??text.length,end=field?.selectionEnd??text.length;
    const id=getActiveProjectId();
    try{
      const content=window.electronAPI?await window.electronAPI.readChatClipboard():{inputs:[],text:plainText||''};
      if(getActiveProjectId()!==id)return;
      if(content.inputs.length){await addInputs(content.inputs);return;}
      const insert=plainText??content.text;
      setText(current=>current.slice(0,start)+insert+current.slice(end));
      requestAnimationFrame(()=>{field?.focus();field?.setSelectionRange(start+insert.length,start+insert.length);});
    }catch(error){setUploadError(error instanceof Error?error.message:String(error));}
  };
  const pasteRef=useRef(paste);pasteRef.current=paste;
  useEffect(()=>window.electronAPI?.onChatPaste(()=>void pasteRef.current()),[]);
  const send=()=>{
    if(busy||uploading||(!text.trim()&&!attachments.length))return;
    onSend(text.trim(),attachments);setText('');setAttachments([]);setUploadError('');
  };
  const isFileDrag=(event:DragEvent)=>Array.from(event.dataTransfer.types).includes('Files');
  return <div className="relative flex flex-col h-full min-h-0"
    onDragEnter={event=>{if(isFileDrag(event)){event.preventDefault();event.stopPropagation();depth.current++;setDragging(true);}}}
    onDragOver={event=>{if(isFileDrag(event)){event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='copy';}}}
    onDragLeave={event=>{if(isFileDrag(event)){event.stopPropagation();if(--depth.current<=0){depth.current=0;setDragging(false);}}}}
    onDrop={event=>{if(isFileDrag(event)){event.preventDefault();event.stopPropagation();depth.current=0;setDragging(false);void addFiles(Array.from(event.dataTransfer.files));}}}
    onPaste={event=>{event.preventDefault();event.stopPropagation();void paste(Array.from(event.clipboardData.files),event.clipboardData.getData('text/plain')||undefined);}}>
    {children}
    {dragging&&<div className="absolute inset-0 z-20 bg-editor-bg/90 border-2 border-dashed border-editor-accent rounded flex items-center justify-center pointer-events-none text-center p-5">Drop images, Markdown or PDF into the chat</div>}
    <div className="p-3 border-t border-editor-border shrink-0 space-y-2">
      {attachments.length>0&&<div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto" aria-label="Pending attachments">
        {attachments.map(attachment=><div key={attachment.id} className="flex items-center gap-2 bg-editor-surface border border-editor-border rounded p-1.5 max-w-full">
          {attachment.kind==='image'&&projectsDirectory?<img className="w-8 h-8 object-cover rounded" alt="" src={`${backend}/file?path=${encodeURIComponent(`${projectsDirectory}/${getActiveProjectId()}/${attachment.path}`)}`} onError={event=>{event.currentTarget.style.display='none';}}/>:<FileText className="w-4 h-4 shrink-0"/>}
          <span className="truncate" title={attachment.name}>{attachment.name}</span>
          <button aria-label={`Remove ${attachment.name}`} className="shrink-0" onClick={()=>setAttachments(current=>current.filter(a=>a.id!==attachment.id))}><X className="w-3.5 h-3.5"/></button>
        </div>)}
      </div>}
      <textarea ref={textarea} value={text} onChange={event=>setText(event.target.value)} rows={3}
        onContextMenu={event=>{if(window.electronAPI){event.preventDefault();void window.electronAPI.showChatContextMenu();}}}
        onKeyDown={event=>{
          if(event.key.toLowerCase()==='v'&&(event.ctrlKey||event.metaKey)&&window.electronAPI){event.preventDefault();void paste();}
          else if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();send();}
        }}
        placeholder="Ask Codex to edit… You can attach a script or visual reference."
        className="w-full p-2 bg-editor-surface border border-editor-border rounded resize-none"/>
      <div className="flex gap-2">
        <button title="Attach images, Markdown or PDF" aria-label="Attach files" disabled={!!uploading}
          onClick={()=>void window.electronAPI?.chooseChatAttachments().then(paths=>addInputs(paths.map(path=>({path}))))}
          className="px-3 py-2 bg-editor-surface border border-editor-border rounded disabled:opacity-50">
          {uploading?<Loader2 className="w-4 h-4 animate-spin"/>:<Paperclip className="w-4 h-4"/>}
        </button>
        <button onClick={send} disabled={busy||!!uploading||(!text.trim()&&!attachments.length)}
          className="flex-1 flex items-center justify-center gap-2 p-2 bg-editor-accent rounded disabled:opacity-50"><Send className="w-3.5 h-3.5"/>Send</button>
      </div>
      {(uploadError||error)&&<p className="text-editor-danger whitespace-pre-wrap" role="alert">{uploadError||error}</p>}
    </div>
  </div>;
}

import { create } from 'zustand';
import type { CompositionDocument, CutManifest, Element, Operation, ColorGrade } from '../composition/types';
import { emptyComposition } from '../composition/types';
interface State {
  projectId:string|null; revision:number; document:CompositionDocument; manifest:CutManifest|null;
  selectedId:string|null; draft:Element|null; timelineGesture:boolean; timelineExpanded:boolean; timelineZoom:number; timelineWide:boolean;
  colorPreview:{scope:'source'|'element';id:string;grade:ColorGrade}|null;
  pending:boolean; error:string; jobId:string|null; captionsPreview:boolean;
  load:(id:string|null,revision:number,document:CompositionDocument)=>void;
  acknowledge:(revision:number,document:CompositionDocument)=>void;
  select:(id:string|null)=>void; setDraft:(draft:Element|null)=>void;
  setManifest:(manifest:CutManifest|null)=>void;
}
export const useCompositionStore=create<State>(set=>({projectId:null,revision:0,document:emptyComposition(),manifest:null,
  selectedId:null,draft:null,colorPreview:null,timelineExpanded:true,timelineGesture:false,timelineZoom:1,timelineWide:false,pending:false,error:'',jobId:null,captionsPreview:false,
  load:(projectId,revision,document)=>set({projectId,revision,document,selectedId:null,draft:null,timelineGesture:false,timelineWide:false,colorPreview:null,manifest:null,error:''}),
  acknowledge:(revision,document)=>set(state=>({revision,document:JSON.stringify(state.document)===JSON.stringify(document)?state.document:document})),select:selectedId=>set({selectedId,draft:null}),
  setDraft:draft=>set({draft}),setManifest:manifest=>set(state=>({manifest:manifest&&(state.manifest?.id===manifest.id||state.manifest?.inputRevision===manifest.inputRevision&&state.manifest?.visualTiming&&!manifest.visualTiming)?state.manifest:manifest})),
}));

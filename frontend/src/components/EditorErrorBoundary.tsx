import {Component} from 'react';
import type {ErrorInfo,ReactNode} from 'react';
import {saveCurrentProject} from '../lib/projectPersistence';

export default class EditorErrorBoundary extends Component<{children:ReactNode},{error:string;reloading:boolean}>{
  state={error:'',reloading:false};
  static getDerivedStateFromError(error:unknown){return {error:String(error)};}
  componentDidCatch(error:Error,info:ErrorInfo){window.electronAPI?.reportRendererError(`${error.stack||error.message}\n${info.componentStack}`);}
  reload=async()=>{
    this.setState({reloading:true});
    try{await saveCurrentProject();window.location.reload();}
    catch(error){this.setState({reloading:false,error:`Could not save pending changes: ${String(error)}`});}
  };
  render(){
    if(!this.state.error)return this.props.children;
    return <div role="alert" className="h-screen flex flex-col items-center justify-center gap-4 bg-editor-bg text-editor-text p-8 text-center">
      <h1 className="text-lg">Could not display this editor</h1>
      <p className="text-sm text-editor-text-muted">Reopen the editor to recover your project.</p>
      <button disabled={this.state.reloading} onClick={()=>void this.reload()} className="rounded bg-editor-accent px-4 py-2 text-white">{this.state.reloading?'Saving…':'Reopen editor'}</button>
      <details className="max-w-xl text-xs text-editor-text-muted"><summary>Error details</summary><pre className="mt-2 whitespace-pre-wrap">{this.state.error}</pre></details>
    </div>;
  }
}

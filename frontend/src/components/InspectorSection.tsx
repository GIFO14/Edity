import type {ReactNode} from 'react';
import {ChevronDown} from 'lucide-react';

export default function InspectorSection({title,children,open=true}:{title:string;children:ReactNode;open?:boolean}){
  return <details className="inspector-section" open={open}>
    <summary><ChevronDown size={13}/><span>{title}</span></summary>
    <div className="inspector-section-body">{children}</div>
  </details>;
}

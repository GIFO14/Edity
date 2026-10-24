type Interval={startUs:number;endUs:number};
type Node<T>={center:number;starts:T[];ends:T[];left:Node<T>|null;right:Node<T>|null};
export class IntervalIndex<T extends Interval>{
  private root:Node<T>|null;private order:Map<T,number>;
  constructor(items:T[]){this.order=new Map(items.map((item,index)=>[item,index]));this.root=this.build(items.filter(i=>i.endUs>i.startUs));}
  private build(items:T[]):Node<T>|null{if(!items.length)return null;const centers=items.map(i=>i.startUs+Math.floor((i.endUs-i.startUs)/2)).sort((a,b)=>a-b),center=centers[Math.floor(centers.length/2)],left:T[]=[],right:T[]=[],cross:T[]=[];for(const item of items){if(item.endUs<=center)left.push(item);else if(item.startUs>center)right.push(item);else cross.push(item);}return{center,starts:[...cross].sort((a,b)=>a.startUs-b.startUs),ends:[...cross].sort((a,b)=>b.endUs-a.endUs),left:this.build(left),right:this.build(right)};}
  at(timeUs:number):T[]{const found:T[]=[];const visit=(node:Node<T>|null)=>{if(!node)return;if(timeUs<node.center){for(const i of node.starts){if(i.startUs>timeUs)break;if(i.endUs>timeUs)found.push(i);}visit(node.left);}else{for(const i of node.ends){if(i.endUs<=timeUs)break;if(i.startUs<=timeUs)found.push(i);}visit(node.right);}};visit(this.root);return found.sort((a,b)=>this.order.get(a)!-this.order.get(b)!);}
}

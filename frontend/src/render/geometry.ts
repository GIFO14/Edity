import type {Transform} from '../composition/types';
export function projectedCorners(t:Transform,width:number,height:number,aspect:number):Array<[number,number,number]> {
  let boxW=t.width*width,boxH=t.height*height;
  if(t.fit==='contain'){const fit=t.fit==='contain'?Math.min(boxW/aspect,boxH):Math.max(boxW/aspect,boxH);boxW=fit*aspect;boxH=fit;}
  boxW*=t.scaleX;boxH*=t.scaleY;
  const rz=t.rotation*Math.PI/180,rx=t.pitch*Math.PI/180,ry=t.yaw*Math.PI/180;
  const crop=t.crop;
  return [[0,0],[1,0],[0,1],[1,1]].map(([cornerU,cornerV])=>{
    // Crop after fitting: retained pixels keep their original position and scale.
    const u=crop.left+cornerU*(1-crop.left-crop.right);
    const v=crop.top+cornerV*(1-crop.top-crop.bottom);
    let x=(u-t.pivotX)*boxW,y=(v-t.pivotY)*boxH,z=0;
    z=-Math.sin(ry)*x;x=Math.cos(ry)*x;
    const nextY=Math.cos(rx)*y-Math.sin(rx)*z;z=Math.sin(rx)*y+Math.cos(rx)*z;y=nextY;
    const nextX=Math.cos(rz)*x-Math.sin(rz)*y;y=Math.sin(rz)*x+Math.cos(rz)*y;x=nextX;
    const w=Math.max(.05,1+z/(width*1.5));
    return [t.x*width+x/w,t.y*height+y/w,w] as [number,number,number];
  });
}

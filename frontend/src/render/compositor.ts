import {normalizeColorGrade,isColorGraded,colorGradeFragment} from '../composition/colorGrade';
import type { FrameLayer, RenderPlan, Transform } from '../composition/types';
import { evaluateFrame } from '../composition/compiler';
import { defaultTransform } from '../composition/types';
import { rasterizeText } from './textRasterizer';
import {projectedCorners} from './geometry';
export {projectedCorners} from './geometry';
export interface RgbaFrame { data: Uint8Array; width:number; height:number }
export type FrameSource = CanvasImageSource | RgbaFrame | {gpuTexture:WebGLTexture;width:number;height:number;flip:boolean};
const vertex=`#version 300 es
in vec4 a_position; in vec2 a_uv; out vec2 v_uv;
void main(){gl_Position=a_position;v_uv=a_uv;}`;
const fragment=`#version 300 es
precision highp float; in vec2 v_uv; out vec4 outputColor;
uniform sampler2D u_texture; uniform vec4 u_crop; uniform vec2 u_pixel; uniform float u_opacity;
uniform float u_blur;uniform float u_angle;uniform float u_radial;uniform bool u_mirror;
uniform bool u_flip;
uniform vec3 u_key;uniform float u_tolerance;uniform float u_softness;uniform float u_spill;
vec2 edge(vec2 p){return u_mirror?1.0-abs(mod(p,2.0)-1.0):clamp(p,vec2(0),vec2(1));}
vec4 sampleColor(vec2 p){vec2 uv=edge(mix(u_crop.xy,vec2(1)-u_crop.zw,p));if(u_flip)uv.y=1.0-uv.y;return texture(u_texture,uv);}
void main(){
 vec4 color=vec4(0);float weights=0.0;
 if(u_blur<0.001 && abs(u_radial)<0.00001){color=sampleColor(v_uv);weights=1.0;}else for(int i=-8;i<=8;i++){float t=float(i)/8.0;float weight=exp(-t*t*3.0);
  vec2 p=v_uv+vec2(cos(u_angle),sin(u_angle))*u_pixel*u_blur*t;
  if(abs(u_radial)>0.00001){float a=u_radial*t;vec2 d=p-vec2(.5);p=vec2(cos(a)*d.x-sin(a)*d.y,sin(a)*d.x+cos(a)*d.y)+vec2(.5);}
  color+=sampleColor(p)*weight;weights+=weight;
 }
 color/=weights;
 if(u_tolerance>=0.0){float distanceToKey=distance(color.rgb,u_key);float mask=smoothstep(u_tolerance,u_tolerance+u_softness,distanceToKey);color.a*=mask;
  vec3 dominance=max(vec3(0),u_key-vec3(min(min(u_key.r,u_key.g),u_key.b)));color.rgb=max(vec3(0),color.rgb-dominance*(1.0-mask)*u_spill*.35);
 }
 color.a*=u_opacity;outputColor=vec4(color.rgb*color.a,color.a);
}`;
const gaussian=`#version 300 es
precision highp float;in vec2 v_uv;out vec4 outputColor;uniform sampler2D u_texture;uniform vec2 u_direction;uniform bool u_flip;
void main(){vec4 color=vec4(0);float sum=0.0;for(int i=-8;i<=8;i++){float t=float(i)/8.0;float w=exp(-3.0*t*t);vec2 uv=clamp(v_uv+u_direction*t,vec2(0),vec2(1));if(u_flip)uv.y=1.0-uv.y;vec4 s=texture(u_texture,uv);color+=vec4(s.rgb*s.a,s.a)*w;sum+=w;}color/=sum;outputColor=vec4(color.a>.00001?color.rgb/color.a:vec3(0),color.a);}`;
const keyer=`#version 300 es
precision highp float;in vec2 v_uv;out vec4 outputColor;uniform sampler2D u_texture;uniform bool u_flip;uniform vec3 u_key;uniform float u_tolerance;uniform float u_softness;uniform float u_spill;
void main(){vec2 uv=v_uv;if(u_flip)uv.y=1.0-uv.y;vec4 c=texture(u_texture,uv);float mask=smoothstep(u_tolerance,u_tolerance+u_softness,distance(c.rgb,u_key));c.a*=mask;vec3 dominance=max(vec3(0),u_key-vec3(min(min(u_key.r,u_key.g),u_key.b)));c.rgb=max(vec3(0),c.rgb-dominance*(1.0-mask)*u_spill*.35);outputColor=c;}`;
const borderFragment=`#version 300 es
precision highp float;in vec2 v_uv;out vec4 outputColor;
uniform vec2 u_size;uniform vec3 u_color;uniform float u_width;uniform float u_radius;uniform float u_softness;uniform float u_opacity;
void main(){
 vec2 halfSize=u_size*.5;float radius=min(u_radius,min(halfSize.x,halfSize.y));
 vec2 q=abs((v_uv-.5)*u_size)-(halfSize-vec2(radius));
 float d=length(max(q,vec2(0)))+min(max(q.x,q.y),0.0)-radius;
 float aa=max(fwidth(d),max(.001,u_softness));
 float a=(1.0-smoothstep(-aa,0.0,d))*smoothstep(-u_width-aa,-u_width+aa,d)*u_opacity;
 if(u_width<=0.0)a=0.0;
 outputColor=vec4(u_color*a,a);
}`;
const transitionFragment=`#version 300 es
precision highp float;in vec2 v_uv;out vec4 outputColor;uniform sampler2D u_out;uniform sampler2D u_in;uniform vec4 u_warpOut;uniform vec4 u_warpIn;uniform float u_mix;uniform vec4 u_motion;uniform bool u_mirror;uniform float u_aspect;
vec2 edge(vec2 p){return u_mirror?1.0-abs(mod(p,2.0)-1.0):p;}
vec4 sampleWarp(sampler2D tex,vec2 p,vec4 warp){p-=vec2(.5)+warp.xy;p.x*=u_aspect;float a=-warp.z;vec2 uv=vec2(cos(a)*p.x-sin(a)*p.y,sin(a)*p.x+cos(a)*p.y);uv.x/=u_aspect;uv=uv/max(.001,warp.w)+vec2(.5);if(!u_mirror&&(any(lessThan(uv,vec2(0)))||any(greaterThan(uv,vec2(1)))))return vec4(0);uv=edge(uv);return texture(tex,vec2(uv.x,1.0-uv.y));}
vec4 merged(vec2 p){return mix(sampleWarp(u_out,p,u_warpOut),sampleWarp(u_in,p,u_warpIn),u_mix);}
void main(){
 if(u_motion.x<.00001&&abs(u_motion.z)<.00001&&u_motion.w<.00001){outputColor=merged(v_uv);return;}
 vec4 color=vec4(0);float sum=0.0;
 vec2 direction=vec2(cos(u_motion.y),sin(u_motion.y)*u_aspect)*u_motion.x;
 vec2 size=vec2(textureSize(u_out,0));
 int steps=int(clamp(ceil(length(direction*size)+abs(u_motion.z)*max(size.x,size.y)+u_motion.w*max(size.x,size.y)),8.0,128.0));
 // Fusion's default Linear DirectionalBlur smears in one direction. Centered
 // Gaussian sampling shifts both sides of the seam and changes its appearance.
 bool linear=abs(u_motion.z)<.00001&&u_motion.w<.00001;
 for(int i=-128;i<=128;i++){
  if(abs(i)>steps)continue;
  float t=float(i)/float(steps);
  float w=linear?1.0:exp(-3.0*t*t);
  if(linear)t=(t-1.0)*.5;
  vec2 p=v_uv+direction*t;
  vec2 d=p-vec2(.5);d.x*=u_aspect;float a=u_motion.z*t;
  d=vec2(cos(a)*d.x-sin(a)*d.y,sin(a)*d.x+cos(a)*d.y);d.x/=u_aspect;
  p=d*(1.0+u_motion.w*t)+vec2(.5);
  // Blur the merged frame; its borders do not introduce additional mirrored
  // copies of the source transforms outside the composition canvas.
  color+=merged(linear?clamp(p,vec2(0),vec2(1)):p)*w;sum+=w;
 }
 outputColor=color/sum;
}`;
function shader(gl:WebGL2RenderingContext,type:number,source:string){const s=gl.createShader(type)!;gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)||'Shader compilation failed');return s;}
const colors=new Map<string,number[]>();let colorCanvas:CanvasRenderingContext2D|null=null;
function colorRGB(color:string){const cached=colors.get(color);if(cached)return cached;if(!colorCanvas)colorCanvas=document.createElement('canvas').getContext('2d',{willReadFrequently:true})!;colorCanvas.clearRect(0,0,1,1);colorCanvas.fillStyle='#000000';colorCanvas.fillStyle=color;colorCanvas.fillRect(0,0,1,1);const bytes=colorCanvas.getImageData(0,0,1,1).data,result=[bytes[0]/255,bytes[1]/255,bytes[2]/255];colors.set(color,result);if(colors.size>128)colors.delete(colors.keys().next().value!);return result;}
export class Compositor {
  private exportUniforms=new WeakMap<WebGLProgram,Map<string,WebGLUniformLocation|null>>();
  private exportAttributes=new WeakMap<WebGLProgram,Map<string,number>>();
  private uniform(program:WebGLProgram,name:string){let cache=this.exportUniforms.get(program);if(!cache){cache=new Map();this.exportUniforms.set(program,cache);}if(!cache.has(name))cache.set(name,this.gl.getUniformLocation(program,name));return cache.get(name)!;}
  private attribute(program:WebGLProgram,name:string){let cache=this.exportAttributes.get(program);if(!cache){cache=new Map();this.exportAttributes.set(program,cache);}if(!cache.has(name))cache.set(name,this.gl.getAttribLocation(program,name));return cache.get(name)!;}

  readonly gl:WebGL2RenderingContext;
  private program:WebGLProgram;private buffer:WebGLBuffer;
  private textures=new Map<string,{texture:WebGLTexture;width:number;height:number;used:number;key?:string;external?:boolean;flip?:boolean}>();private sequence=0;
  private locations:Record<string,WebGLUniformLocation|null>={};
  private gradeProgram:WebGLProgram;private gaussianProgram:WebGLProgram;private transitionProgram:WebGLProgram;private keyerProgram:WebGLProgram;private borderProgram:WebGLProgram;
  private targets=new Map<string,{texture:WebGLTexture;framebuffer:WebGLFramebuffer;width:number;height:number}>();
  constructor(readonly canvas:HTMLCanvasElement){
    const gl=canvas.getContext('webgl2',{alpha:false,premultipliedAlpha:true,preserveDrawingBuffer:true,antialias:false});if(!gl)throw new Error('WebGL2 is unavailable');this.gl=gl;
    const program=gl.createProgram()!;gl.attachShader(program,shader(gl,gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl,gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)||'Shader link failed');this.program=program;this.buffer=gl.createBuffer()!;
    for(const name of ['texture','crop','pixel','opacity','blur','angle','radial','mirror','key','tolerance','softness','spill','flip'])this.locations[name]=this.uniform(program,`u_${name}`);
    const make=(source:string)=>{const p=gl.createProgram()!;gl.attachShader(p,shader(gl,gl.VERTEX_SHADER,vertex));gl.attachShader(p,shader(gl,gl.FRAGMENT_SHADER,source));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p)||'Shader failed');return p;};this.gradeProgram=make(colorGradeFragment);this.gaussianProgram=make(gaussian);this.transitionProgram=make(transitionFragment);this.keyerProgram=make(keyer);this.borderProgram=make(borderFragment);
  }
  private target(id:string,width:number,height:number){const gl=this.gl;let target=this.targets.get(id);if(target&&(target.width!==width||target.height!==height)){gl.deleteTexture(target.texture);gl.deleteFramebuffer(target.framebuffer);this.targets.delete(id);target=undefined;}if(!target){const texture=gl.createTexture()!,framebuffer=gl.createFramebuffer()!;gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Composition framebuffer unavailable');target={texture,framebuffer,width,height};this.targets.set(id,target);}return target;}
  private geometry(program:WebGLProgram,data?:Float32Array){const gl=this.gl;gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);const pos=this.attribute(program,'a_position'),uv=this.attribute(program,'a_uv');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,4,gl.FLOAT,false,24,0);gl.enableVertexAttribArray(uv);gl.vertexAttribPointer(uv,2,gl.FLOAT,false,24,16);gl.bufferData(gl.ARRAY_BUFFER,data||new Float32Array([-1,1,0,1,0,0,1,1,0,1,1,0,-1,-1,0,1,0,1,1,-1,0,1,1,1]),gl.DYNAMIC_DRAW);}
  draw(plan:RenderPlan,timeUs:number,frames:Map<string,FrameSource>,width=plan.document.canvas.width,height=plan.document.canvas.height) {
    this.sequence++;const gl=this.gl;if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}
    gl.viewport(0,0,width,height);const background=colorRGB(plan.document.canvas.background);gl.clearColor(background[0],background[1],background[2],1);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(this.program);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);const pos=this.attribute(this.program,'a_position'),uv=this.attribute(this.program,'a_uv');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,4,gl.FLOAT,false,24,0);gl.enableVertexAttribArray(uv);gl.vertexAttribPointer(uv,2,gl.FLOAT,false,24,16);
    const layers=evaluateFrame(plan,timeUs);
    const prepared=new Map<string,{texture:WebGLTexture;width:number;height:number;flip:boolean}>();
    for(const layer of layers){let frame:FrameSource|undefined=frames.get(layer.id)||frames.get(layer.element.assetId||'');
      const key=layer.element.kind==='text'?JSON.stringify([layer.element.text,layer.element.textStyle,layer.element.presets.filter(p=>p.presetId==='Dark Box Text Lower Third'),layer.element.transform.width,plan.document.canvas.width]):undefined;
      const previous=this.textures.get(layer.id);
      if(layer.element.kind==='text')frame=previous?.key===key?undefined:rasterizeText(layer.element,plan.document);
      if(!frame&&!previous){if(layer.element.kind!=='text')throw new Error(`Frame unavailable: ${layer.element.label}`);continue;}
      const texture=previous||{texture:gl.createTexture()!,width:1,height:1,used:this.sequence,key};texture.used=this.sequence;
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture.texture);
      if(frame&&'gpuTexture' in frame){Object.assign(texture,{texture:frame.gpuTexture,width:frame.width,height:frame.height,flip:frame.flip,external:true});this.textures.set(layer.id,texture);}
      else if(frame){gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
        if('data' in frame){texture.width=frame.width;texture.height=frame.height;gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,frame.width,frame.height,0,gl.RGBA,gl.UNSIGNED_BYTE,frame.data);}
        else{const f=frame as HTMLVideoElement;texture.width=f.videoWidth||(frame as HTMLImageElement).naturalWidth||((frame as HTMLCanvasElement).width||(frame as VideoFrame).displayWidth);texture.height=f.videoHeight||(frame as HTMLImageElement).naturalHeight||((frame as HTMLCanvasElement).height||(frame as VideoFrame).displayHeight);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,frame as TexImageSource);}
        texture.key=key;this.textures.set(layer.id,texture);
      }
      let processed=texture.texture,flip=!!texture.flip;
      let lastTarget:string|null=null,keyPass=0;
      for(const effect of layer.element.presets){
        if(effect.presetId==='Gaussian Blur'&&Number(effect.params.radius??12)>0){const radius=Number(effect.params.radius??12);for(let pass=0;pass<2;pass++){const id=`blur-${pass}`,target=this.target(id,texture.width,texture.height);gl.bindFramebuffer(gl.FRAMEBUFFER,target.framebuffer);gl.viewport(0,0,texture.width,texture.height);gl.disable(gl.BLEND);this.geometry(this.gaussianProgram);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,processed);gl.uniform1i(this.uniform(this.gaussianProgram,'u_texture'),0);gl.uniform1i(this.uniform(this.gaussianProgram,'u_flip'),flip?1:0);gl.uniform2f(this.uniform(this.gaussianProgram,'u_direction'),pass===0?radius/texture.width:0,pass===1?radius/texture.height:0);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);processed=target.texture;flip=true;lastTarget=id;}}
        if(effect.presetId==='3D Keyer'){const id=`key-${keyPass++%2}`,target=this.target(id,texture.width,texture.height);gl.bindFramebuffer(gl.FRAMEBUFFER,target.framebuffer);gl.viewport(0,0,texture.width,texture.height);gl.disable(gl.BLEND);this.geometry(this.keyerProgram);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,processed);const loc=(name:string)=>this.uniform(this.keyerProgram,`u_${name}`),color=colorRGB(String(effect.params.color??'#00ff00'));gl.uniform1i(loc('texture'),0);gl.uniform1i(loc('flip'),flip?1:0);gl.uniform3f(loc('key'),color[0],color[1],color[2]);gl.uniform1f(loc('tolerance'),Number(effect.params.tolerance??.25));gl.uniform1f(loc('softness'),Number(effect.params.softness??.08));gl.uniform1f(loc('spill'),Number(effect.params.spill??.5));gl.drawArrays(gl.TRIANGLE_STRIP,0,4);processed=target.texture;flip=true;lastTarget=id;}
      }
      if(isColorGraded(layer.colorGrade)){
        const g=normalizeColorGrade(layer.colorGrade),target=this.target('grade',texture.width,texture.height),program=this.gradeProgram;
        gl.bindFramebuffer(gl.FRAMEBUFFER,target.framebuffer);gl.viewport(0,0,texture.width,texture.height);gl.disable(gl.BLEND);this.geometry(program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,processed);
        const loc=(name:string)=>this.uniform(program,`u_${name}`);gl.uniform1i(loc('texture'),0);gl.uniform1i(loc('flip'),flip?1:0);
        gl.uniform4f(loc('primary'),g.exposure,g.temperature,g.tint,g.contrast);gl.uniform4f(loc('tone'),g.saturation,g.shadows,g.midtones,g.highlights);gl.uniform1f(loc('rolloff'),g.rolloff);
        const m=g.mask;gl.uniform4f(loc('region'),m?.x??.5,m?.y??.5,m?.width??1,m?.height??1);gl.uniform3f(loc('mask'),!m?0:m.shape==='ellipse'?2:1,m?.feather??0,m?.invert?1:0);
        gl.drawArrays(gl.TRIANGLE_STRIP,0,4);processed=target.texture;flip=true;lastTarget='grade';
      }
      if(lastTarget){const copy=this.target(`processed-${layer.id}`,texture.width,texture.height);gl.bindFramebuffer(gl.READ_FRAMEBUFFER,this.targets.get(lastTarget)!.framebuffer);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,copy.framebuffer);gl.blitFramebuffer(0,0,texture.width,texture.height,0,0,texture.width,texture.height,gl.COLOR_BUFFER_BIT,gl.NEAREST);processed=copy.texture;}
      prepared.set(layer.id,{texture:processed,width:texture.width,height:texture.height,flip});
    }
    const drawLayer=(layer:FrameLayer,framebuffer:WebGLFramebuffer|null)=>{const texture=prepared.get(layer.id);if(!texture)return;gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.viewport(0,0,width,height);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
      if(layer.element.matteColor){const target=this.target('matte',1,1),color=colorRGB(layer.element.matteColor);gl.bindFramebuffer(gl.FRAMEBUFFER,target.framebuffer);gl.viewport(0,0,1,1);gl.clearColor(color[0],color[1],color[2],1);gl.clear(gl.COLOR_BUFFER_BIT);gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.viewport(0,0,width,height);const corners=projectedCorners({...layer.transform,fit:'stretch'},plan.document.canvas.width,plan.document.canvas.height,1);this.geometry(this.program,new Float32Array(corners.flatMap(([x,y,w],i)=>[(x/plan.document.canvas.width*2-1)*w,(1-y/plan.document.canvas.height*2)*w,0,w,i%2,Math.floor(i/2)])));gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,target.texture);gl.uniform1i(this.locations.texture,0);gl.uniform4f(this.locations.crop,0,0,0,0);gl.uniform1f(this.locations.opacity,layer.transform.opacity);gl.uniform1f(this.locations.blur,0);gl.uniform1f(this.locations.radial,0);gl.uniform1f(this.locations.tolerance,-1);gl.uniform1i(this.locations.flip,0);gl.uniform1i(this.locations.mirror,0);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);}
      const crop={...layer.transform.crop},aspect=texture.width/texture.height;
      const corners=projectedCorners(layer.transform,plan.document.canvas.width,plan.document.canvas.height,aspect);
      if(layer.transform.fit==='cover'){const boxAspect=layer.transform.width*plan.document.canvas.width/(layer.transform.height*plan.document.canvas.height);if(aspect>boxAspect){const retained=boxAspect/aspect,margin=(1-retained)/2;crop.left=margin+crop.left*retained;crop.right=margin+crop.right*retained;}else{const retained=aspect/boxAspect,margin=(1-retained)/2;crop.top=margin+crop.top*retained;crop.bottom=margin+crop.bottom*retained;}}
      const data=new Float32Array(corners.flatMap(([x,y,w],i)=>[(x/plan.document.canvas.width*2-1)*w,(1-y/plan.document.canvas.height*2)*w,0,w,i%2,Math.floor(i/2)]));this.geometry(this.program,data);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture.texture);gl.uniform1i(this.locations.flip,texture.flip?1:0);
      gl.uniform1i(this.locations.texture,0);gl.uniform4f(this.locations.crop,crop.left,crop.top,crop.right,crop.bottom);gl.uniform2f(this.locations.pixel,1/texture.width,1/texture.height);
      gl.uniform1f(this.locations.opacity,layer.transform.opacity);gl.uniform1f(this.locations.blur,0);gl.uniform1f(this.locations.angle,layer.blurAngle*Math.PI/180);gl.uniform1f(this.locations.radial,layer.radialBlur);gl.uniform1i(this.locations.mirror,layer.mirrorEdges?1:0);
      const color=colorRGB(layer.keyColor);gl.uniform3f(this.locations.key,color[0],color[1],color[2]);gl.uniform1f(this.locations.tolerance,-1);gl.uniform1f(this.locations.softness,layer.keySoftness);gl.uniform1f(this.locations.spill,layer.keySpill);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      // Resolve's Colored Border frames the composition after clip transforms.
      // The same preset can also frame a positioned element, without a baked asset.
      for(const preset of layer.element.presets.filter(p=>p.presetId==='Colored Border')){
        const params=preset.params,onCanvas=params.onCanvas!==false;
        const transform=onCanvas?defaultTransform():layer.transform;
        const borderCorners=projectedCorners(transform,plan.document.canvas.width,plan.document.canvas.height,onCanvas?plan.document.canvas.width/plan.document.canvas.height:aspect);
        this.geometry(this.borderProgram,new Float32Array(borderCorners.flatMap(([x,y,w],i)=>[(x/plan.document.canvas.width*2-1)*w,(1-y/plan.document.canvas.height*2)*w,0,w,i%2,Math.floor(i/2)])));
        const loc=(name:string)=>this.uniform(this.borderProgram,`u_${name}`),rgb=colorRGB(String(params.color??'#ffffff'));
        const boxWidth=Math.hypot(borderCorners[1][0]-borderCorners[0][0],borderCorners[1][1]-borderCorners[0][1]);
        const boxHeight=Math.hypot(borderCorners[2][0]-borderCorners[0][0],borderCorners[2][1]-borderCorners[0][1]);
        gl.uniform2f(loc('size'),boxWidth,boxHeight);gl.uniform3f(loc('color'),rgb[0],rgb[1],rgb[2]);
        gl.uniform1f(loc('width'),Number(params.width??36));gl.uniform1f(loc('radius'),Number(params.cornerRadius??0));gl.uniform1f(loc('softness'),Number(params.softEdge??0));gl.uniform1f(loc('opacity'),layer.transform.opacity);
        gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      }
    };
    for(let i=0;i<layers.length;i++){const layer=layers[i],incoming=layers[i+1];if(layer.transition&&incoming?.transition?.group===layer.transition.group){
        const a=this.target('transition-out',width,height),b=this.target('transition-in',width,height);
        for(const [l,target] of [[layer,a],[incoming,b]] as const){gl.bindFramebuffer(gl.FRAMEBUFFER,target.framebuffer);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);drawLayer(l,target.framebuffer);}
        gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,width,height);this.geometry(this.transitionProgram);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
        gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,a.texture);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,b.texture);
        const loc=(name:string)=>this.uniform(this.transitionProgram,`u_${name}`);gl.uniform1i(loc('out'),0);gl.uniform1i(loc('in'),1);
        for(const [name,l] of [['warpOut',layer],['warpIn',incoming]] as const){const t=l.transition!;gl.uniform4f(loc(name),t.offsetX,t.offsetY,t.rotation*Math.PI/180,t.scale);}
        const t=layer.transition;gl.uniform1f(loc('mix'),t.mix);gl.uniform1f(loc('aspect'),width/height);gl.uniform1i(loc('mirror'),layer.mirrorEdges?1:0);gl.uniform4f(loc('motion'),t.blur,t.angle*Math.PI/180,t.radial,t.zoomBlur);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);i++;
      }else drawLayer(layer,null);
    }
    for(const [id,entry] of this.textures)if(entry.used<this.sequence-2){if(!entry.external)gl.deleteTexture(entry.texture);this.textures.delete(id);}
    for(const [id,target] of this.targets)if(id.startsWith('processed-')&&!this.textures.has(id.slice(10))){gl.deleteTexture(target.texture);gl.deleteFramebuffer(target.framebuffer);this.targets.delete(id);}
    return layers;
  }
  readRgba():Uint8Array{const {gl,canvas}=this;const pixels=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);const stride=canvas.width*4,row=new Uint8Array(stride);for(let y=0;y<Math.floor(canvas.height/2);y++){const a=y*stride,b=(canvas.height-1-y)*stride;row.set(pixels.subarray(a,a+stride));pixels.copyWithin(a,b,b+stride);pixels.set(row,b);}return pixels;}
  dispose(){const gl=this.gl;for(const t of this.textures.values())gl.deleteTexture(t.texture);this.textures.clear();for(const t of this.targets.values()){gl.deleteTexture(t.texture);gl.deleteFramebuffer(t.framebuffer);}this.targets.clear();gl.deleteBuffer(this.buffer);gl.deleteProgram(this.program);gl.deleteProgram(this.gaussianProgram);gl.deleteProgram(this.transitionProgram);gl.deleteProgram(this.keyerProgram);gl.deleteProgram(this.borderProgram);gl.deleteProgram(this.gradeProgram);}
}

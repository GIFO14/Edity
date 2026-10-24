export interface GpuFrame {gpuTexture:WebGLTexture;width:number;height:number;flip:boolean}
const vertex=`#version 300 es
in vec2 position;out vec2 uv;void main(){gl_Position=vec4(position,0,1);uv=vec2(position.x*.5+.5,.5-position.y*.5);}`;
const fragment=`#version 300 es
precision highp float;in vec2 uv;out vec4 color;uniform sampler2D yPlane;uniform sampler2D uPlane;uniform sampler2D vPlane;uniform vec2 size;
void main(){vec2 chroma=uv+vec2(.5/size.x,0);float y=(texture(yPlane,uv).r*255.-16.)/219.;float u=(texture(uPlane,chroma).r*255.-128.)/224.;float v=(texture(vPlane,chroma).r*255.-128.)/224.;vec3 rgb=vec3(y+1.5748*v,y-.18732427293*u-.46812427293*v,y+1.8556*u);color=vec4(floor(clamp(rgb,0.,1.)*255.+.5)/255.,1);}`;
export function createYuvTextures(gl:WebGL2RenderingContext){
 const shader=(type:number,source:string)=>{const s=gl.createShader(type)!;gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s)||'YUV shader failed');return s;};
 const program=gl.createProgram()!;gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program)||'YUV conversion unavailable');
 const position=gl.getAttribLocation(program,'position'),size=gl.getUniformLocation(program,'size'),uniforms=['yPlane','uPlane','vPlane'].map(n=>gl.getUniformLocation(program,n));
 const geometry=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,geometry);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,1,1,1,-1,-1,1,-1]),gl.STATIC_DRAW);
 type Entry=GpuFrame&{planes:WebGLTexture[];fbo:WebGLFramebuffer;data?:Uint8Array};const entries=new Map<string,Entry>();
 const texture=()=>{const t=gl.createTexture()!;gl.bindTexture(gl.TEXTURE_2D,t);for(const name of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,name,gl.LINEAR);for(const name of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,name,gl.CLAMP_TO_EDGE);return t;};
 return (key:string,data:Uint8Array,width:number,height:number):GpuFrame=>{
  let entry=entries.get(key);if(entry?.data===data)return entry;
  if(!entry){const planes=Array.from({length:3},texture),gpuTexture=texture(),fbo=gl.createFramebuffer()!;gl.bindTexture(gl.TEXTURE_2D,gpuTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,gpuTexture,0);entry={gpuTexture,width,height,flip:true,planes,fbo};entries.set(key,entry);}
  gl.useProgram(program);gl.bindFramebuffer(gl.FRAMEBUFFER,entry.fbo);gl.viewport(0,0,width,height);gl.disable(gl.BLEND);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
  let offset=0;for(let i=0;i<3;i++){const w=i?width/2:width,h=i?height/2:height;gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,entry.planes[i]);if(!entry.data)gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,w,h,0,gl.RED,gl.UNSIGNED_BYTE,data.subarray(offset,offset+w*h));else gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,w,h,gl.RED,gl.UNSIGNED_BYTE,data.subarray(offset,offset+w*h));gl.uniform1i(uniforms[i],i);offset+=w*h;}
  gl.uniform2f(size,width,height);gl.bindBuffer(gl.ARRAY_BUFFER,geometry);gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.activeTexture(gl.TEXTURE0);gl.pixelStorei(gl.UNPACK_ALIGNMENT,4);entry.data=data;return entry;
 };
}

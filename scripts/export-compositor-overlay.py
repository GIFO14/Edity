"""Narrow additions over either delivered or working compositor, no shader restyle."""
def gpu_texture_support(t):
 old='export type FrameSource = CanvasImageSource | RgbaFrame;'
 if old not in t:return t
 t=t.replace(old,"export type FrameSource = CanvasImageSource | RgbaFrame | {gpuTexture:WebGLTexture;width:number;height:number;flip:boolean};")
 t=t.replace('used:number;key?:string}>()', 'used:number;key?:string;external?:boolean;flip?:boolean}>()')
 t=t.replace('      if(frame){gl.texParameteri', "      if(frame&&'gpuTexture' in frame){Object.assign(texture,{texture:frame.gpuTexture,width:frame.width,height:frame.height,flip:frame.flip,external:true});this.textures.set(layer.id,texture);}\n      else if(frame){gl.texParameteri")
 t=t.replace('let processed=texture.texture,flip=false;', 'let processed=texture.texture,flip=!!texture.flip;')
 t=t.replace('gl.deleteTexture(entry.texture);this.textures.delete(id);','if(!entry.external)gl.deleteTexture(entry.texture);this.textures.delete(id);')
 return t

def cache_locations(t):
 if 'private exportUniforms=' in t:return t
 start=t.index('export class Compositor {');prefix=t[:start];body=t[start:]
 body=body.replace('gl.getUniformLocation(', 'this.uniform(').replace('gl.getAttribLocation(', 'this.attribute(')
 helpers='''
  private exportUniforms=new WeakMap<WebGLProgram,Map<string,WebGLUniformLocation|null>>();
  private exportAttributes=new WeakMap<WebGLProgram,Map<string,number>>();
  private uniform(program:WebGLProgram,name:string){let cache=this.exportUniforms.get(program);if(!cache){cache=new Map();this.exportUniforms.set(program,cache);}if(!cache.has(name))cache.set(name,this.gl.getUniformLocation(program,name));return cache.get(name)!;}
  private attribute(program:WebGLProgram,name:string){let cache=this.exportAttributes.get(program);if(!cache){cache=new Map();this.exportAttributes.set(program,cache);}if(!cache.has(name))cache.set(name,this.gl.getAttribLocation(program,name));return cache.get(name)!;}
'''
 return prefix+body.replace('export class Compositor {','export class Compositor {'+helpers,1)

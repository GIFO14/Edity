import type {ColorGrade} from './types';
export const defaultColorGrade=():ColorGrade=>({enabled:true,exposure:0,temperature:0,tint:0,contrast:1,saturation:1,shadows:0,midtones:0,highlights:0,rolloff:0,mask:null});
export function normalizeColorGrade(grade?:Partial<ColorGrade>|null):ColorGrade{
 if(grade!=null&&(typeof grade!=='object'||Array.isArray(grade)))throw new Error('Invalid color grade');
 const defined=(v:object)=>Object.fromEntries(Object.entries(v).filter(([,value])=>value!==undefined));
 const g={...defaultColorGrade(),...defined(grade||{})} as ColorGrade;
 if(g.mask!=null){if(typeof g.mask!=='object'||Array.isArray(g.mask))throw new Error('Invalid grade mask');g.mask={shape:'ellipse',x:.5,y:.5,width:.5,height:.5,feather:.1,invert:false,...defined(g.mask)};}
 return g;
}
export function isColorGraded(grade?:ColorGrade|null){if(!grade||grade.enabled===false)return false;const g=normalizeColorGrade(grade);return g.exposure!==0||g.temperature!==0||g.tint!==0||g.contrast!==1||g.saturation!==1||g.shadows!==0||g.midtones!==0||g.highlights!==0||g.rolloff!==0;}
// This source-domain pass is shared by the live compositor, inspect and export.
// Inputs/outputs are straight-alpha full-range sRGB, with Rec.709 primaries.
export const colorGradeFragment=`#version 300 es
precision highp float;in vec2 v_uv;out vec4 outputColor;
uniform sampler2D u_texture;uniform bool u_flip;
uniform vec4 u_primary;uniform vec4 u_tone;uniform float u_rolloff;
uniform vec4 u_region;uniform vec3 u_mask;
vec3 linearize(vec3 x){return mix(x/12.92,pow((max(x,vec3(0))+.055)/1.055,vec3(2.4)),step(vec3(.04045),x));}
vec3 encode(vec3 x){x=max(x,vec3(0));return mix(x*12.92,1.055*pow(x,vec3(1.0/2.4))-.055,step(vec3(.0031308),x));}
void main(){vec2 uv=v_uv;if(u_flip)uv.y=1.0-uv.y;vec4 original=texture(u_texture,uv);
 vec3 gain=exp2(vec3(u_primary.y*.4+u_primary.z*.15,-u_primary.z*.3,-u_primary.y*.4+u_primary.z*.15));gain/=dot(gain,vec3(.2126,.7152,.0722));
 vec3 c=encode(linearize(original.rgb)*gain*exp2(u_primary.x));
 c=(c-.5)*u_primary.w+.5;float l=clamp(dot(c,vec3(.2126,.7152,.0722)),0.0,1.0);
 c+=.2*(u_tone.y*pow(1.0-l,3.0)+u_tone.z*4.0*l*(1.0-l)+u_tone.w*pow(l,3.0));
 c=mix(vec3(dot(c,vec3(.2126,.7152,.0722))),c,u_tone.x);
 vec3 high=max(c-.6,vec3(0));c-=u_rolloff*high*high/(high+.4);
 float amount=1.0;if(u_mask.x>0.0){vec2 d=abs((v_uv-u_region.xy)/max(u_region.zw*.5,vec2(.00001)));float distanceToEdge=u_mask.x>1.5?length(d):max(d.x,d.y);amount=1.0-smoothstep(1.0-max(.00001,u_mask.y),1.0,distanceToEdge);if(u_mask.z>.5)amount=1.0-amount;}
 outputColor=vec4(mix(original.rgb,clamp(c,vec3(0),vec3(1)),amount),original.a);
}`;

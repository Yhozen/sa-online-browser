// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
/** Native-pixel edge antialiasing. No reduced-resolution render target or upscaler. */
export function nativeAntialias(renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.Camera) {
  const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType});
  target.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
  const composer=new EffectComposer(renderer,target);
  composer.addPass(new RenderPass(scene,camera));
  // Reconstruct local geometry from the actual beauty depth, preserving alpha-tested
  // foliage and skinned silhouettes. No substitute normal pass or reduced-size buffer.
  const contact=new ShaderPass({
    uniforms:{tDiffuse:{value:null},tDepth:{value:null},inverseProjection:{value:new THREE.Matrix4()},resolution:{value:new THREE.Vector2()},projectionScale:{value:1}},
    vertexShader:`varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`
      varying vec2 vUv;
      uniform sampler2D tDiffuse,tDepth;
      uniform mat4 inverseProjection;
      uniform vec2 resolution;
      uniform float projectionScale;
      vec3 pointAt(vec2 uv){float d=texture2D(tDepth,uv).x;vec4 p=inverseProjection*vec4(uv*2.-1.,d*2.-1.,1.);return p.xyz/p.w;}
      void main(){
        vec4 color=texture2D(tDiffuse,vUv);
        if(texture2D(tDepth,vUv).x>.99999){gl_FragColor=color;return;}
        vec3 p=pointAt(vUv),n=normalize(cross(dFdx(p),dFdy(p)));
        if(dot(n,-p)<0.)n=-n;
        float radius=.85,occlusion=0.;
        float pixels=clamp(radius*projectionScale*resolution.y/(-p.z*2.),1.,72.);
        for(int i=0;i<16;i++){
          float a=float(i)*2.399963,ring=sqrt((float(i)+.5)/16.);
          vec2 uv=vUv+vec2(cos(a),sin(a))*ring*pixels/resolution;
          vec3 delta=pointAt(uv)-p;float distance=length(delta);
          float facing=max(dot(n,delta/max(distance,.0001))-.08,0.);
          occlusion+=facing*(1.-smoothstep(.04,radius,distance));
        }
        gl_FragColor=vec4(color.rgb*(1.-min(.55,occlusion*.19)),color.a);
      }`,
  });
  const renderContact=contact.render.bind(contact);
  contact.render=(renderer,writeBuffer,readBuffer,deltaTime,maskActive)=>{
    contact.uniforms.tDepth.value=readBuffer.depthTexture;
    contact.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
    contact.uniforms.projectionScale.value=camera.projectionMatrix.elements[5];
    renderContact(renderer,writeBuffer,readBuffer,deltaTime,maskActive);
  };
  composer.addPass(contact);
  composer.addPass(new OutputPass());
  const edges=new ShaderPass(FXAAShader);composer.addPass(edges);
  renderer.info.autoReset=false;
  return {
    resize(){composer.setPixelRatio(devicePixelRatio);composer.setSize(innerWidth,innerHeight);edges.uniforms.resolution.value.set(1/(innerWidth*devicePixelRatio),1/(innerHeight*devicePixelRatio));contact.uniforms.resolution.value.set(innerWidth*devicePixelRatio,innerHeight*devicePixelRatio);},
    render(standard:boolean){contact.enabled=standard;renderer.info.reset();composer.render();},
  };
}

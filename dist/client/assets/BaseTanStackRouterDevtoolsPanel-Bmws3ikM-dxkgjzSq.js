import{F as e,I as t,L as n,R as r}from"./index-D7QF1qHJ.js";import{t as i}from"./clsx-DqnTDqbU.js";var a={context:void 0,registry:void 0,effects:void 0,done:!1,getContextId(){return o(this.context.count)},getNextContextId(){return o(this.context.count++)}};function o(e){let t=String(e),n=t.length-1;return a.context.id+(n?String.fromCharCode(96+n):``)+t}function s(e){a.context=e}var c=(e,t)=>e===t,l=Symbol(`solid-proxy`),u=typeof Proxy==`function`,d=Symbol(`solid-track`),f={equals:c},p=ne,m=1,h=2,g={owned:null,cleanups:null,context:null,owner:null},_=null,v=null,y=null,b=null,x=0;function S(e,t){let n=v,r=_,i=e.length===0,a=t===void 0?r:t,o=i?g:{owned:null,cleanups:null,context:a?a.context:null,owner:a},s=i?e:()=>e(()=>D(()=>ae(o)));_=o,v=null;try{return I(s,!0)}finally{v=n,_=r}}function C(e,t){t=t?Object.assign({},f,t):f;let n={value:e,observers:null,observerSlots:null,comparator:t.equals||void 0};return[ee.bind(n),e=>(typeof e==`function`&&(e=e(n.value)),M(n,e))]}function w(e,t,n){N(P(e,t,!1,m))}function T(e,t,n){p=re;let r=P(e,t,!1,m);(!n||!n.render)&&(r.user=!0),b?b.push(r):N(r)}function E(e,t,n){n=n?Object.assign({},f,n):f;let r=P(e,t,!0,0);return r.observers=null,r.observerSlots=null,r.comparator=n.equals||void 0,N(r),ee.bind(r)}function D(e){if(v===null)return e();let t=v;v=null;try{return e()}finally{v=t}}function O(e){return _===null||(_.cleanups===null?_.cleanups=[e]:_.cleanups.push(e)),e}function k(e,t){let n=Symbol(`context`);return{id:n,Provider:le(n),defaultValue:e}}function A(e){let t;return _&&_.context&&(t=_.context[e.id])!==void 0?t:e.defaultValue}function j(e){let t=E(e),n=E(()=>ce(t()));return n.toArray=()=>{let e=n();return Array.isArray(e)?e:e==null?[]:[e]},n}function ee(){if(this.sources&&this.state)if(this.state===m)N(this);else{let e=y;y=null,I(()=>R(this),!1),y=e}if(v){let e=this.observers?this.observers.length:0;v.sources?(v.sources.push(this),v.sourceSlots.push(e)):(v.sources=[this],v.sourceSlots=[e]),this.observers?(this.observers.push(v),this.observerSlots.push(v.sources.length-1)):(this.observers=[v],this.observerSlots=[v.sources.length-1])}return this.value}function M(e,t,n){let r=e.value;return(!e.comparator||!e.comparator(r,t))&&(e.value=t,e.observers&&e.observers.length&&I(()=>{for(let t=0;t<e.observers.length;t+=1){let n=e.observers[t];n.state||(n.pure?y.push(n):b.push(n),n.observers&&ie(n)),n.state=m}if(y.length>1e6)throw y=[],Error()},!1)),t}function N(e){if(!e.fn)return;ae(e);let t=x;te(e,e.value,t)}function te(e,t,n){let r,i=_,a=v;v=_=e;try{r=e.fn(t)}catch(t){return e.pure&&(e.state=m,e.owned&&e.owned.forEach(ae),e.owned=null),e.updatedAt=n+1,se(t)}finally{v=a,_=i}(!e.updatedAt||e.updatedAt<=n)&&(e.updatedAt!=null&&`observers`in e?M(e,r):e.value=r,e.updatedAt=n)}function P(e,t,n,r=m,i){let a={fn:e,state:r,updatedAt:null,owned:null,sources:null,sourceSlots:null,cleanups:null,value:t,owner:_,context:_?_.context:null,pure:n};return _===null||_!==g&&(_.owned?_.owned.push(a):_.owned=[a]),a}function F(e){if(e.state===0)return;if(e.state===h)return R(e);if(e.suspense&&D(e.suspense.inFallback))return e.suspense.effects.push(e);let t=[e];for(;(e=e.owner)&&(!e.updatedAt||e.updatedAt<x);)e.state&&t.push(e);for(let n=t.length-1;n>=0;n--)if(e=t[n],e.state===m)N(e);else if(e.state===h){let n=y;y=null,I(()=>R(e,t[0]),!1),y=n}}function I(e,t){if(y)return e();let n=!1;t||(y=[]),b?n=!0:b=[],x++;try{let t=e();return L(n),t}catch(e){n||(b=null),y=null,se(e)}}function L(e){if(y&&=(ne(y),null),e)return;let t=b;b=null,t.length&&I(()=>p(t),!1)}function ne(e){for(let t=0;t<e.length;t++)F(e[t])}function re(e){let t,n=0;for(t=0;t<e.length;t++){let r=e[t];r.user?e[n++]=r:F(r)}if(a.context){if(a.count){a.effects||=[],a.effects.push(...e.slice(0,n));return}s()}for(a.effects&&(a.done||!a.count)&&(e=[...a.effects,...e],n+=a.effects.length,delete a.effects),t=0;t<n;t++)F(e[t])}function R(e,t){e.state=0;for(let n=0;n<e.sources.length;n+=1){let r=e.sources[n];if(r.sources){let e=r.state;e===m?r!==t&&(!r.updatedAt||r.updatedAt<x)&&F(r):e===h&&R(r,t)}}}function ie(e){for(let t=0;t<e.observers.length;t+=1){let n=e.observers[t];n.state||(n.state=h,n.pure?y.push(n):b.push(n),n.observers&&ie(n))}}function ae(e){let t;if(e.sources)for(;e.sources.length;){let t=e.sources.pop(),n=e.sourceSlots.pop(),r=t.observers;if(r&&r.length){let e=r.pop(),i=t.observerSlots.pop();n<r.length&&(e.sourceSlots[i]=n,r[n]=e,t.observerSlots[n]=i)}}if(e.tOwned){for(t=e.tOwned.length-1;t>=0;t--)ae(e.tOwned[t]);delete e.tOwned}if(e.owned){for(t=e.owned.length-1;t>=0;t--)ae(e.owned[t]);e.owned=null}if(e.cleanups){for(t=e.cleanups.length-1;t>=0;t--)e.cleanups[t]();e.cleanups=null}e.state=0}function oe(e){return e instanceof Error?e:Error(typeof e==`string`?e:`Unknown error`,{cause:e})}function se(e,t=_){throw oe(e)}function ce(e){if(typeof e==`function`&&!e.length)return ce(e());if(Array.isArray(e)){let t=[];for(let n=0;n<e.length;n++){let r=ce(e[n]);Array.isArray(r)?t.push.apply(t,r):t.push(r)}return t}return e}function le(e,t){return function(t){let n;return w(()=>n=D(()=>(_.context={..._.context,[e]:t.value},j(()=>t.children))),void 0),n}}var ue=Symbol(`fallback`);function de(e){for(let t=0;t<e.length;t++)e[t]()}function fe(e,t,n={}){let r=[],i=[],a=[],o=0,s=t.length>1?[]:null;return O(()=>de(a)),()=>{let c=e()||[],l=c.length,u,f;return c[d],D(()=>{let e,t,d,m,h,g,_,v,y;if(l===0)o!==0&&(de(a),a=[],r=[],i=[],o=0,s&&=[]),n.fallback&&(r=[ue],i[0]=S(e=>(a[0]=e,n.fallback())),o=1);else if(o===0){for(i=Array(l),f=0;f<l;f++)r[f]=c[f],i[f]=S(p);o=l}else{for(d=Array(l),m=Array(l),s&&(h=Array(l)),g=0,_=Math.min(o,l);g<_&&r[g]===c[g];g++);for(_=o-1,v=l-1;_>=g&&v>=g&&r[_]===c[v];_--,v--)d[v]=i[_],m[v]=a[_],s&&(h[v]=s[_]);for(e=new Map,t=Array(v+1),f=v;f>=g;f--)y=c[f],u=e.get(y),t[f]=u===void 0?-1:u,e.set(y,f);for(u=g;u<=_;u++)y=r[u],f=e.get(y),f!==void 0&&f!==-1?(d[f]=i[u],m[f]=a[u],s&&(h[f]=s[u]),f=t[f],e.set(y,f)):a[u]();for(f=g;f<l;f++)f in d?(i[f]=d[f],a[f]=m[f],s&&(s[f]=h[f],s[f](f))):i[f]=S(p);i=i.slice(0,o=l),r=c.slice(0)}return i});function p(e){if(a[f]=e,s){let[e,n]=C(f);return s[f]=n,t(c[f],e)}return t(c[f])}}}function z(e,t){return D(()=>e(t||{}))}function pe(){return!0}var me={get(e,t,n){return t===l?n:e.get(t)},has(e,t){return t===l?!0:e.has(t)},set:pe,deleteProperty:pe,getOwnPropertyDescriptor(e,t){return{configurable:!0,enumerable:!0,get(){return e.get(t)},set:pe,deleteProperty:pe}},ownKeys(e){return e.keys()}};function he(e){return(e=typeof e==`function`?e():e)?e:{}}function ge(){for(let e=0,t=this.length;e<t;++e){let t=this[e]();if(t!==void 0)return t}}function _e(...e){let t=!1;for(let n=0;n<e.length;n++){let r=e[n];t||=!!r&&l in r,e[n]=typeof r==`function`?(t=!0,E(r)):r}if(u&&t)return new Proxy({get(t){for(let n=e.length-1;n>=0;n--){let r=he(e[n])[t];if(r!==void 0)return r}},has(t){for(let n=e.length-1;n>=0;n--)if(t in he(e[n]))return!0;return!1},keys(){let t=[];for(let n=0;n<e.length;n++)t.push(...Object.keys(he(e[n])));return[...new Set(t)]}},me);let n={},r=Object.create(null);for(let t=e.length-1;t>=0;t--){let i=e[t];if(!i)continue;let a=Object.getOwnPropertyNames(i);for(let e=a.length-1;e>=0;e--){let t=a[e];if(t===`__proto__`||t===`constructor`)continue;let o=Object.getOwnPropertyDescriptor(i,t);if(!r[t])r[t]=o.get?{enumerable:!0,configurable:!0,get:ge.bind(n[t]=[o.get.bind(i)])}:o.value===void 0?void 0:o;else{let e=n[t];e&&(o.get?e.push(o.get.bind(i)):o.value!==void 0&&e.push(()=>o.value))}}}let i={},a=Object.keys(r);for(let e=a.length-1;e>=0;e--){let t=a[e],n=r[t];n&&n.get?Object.defineProperty(i,t,n):i[t]=n?n.value:void 0}return i}function ve(e,...t){let n=t.length;if(u&&l in e){let r=n>1?t.flat():t[0],i=t.map(t=>new Proxy({get(n){return t.includes(n)?e[n]:void 0},has(n){return t.includes(n)&&n in e},keys(){return t.filter(t=>t in e)}},me));return i.push(new Proxy({get(t){return r.includes(t)?void 0:e[t]},has(t){return r.includes(t)?!1:t in e},keys(){return Object.keys(e).filter(e=>!r.includes(e))}},me)),i}let r=[];for(let e=0;e<=n;e++)r[e]={};for(let i of Object.getOwnPropertyNames(e)){let a=n;for(let e=0;e<t.length;e++)if(t[e].includes(i)){a=e;break}let o=Object.getOwnPropertyDescriptor(e,i);!o.get&&!o.set&&o.enumerable&&o.writable&&o.configurable?r[a][i]=o.value:Object.defineProperty(r[a],i,o)}return r}var ye=0;function be(){return a.context?a.getNextContextId():`cl-${ye++}`}var xe=e=>`Stale read from <${e}>.`;function Se(e){let t=`fallback`in e&&{fallback:()=>e.fallback};return E(fe(()=>e.each,e.children,t||void 0))}function Ce(e){let t=e.keyed,n=E(()=>e.when,void 0,void 0),r=t?n:E(n,void 0,{equals:(e,t)=>!e==!t});return E(()=>{let i=r();if(i){let a=e.children;return typeof a==`function`&&a.length>0?D(()=>a(t?i:()=>{if(!D(r))throw xe(`Show`);return n()})):a}return e.fallback},void 0,void 0)}function we(e){let t=j(()=>e.children),n=E(()=>{let e=t(),n=Array.isArray(e)?e:[e],r=()=>void 0;for(let e=0;e<n.length;e++){let t=e,i=n[e],a=r,o=E(()=>a()?void 0:i.when,void 0,void 0),s=i.keyed?o:E(o,void 0,{equals:(e,t)=>!e==!t});r=()=>a()||(s()?[t,o,i]:void 0)}return r});return E(()=>{let t=n()();if(!t)return e.fallback;let[r,i,a]=t,o=a.children;return typeof o==`function`&&o.length>0?D(()=>o(a.keyed?i():()=>{if(D(n)()?.[0]!==r)throw xe(`Match`);return i()})):o},void 0,void 0)}function Te(e){return e}var Ee=new Set([`className`,`value`,`readOnly`,`noValidate`,`formNoValidate`,`isMap`,`noModule`,`playsInline`,`adAuctionHeaders`,`allowFullscreen`,`browsingTopics`,`defaultChecked`,`defaultMuted`,`defaultSelected`,`disablePictureInPicture`,`disableRemotePlayback`,`preservesPitch`,`shadowRootClonable`,`shadowRootCustomElementRegistry`,`shadowRootDelegatesFocus`,`shadowRootSerializable`,`sharedStorageWritable`,...`allowfullscreen.async.alpha.autofocus.autoplay.checked.controls.default.disabled.formnovalidate.hidden.indeterminate.inert.ismap.loop.multiple.muted.nomodule.novalidate.open.playsinline.readonly.required.reversed.seamless.selected.adauctionheaders.browsingtopics.credentialless.defaultchecked.defaultmuted.defaultselected.defer.disablepictureinpicture.disableremoteplayback.preservespitch.shadowrootclonable.shadowrootcustomelementregistry.shadowrootdelegatesfocus.shadowrootserializable.sharedstoragewritable`.split(`.`)]),De=new Set([`innerHTML`,`textContent`,`innerText`,`children`]),Oe=Object.assign(Object.create(null),{className:`class`,htmlFor:`for`}),ke=Object.assign(Object.create(null),{class:`className`,novalidate:{$:`noValidate`,FORM:1},formnovalidate:{$:`formNoValidate`,BUTTON:1,INPUT:1},ismap:{$:`isMap`,IMG:1},nomodule:{$:`noModule`,SCRIPT:1},playsinline:{$:`playsInline`,VIDEO:1},readonly:{$:`readOnly`,INPUT:1,TEXTAREA:1},adauctionheaders:{$:`adAuctionHeaders`,IFRAME:1},allowfullscreen:{$:`allowFullscreen`,IFRAME:1},browsingtopics:{$:`browsingTopics`,IMG:1},defaultchecked:{$:`defaultChecked`,INPUT:1},defaultmuted:{$:`defaultMuted`,AUDIO:1,VIDEO:1},defaultselected:{$:`defaultSelected`,OPTION:1},disablepictureinpicture:{$:`disablePictureInPicture`,VIDEO:1},disableremoteplayback:{$:`disableRemotePlayback`,AUDIO:1,VIDEO:1},preservespitch:{$:`preservesPitch`,AUDIO:1,VIDEO:1},shadowrootclonable:{$:`shadowRootClonable`,TEMPLATE:1},shadowrootdelegatesfocus:{$:`shadowRootDelegatesFocus`,TEMPLATE:1},shadowrootserializable:{$:`shadowRootSerializable`,TEMPLATE:1},sharedstoragewritable:{$:`sharedStorageWritable`,IFRAME:1,IMG:1}});function Ae(e,t){let n=ke[e];return typeof n==`object`?n[t]?n.$:void 0:n}var je=new Set([`beforeinput`,`click`,`dblclick`,`contextmenu`,`focusin`,`focusout`,`input`,`keydown`,`keyup`,`mousedown`,`mousemove`,`mouseout`,`mouseover`,`mouseup`,`pointerdown`,`pointermove`,`pointerout`,`pointerover`,`pointerup`,`touchend`,`touchmove`,`touchstart`]),Me=new Set(`altGlyph.altGlyphDef.altGlyphItem.animate.animateColor.animateMotion.animateTransform.circle.clipPath.color-profile.cursor.defs.desc.ellipse.feBlend.feColorMatrix.feComponentTransfer.feComposite.feConvolveMatrix.feDiffuseLighting.feDisplacementMap.feDistantLight.feDropShadow.feFlood.feFuncA.feFuncB.feFuncG.feFuncR.feGaussianBlur.feImage.feMerge.feMergeNode.feMorphology.feOffset.fePointLight.feSpecularLighting.feSpotLight.feTile.feTurbulence.filter.font.font-face.font-face-format.font-face-name.font-face-src.font-face-uri.foreignObject.g.glyph.glyphRef.hkern.image.line.linearGradient.marker.mask.metadata.missing-glyph.mpath.path.pattern.polygon.polyline.radialGradient.rect.set.stop.svg.switch.symbol.text.textPath.tref.tspan.use.view.vkern`.split(`.`)),Ne={xlink:`http://www.w3.org/1999/xlink`,xml:`http://www.w3.org/XML/1998/namespace`},B=e=>E(()=>e());function Pe(e,t,n){let r=n.length,i=t.length,a=r,o=0,s=0,c=t[i-1].nextSibling,l=null;for(;o<i||s<a;){if(t[o]===n[s]){o++,s++;continue}for(;t[i-1]===n[a-1];)i--,a--;if(i===o){let t=a<r?s?n[s-1].nextSibling:n[a-s]:c;for(;s<a;)e.insertBefore(n[s++],t)}else if(a===s)for(;o<i;)(!l||!l.has(t[o]))&&t[o].remove(),o++;else if(t[o]===n[a-1]&&n[s]===t[i-1]){let r=t[--i].nextSibling;e.insertBefore(n[s++],t[o++].nextSibling),e.insertBefore(n[--a],r),t[i]=n[a]}else{if(!l){l=new Map;let e=s;for(;e<a;)l.set(n[e],e++)}let r=l.get(t[o]);if(r!=null)if(s<r&&r<a){let c=o,u=1,d;for(;++c<i&&c<a&&!((d=l.get(t[c]))==null||d!==r+u);)u++;if(u>r-s){let i=t[o];for(;s<r;)e.insertBefore(n[s++],i)}else e.replaceChild(n[s++],t[o++])}else o++;else t[o++].remove()}}}var Fe=`_$DX_DELEGATE`;function V(e,t,n,r){let i,a=()=>{let t=document.createElement(`template`);return t.innerHTML=e,t.content.firstChild},o=t?()=>D(()=>document.importNode(i||=a(),!0)):()=>(i||=a()).cloneNode(!0);return o.cloneNode=o,o}function Ie(e,t=window.document){let n=t[Fe]||(t[Fe]=new Set);for(let r=0,i=e.length;r<i;r++){let i=e[r];n.has(i)||(n.add(i),t.addEventListener(i,Ye))}}function H(e,t,n){G(e)||(n==null?e.removeAttribute(t):e.setAttribute(t,n))}function Le(e,t,n,r){G(e)||(r==null?e.removeAttributeNS(t,n):e.setAttributeNS(t,n,r))}function Re(e,t,n){G(e)||(n?e.setAttribute(t,``):e.removeAttribute(t))}function U(e,t){G(e)||(t==null?e.removeAttribute(`class`):e.className=t)}function ze(e,t,n,r){if(r)Array.isArray(n)?(e[`$$${t}`]=n[0],e[`$$${t}Data`]=n[1]):e[`$$${t}`]=n;else if(Array.isArray(n)){let r=n[0];e.addEventListener(t,n[0]=t=>r.call(e,n[1],t))}else e.addEventListener(t,n,typeof n!=`function`&&n)}function Be(e,t,n={}){let r=Object.keys(t||{}),i=Object.keys(n),a,o;for(a=0,o=i.length;a<o;a++){let r=i[a];!r||r===`undefined`||t[r]||(qe(e,r,!1),delete n[r])}for(a=0,o=r.length;a<o;a++){let i=r[a],o=!!t[i];!i||i===`undefined`||n[i]===o||!o||(qe(e,i,!0),n[i]=o)}return n}function Ve(e,t,n){if(!t)return n?H(e,`style`):t;let r=e.style;if(typeof t==`string`)return r.cssText=t;typeof n==`string`&&(r.cssText=n=void 0),n||={},t||={};let i,a;for(a in n)t[a]??r.removeProperty(a),delete n[a];for(a in t)i=t[a],i!==n[a]&&(r.setProperty(a,i),n[a]=i);return n}function He(e,t={},n,r){let i={};return r||w(()=>i.children=Xe(e,t.children,i.children)),w(()=>typeof t.ref==`function`&&Ue(t.ref,e)),w(()=>We(e,t,n,!0,i,!0)),i}function Ue(e,t,n){return D(()=>e(t,n))}function W(e,t,n,r){if(n!==void 0&&!r&&(r=[]),typeof t!=`function`)return Xe(e,t,r,n);w(r=>Xe(e,t(),r,n),r)}function We(e,t,n,r,i={},a=!1){t||={};for(let r in i)if(!(r in t)){if(r===`children`)continue;i[r]=Je(e,r,null,i[r],n,a,t)}for(let r in t){if(r===`children`)continue;let o=t[r];i[r]=Je(e,r,o,i[r],n,a,t)}}function Ge(e){let t,n;return!G()||!(t=a.registry.get(n=$e()))?e():(a.completed&&a.completed.add(t),a.registry.delete(n),t)}function G(e){return!!a.context&&!a.done&&(!e||e.isConnected)}function Ke(e){return e.toLowerCase().replace(/-([a-z])/g,(e,t)=>t.toUpperCase())}function qe(e,t,n){let r=t.trim().split(/\s+/);for(let t=0,i=r.length;t<i;t++)e.classList.toggle(r[t],n)}function Je(e,t,n,r,i,a,o){let s,c,l,u,d;if(t===`style`)return Ve(e,n,r);if(t===`classList`)return Be(e,n,r);if(n===r)return r;if(t===`ref`)a||n(e);else if(t.slice(0,3)===`on:`){let i=t.slice(3);r&&e.removeEventListener(i,r,typeof r!=`function`&&r),n&&e.addEventListener(i,n,typeof n!=`function`&&n)}else if(t.slice(0,10)===`oncapture:`){let i=t.slice(10);r&&e.removeEventListener(i,r,!0),n&&e.addEventListener(i,n,!0)}else if(t.slice(0,2)===`on`){let i=t.slice(2).toLowerCase(),a=je.has(i);if(!a&&r){let t=Array.isArray(r)?r[0]:r;e.removeEventListener(i,t)}(a||n)&&(ze(e,i,n,a),a&&Ie([i]))}else if(t.slice(0,5)===`attr:`)H(e,t.slice(5),n);else if(t.slice(0,5)===`bool:`)Re(e,t.slice(5),n);else if((d=t.slice(0,5)===`prop:`)||(l=De.has(t))||!i&&((u=Ae(t,e.tagName))||(c=Ee.has(t)))||(s=e.nodeName.includes(`-`)||`is`in o)){if(d)t=t.slice(5),c=!0;else if(G(e))return n;t===`class`||t===`className`?U(e,n):s&&!c&&!l?e[Ke(t)]=n:e[u||t]=n}else{let r=i&&t.indexOf(`:`)>-1&&Ne[t.split(`:`)[0]];r?Le(e,r,t,n):H(e,Oe[t]||t,n)}return n}function Ye(e){if(a.registry&&a.events&&a.events.find(([t,n])=>n===e))return;let t=e.target,n=`$$${e.type}`,r=e.target,i=e.currentTarget,o=t=>Object.defineProperty(e,`target`,{configurable:!0,value:t}),s=()=>{let r=t[n];if(r&&!t.disabled){let i=t[`${n}Data`];if(i===void 0?r.call(t,e):r.call(t,i,e),e.cancelBubble)return}return t.host&&typeof t.host!=`string`&&!t.host._$host&&t.contains(e.target)&&o(t.host),!0},c=()=>{for(;s()&&(t=t._$host||t.parentNode||t.host););};if(Object.defineProperty(e,`currentTarget`,{configurable:!0,get(){return t||document}}),a.registry&&!a.done&&(a.done=_$HY.done=!0),e.composedPath){let n=e.composedPath();o(n[0]);for(let e=0;e<n.length-2&&(t=n[e],s());e++){if(t._$host){t=t._$host,c();break}if(t.parentNode===i)break}}else c();o(r)}function Xe(e,t,n,r,i){let a=G(e);if(a){!n&&(n=[...e.childNodes]);let t=[];for(let e=0;e<n.length;e++){let r=n[e];r.nodeType===8&&r.data.slice(0,2)===`!$`?r.remove():t.push(r)}n=t}for(;typeof n==`function`;)n=n();if(t===n)return n;let o=typeof t,s=r!==void 0;if(e=s&&n[0]&&n[0].parentNode||e,o===`string`||o===`number`){if(a||o===`number`&&(t=t.toString(),t===n))return n;if(s){let i=n[0];i&&i.nodeType===3?i.data!==t&&(i.data=t):i=document.createTextNode(t),n=K(e,n,r,i)}else n=n!==``&&typeof n==`string`?e.firstChild.data=t:e.textContent=t}else if(t==null||o===`boolean`){if(a)return n;n=K(e,n,r)}else if(o===`function`)return w(()=>{let i=t();for(;typeof i==`function`;)i=i();n=Xe(e,i,n,r)}),()=>n;else if(Array.isArray(t)){let o=[],c=n&&Array.isArray(n);if(Ze(o,t,n,i))return w(()=>n=Xe(e,o,n,r,!0)),()=>n;if(a){if(!o.length)return n;if(r===void 0)return n=[...e.childNodes];let t=o[0];if(t.parentNode!==e)return n;let i=[t];for(;(t=t.nextSibling)!==r;)i.push(t);return n=i}if(o.length===0){if(n=K(e,n,r),s)return n}else c?n.length===0?Qe(e,o,r):Pe(e,n,o):(n&&K(e),Qe(e,o));n=o}else if(t.nodeType){if(a&&t.parentNode)return n=s?[t]:t;if(Array.isArray(n)){if(s)return n=K(e,n,r,t);K(e,n,null,t)}else n==null||n===``||!e.firstChild?e.appendChild(t):e.replaceChild(t,e.firstChild);n=t}return n}function Ze(e,t,n,r){let i=!1;for(let a=0,o=t.length;a<o;a++){let o=t[a],s=n&&n[e.length],c;if(!(o==null||o===!0||o===!1))if((c=typeof o)==`object`&&o.nodeType)e.push(o);else if(Array.isArray(o))i=Ze(e,o,s)||i;else if(c===`function`)if(r){for(;typeof o==`function`;)o=o();i=Ze(e,Array.isArray(o)?o:[o],Array.isArray(s)?s:[s])||i}else e.push(o),i=!0;else{let t=String(o);s&&s.nodeType===3&&s.data===t?e.push(s):e.push(document.createTextNode(t))}}return i}function Qe(e,t,n=null){for(let r=0,i=t.length;r<i;r++)e.insertBefore(t[r],n)}function K(e,t,n,r){if(n===void 0)return e.textContent=``;let i=r||document.createTextNode(``);if(t.length){let r=!1;for(let a=t.length-1;a>=0;a--){let o=t[a];if(i!==o){let t=o.parentNode===e;!r&&!a?t?e.replaceChild(i,o):e.insertBefore(i,n):t&&o.remove()}else r=!0}}else e.insertBefore(i,n);return[i]}function $e(){return a.getNextContextId()}var et=`http://www.w3.org/2000/svg`;function tt(e,t=!1,n=void 0){return t?document.createElementNS(et,e):document.createElement(e,{is:n})}function nt(e,t){let n=E(e);return E(()=>{let e=n();switch(typeof e){case`function`:return D(()=>e(t));case`string`:let n=Me.has(e),r=a.context?Ge():tt(e,n,D(()=>t.is));return He(r,t,n),r}})}function rt(e){let[,t]=ve(e,[`component`]);return nt(()=>e.component,t)}var it=k(void 0),at=k(void 0),ot=()=>{let e=A(at);if(!e)throw Error(`useDevtoolsOnClose must be used within a TanStackRouterDevtools component`);return e},st={data:``},ct=e=>{if(typeof window==`object`){let t=(e?e.querySelector(`#_goober`):window._goober)||Object.assign(document.createElement(`style`),{innerHTML:` `,id:`_goober`});return t.nonce=window.__nonce__,t.parentNode||(e||document.head).appendChild(t),t.firstChild}return e||st},lt=/(?:([\u0080-\uFFFF\w-%@]+) *:? *([^{;]+?);|([^;}{]*?) *{)|(}\s*)/g,ut=/\/\*[^]*?\*\/|  +/g,dt=/\n+/g,q=(e,t)=>{let n=``,r=``,i=``;for(let a in e){let o=e[a];a[0]==`@`?a[1]==`i`?n=a+` `+o+`;`:r+=a[1]==`f`?q(o,a):a+`{`+q(o,a[1]==`k`?``:t)+`}`:typeof o==`object`?r+=q(o,t?t.replace(/([^,])+/g,e=>a.replace(/([^,]*:\S+\([^)]*\))|([^,])+/g,t=>/&/.test(t)?t.replace(/&/g,e):e?e+` `+t:t)):a):o!=null&&(a=/^--/.test(a)?a:a.replace(/[A-Z]/g,`-$&`).toLowerCase(),i+=q.p?q.p(a,o):a+`:`+o+`;`)}return n+(t&&i?t+`{`+i+`}`:i)+r},J={},ft=e=>{if(typeof e==`object`){let t=``;for(let n in e)t+=n+ft(e[n]);return t}return e},pt=(e,t,n,r,i)=>{let a=ft(e),o=J[a]||(J[a]=(e=>{let t=0,n=11;for(;t<e.length;)n=101*n+e.charCodeAt(t++)>>>0;return`go`+n})(a));if(!J[o]){let t=a===e?(e=>{let t,n,r=[{}];for(;t=lt.exec(e.replace(ut,``));)t[4]?r.shift():t[3]?(n=t[3].replace(dt,` `).trim(),r.unshift(r[0][n]=r[0][n]||{})):r[0][t[1]]=t[2].replace(dt,` `).trim();return r[0]})(e):e;J[o]=q(i?{[`@keyframes `+o]:t}:t,n?``:`.`+o)}let s=n&&J.g?J.g:null;return n&&(J.g=J[o]),((e,t,n,r)=>{r?t.data=t.data.replace(r,e):t.data.indexOf(e)===-1&&(t.data=n?e+t.data:t.data+e)})(J[o],t,r,s),o},mt=(e,t,n)=>e.reduce((e,r,i)=>{let a=t[i];if(a&&a.call){let e=a(n),t=e&&e.props&&e.props.className||/^go/.test(e)&&e;a=t?`.`+t:e&&typeof e==`object`?e.props?``:q(e,``):!1===e?``:e}return e+r+(a??``)},``);function Y(e){let t=this||{},n=e.call?e(t.p):e;return pt(n.unshift?n.raw?mt(n,[].slice.call(arguments,1),t.p):n.reduce((e,n)=>Object.assign(e,n&&n.call?n(t.p):n),{}):n,ct(t.target),t.g,t.o,t.k)}Y.bind({g:1}),Y.bind({k:1});var ht=typeof window>`u`;function gt(e){return e.isFetching&&e.status===`success`?e.isFetching===`beforeLoad`?`purple`:`blue`:{pending:`yellow`,success:`green`,error:`red`,notFound:`purple`,redirected:`gray`}[e.status]}function _t(e,t){let n=e.find(e=>e.routeId===t.id);return n?gt(n):`gray`}function vt(){let[e,t]=C(!1);return(ht?T:w)(()=>{t(!0)}),e}var yt=e=>{let t=Object.getOwnPropertyNames(Object(e)),n=typeof e==`bigint`?`${e.toString()}n`:e;try{return JSON.stringify(n,t)}catch{return`unable to stringify`}};function bt(e,t=[e=>e]){return e.map((e,t)=>[e,t]).sort(([e,n],[r,i])=>{for(let n of t){let t=n(e),i=n(r);if(t===void 0){if(i===void 0)continue;return 1}if(t!==i)return t>i?1:-1}return n-i}).map(([e])=>e)}var X={colors:{inherit:`inherit`,current:`currentColor`,transparent:`transparent`,black:`#000000`,white:`#ffffff`,neutral:{50:`#f9fafb`,100:`#f2f4f7`,200:`#eaecf0`,300:`#d0d5dd`,400:`#98a2b3`,500:`#667085`,600:`#475467`,700:`#344054`,800:`#1d2939`,900:`#101828`},darkGray:{50:`#525c7a`,100:`#49536e`,200:`#414962`,300:`#394056`,400:`#313749`,500:`#292e3d`,600:`#212530`,700:`#191c24`,800:`#111318`,900:`#0b0d10`},gray:{50:`#f9fafb`,100:`#f2f4f7`,200:`#eaecf0`,300:`#d0d5dd`,400:`#98a2b3`,500:`#667085`,600:`#475467`,700:`#344054`,800:`#1d2939`,900:`#101828`},blue:{25:`#F5FAFF`,50:`#EFF8FF`,100:`#D1E9FF`,200:`#B2DDFF`,300:`#84CAFF`,400:`#53B1FD`,500:`#2E90FA`,600:`#1570EF`,700:`#175CD3`,800:`#1849A9`,900:`#194185`},green:{25:`#F6FEF9`,50:`#ECFDF3`,100:`#D1FADF`,200:`#A6F4C5`,300:`#6CE9A6`,400:`#32D583`,500:`#12B76A`,600:`#039855`,700:`#027A48`,800:`#05603A`,900:`#054F31`},red:{50:`#fef2f2`,100:`#fee2e2`,200:`#fecaca`,300:`#fca5a5`,400:`#f87171`,500:`#ef4444`,600:`#dc2626`,700:`#b91c1c`,800:`#991b1b`,900:`#7f1d1d`,950:`#450a0a`},yellow:{25:`#FFFCF5`,50:`#FFFAEB`,100:`#FEF0C7`,200:`#FEDF89`,300:`#FEC84B`,400:`#FDB022`,500:`#F79009`,600:`#DC6803`,700:`#B54708`,800:`#93370D`,900:`#7A2E0E`},purple:{25:`#FAFAFF`,50:`#F4F3FF`,100:`#EBE9FE`,200:`#D9D6FE`,300:`#BDB4FE`,400:`#9B8AFB`,500:`#7A5AF8`,600:`#6938EF`,700:`#5925DC`,800:`#4A1FB8`,900:`#3E1C96`},teal:{25:`#F6FEFC`,50:`#F0FDF9`,100:`#CCFBEF`,200:`#99F6E0`,300:`#5FE9D0`,400:`#2ED3B7`,500:`#15B79E`,600:`#0E9384`,700:`#107569`,800:`#125D56`,900:`#134E48`},pink:{25:`#fdf2f8`,50:`#fce7f3`,100:`#fbcfe8`,200:`#f9a8d4`,300:`#f472b6`,400:`#ec4899`,500:`#db2777`,600:`#be185d`,700:`#9d174d`,800:`#831843`,900:`#500724`},cyan:{25:`#ecfeff`,50:`#cffafe`,100:`#a5f3fc`,200:`#67e8f9`,300:`#22d3ee`,400:`#06b6d4`,500:`#0891b2`,600:`#0e7490`,700:`#155e75`,800:`#164e63`,900:`#083344`}},alpha:{90:`e5`,70:`b3`,20:`33`},font:{size:{"2xs":`calc(var(--tsrd-font-size) * 0.625)`,xs:`calc(var(--tsrd-font-size) * 0.75)`,sm:`calc(var(--tsrd-font-size) * 0.875)`,md:`var(--tsrd-font-size)`},lineHeight:{xs:`calc(var(--tsrd-font-size) * 1)`,sm:`calc(var(--tsrd-font-size) * 1.25)`},weight:{normal:`400`,medium:`500`,semibold:`600`,bold:`700`},fontFamily:{sans:`ui-sans-serif, Inter, system-ui, sans-serif, sans-serif`,mono:`ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace`}},border:{radius:{xs:`calc(var(--tsrd-font-size) * 0.125)`,sm:`calc(var(--tsrd-font-size) * 0.25)`,md:`calc(var(--tsrd-font-size) * 0.375)`,full:`9999px`}},size:{0:`0px`,.5:`calc(var(--tsrd-font-size) * 0.125)`,1:`calc(var(--tsrd-font-size) * 0.25)`,1.5:`calc(var(--tsrd-font-size) * 0.375)`,2:`calc(var(--tsrd-font-size) * 0.5)`,2.5:`calc(var(--tsrd-font-size) * 0.625)`,3:`calc(var(--tsrd-font-size) * 0.75)`,3.5:`calc(var(--tsrd-font-size) * 0.875)`,4:`calc(var(--tsrd-font-size) * 1)`,5:`calc(var(--tsrd-font-size) * 1.25)`,8:`calc(var(--tsrd-font-size) * 2)`}},xt=e=>{let{colors:t,font:n,size:r,alpha:i,border:a}=X,{fontFamily:o,lineHeight:s,size:c}=n,l=e?Y.bind({target:e}):Y;return{devtoolsPanelContainer:l`
      direction: ltr;
      position: fixed;
      bottom: 0;
      right: 0;
      z-index: 99999;
      width: 100%;
      max-height: 90%;
      border-top: 1px solid ${t.gray[700]};
      transform-origin: top;
    `,devtoolsPanelContainerVisibility:e=>l`
        visibility: ${e?`visible`:`hidden`};
      `,devtoolsPanelContainerResizing:e=>e()?l`
          transition: none;
        `:l`
        transition: all 0.4s ease;
      `,devtoolsPanelContainerAnimation:(e,t)=>e?l`
          pointer-events: auto;
          transform: translateY(0);
        `:l`
        pointer-events: none;
        transform: translateY(${t}px);
      `,logo:l`
      cursor: pointer;
      display: flex;
      flex-direction: column;
      background-color: transparent;
      border: none;
      font-family: ${o.sans};
      gap: ${X.size[.5]};
      padding: 0px;
      &:hover {
        opacity: 0.7;
      }
      &:focus-visible {
        outline-offset: 4px;
        border-radius: ${a.radius.xs};
        outline: 2px solid ${t.blue[800]};
      }
    `,tanstackLogo:l`
      font-size: ${n.size.md};
      font-weight: ${n.weight.bold};
      line-height: ${n.lineHeight.xs};
      white-space: nowrap;
      color: ${t.gray[300]};
    `,routerLogo:l`
      font-weight: ${n.weight.semibold};
      font-size: ${n.size.xs};
      background: linear-gradient(to right, #84cc16, #10b981);
      background-clip: text;
      -webkit-background-clip: text;
      line-height: 1;
      -webkit-text-fill-color: transparent;
      white-space: nowrap;
    `,devtoolsPanel:l`
      display: flex;
      font-size: ${c.sm};
      font-family: ${o.sans};
      background-color: ${t.darkGray[700]};
      color: ${t.gray[300]};

      @media (max-width: 700px) {
        flex-direction: column;
      }
      @media (max-width: 600px) {
        font-size: ${c.xs};
      }
    `,dragHandle:l`
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      height: 4px;
      cursor: row-resize;
      z-index: 100000;
      &:hover {
        background-color: ${t.purple[400]}${i[90]};
      }
    `,firstContainer:l`
      flex: 1 1 500px;
      min-height: 40%;
      max-height: 100%;
      overflow: auto;
      border-right: 1px solid ${t.gray[700]};
      display: flex;
      flex-direction: column;
    `,routerExplorerContainer:l`
      overflow-y: auto;
      flex: 1;
    `,routerExplorer:l`
      padding: ${X.size[2]};
    `,row:l`
      display: flex;
      align-items: center;
      padding: ${X.size[2]} ${X.size[2.5]};
      gap: ${X.size[2.5]};
      border-bottom: ${t.darkGray[500]} 1px solid;
      align-items: center;
    `,detailsHeader:l`
      font-family: ui-sans-serif, Inter, system-ui, sans-serif, sans-serif;
      position: sticky;
      top: 0;
      z-index: 2;
      background-color: ${t.darkGray[600]};
      padding: 0px ${X.size[2]};
      font-weight: ${n.weight.medium};
      font-size: ${n.size.xs};
      min-height: ${X.size[8]};
      line-height: ${n.lineHeight.xs};
      text-align: left;
      display: flex;
      align-items: center;
    `,maskedBadge:l`
      background: ${t.yellow[900]}${i[70]};
      color: ${t.yellow[300]};
      display: inline-block;
      padding: ${X.size[0]} ${X.size[2.5]};
      border-radius: ${a.radius.full};
      font-size: ${n.size.xs};
      font-weight: ${n.weight.normal};
      border: 1px solid ${t.yellow[300]};
    `,maskedLocation:l`
      color: ${t.yellow[300]};
    `,detailsContent:l`
      padding: ${X.size[1.5]} ${X.size[2]};
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: ${n.size.xs};
    `,routeMatchesToggle:l`
      display: flex;
      align-items: center;
      border: 1px solid ${t.gray[500]};
      border-radius: ${a.radius.sm};
      overflow: hidden;
    `,routeMatchesToggleBtn:(e,r)=>{let a=[l`
        appearance: none;
        border: none;
        font-size: 12px;
        padding: 4px 8px;
        background: transparent;
        cursor: pointer;
        font-family: ${o.sans};
        font-weight: ${n.weight.medium};
      `];if(e){let e=l`
          background: ${t.darkGray[400]};
          color: ${t.gray[300]};
        `;a.push(e)}else{let e=l`
          color: ${t.gray[500]};
          background: ${t.darkGray[800]}${i[20]};
        `;a.push(e)}return r&&a.push(l`
          border-right: 1px solid ${X.colors.gray[500]};
        `),a},detailsHeaderInfo:l`
      flex: 1;
      justify-content: flex-end;
      display: flex;
      align-items: center;
      font-weight: ${n.weight.normal};
      color: ${t.gray[400]};
    `,matchRow:e=>{let n=[l`
        display: flex;
        border-bottom: 1px solid ${t.darkGray[400]};
        cursor: pointer;
        align-items: center;
        padding: ${r[1]} ${r[2]};
        gap: ${r[2]};
        font-size: ${c.xs};
        color: ${t.gray[300]};
      `];if(e){let e=l`
          background: ${t.darkGray[500]};
        `;n.push(e)}return n},matchIndicator:e=>{let n=[l`
        flex: 0 0 auto;
        width: ${r[3]};
        height: ${r[3]};
        background: ${t[e][900]};
        border: 1px solid ${t[e][500]};
        border-radius: ${a.radius.full};
        transition: all 0.25s ease-out;
        box-sizing: border-box;
      `];if(e===`gray`){let e=l`
          background: ${t.gray[700]};
          border-color: ${t.gray[400]};
        `;n.push(e)}return n},matchID:l`
      flex: 1;
      line-height: ${s.xs};
    `,ageTicker:e=>{let n=[l`
        display: flex;
        gap: ${r[1]};
        font-size: ${c.xs};
        color: ${t.gray[400]};
        font-variant-numeric: tabular-nums;
        line-height: ${s.xs};
      `];if(e){let e=l`
          color: ${t.yellow[400]};
        `;n.push(e)}return n},secondContainer:l`
      flex: 1 1 500px;
      min-height: 40%;
      max-height: 100%;
      overflow: auto;
      border-right: 1px solid ${t.gray[700]};
      display: flex;
      flex-direction: column;
    `,thirdContainer:l`
      flex: 1 1 500px;
      overflow: auto;
      display: flex;
      flex-direction: column;
      height: 100%;
      border-right: 1px solid ${t.gray[700]};

      @media (max-width: 700px) {
        border-top: 2px solid ${t.gray[700]};
      }
    `,fourthContainer:l`
      flex: 1 1 500px;
      min-height: 40%;
      max-height: 100%;
      overflow: auto;
      display: flex;
      flex-direction: column;
    `,routesContainer:l`
      overflow-x: auto;
      overflow-y: visible;
    `,routesRowContainer:(e,n)=>{let i=[l`
        display: flex;
        border-bottom: 1px solid ${t.darkGray[400]};
        align-items: center;
        padding: ${r[1]} ${r[2]};
        gap: ${r[2]};
        font-size: ${c.xs};
        color: ${t.gray[300]};
        cursor: ${n?`pointer`:`default`};
        line-height: ${s.xs};
      `];if(e){let e=l`
          background: ${t.darkGray[500]};
        `;i.push(e)}return i},routesRow:e=>{let n=[l`
        flex: 1 0 auto;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: ${c.xs};
        line-height: ${s.xs};
      `];if(!e){let e=l`
          color: ${t.gray[400]};
        `;n.push(e)}return n},routesRowInner:l`
      display: 'flex';
      align-items: 'center';
      flex-grow: 1;
      min-width: 0;
    `,routeParamInfo:l`
      color: ${t.gray[400]};
      font-size: ${c.xs};
      line-height: ${s.xs};
    `,nestedRouteRow:e=>l`
        margin-left: ${e?0:r[3.5]};
        border-left: ${e?``:`solid 1px ${t.gray[700]}`};
      `,code:l`
      font-size: ${c.xs};
      line-height: ${s.xs};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `,matchesContainer:l`
      flex: 1 1 auto;
      overflow-y: auto;
    `,cachedMatchesContainer:l`
      flex: 1 1 auto;
      overflow-y: auto;
      max-height: 50%;
    `,historyContainer:l`
      display: flex;
      flex: 1 1 auto;
      overflow-y: auto;
      max-height: 50%;
    `,historyOverflowContainer:l`
      padding: ${r[1]} ${r[2]};
      font-size: ${X.font.size.xs};
    `,maskedBadgeContainer:l`
      flex: 1;
      justify-content: flex-end;
      display: flex;
    `,matchDetails:l`
      display: flex;
      flex-direction: column;
      padding: ${X.size[2]};
      font-size: ${X.font.size.xs};
      color: ${X.colors.gray[300]};
      line-height: ${X.font.lineHeight.sm};
    `,matchStatus:(e,t)=>{let n=t&&e===`success`?t===`beforeLoad`?`purple`:`blue`:{pending:`yellow`,success:`green`,error:`red`,notFound:`purple`,redirected:`gray`}[e];return l`
        display: flex;
        justify-content: center;
        align-items: center;
        height: 40px;
        border-radius: ${X.border.radius.sm};
        font-weight: ${X.font.weight.normal};
        background-color: ${X.colors[n][900]}${X.alpha[90]};
        color: ${X.colors[n][300]};
        border: 1px solid ${X.colors[n][600]};
        margin-bottom: ${X.size[2]};
        transition: all 0.25s ease-out;
      `},matchDetailsInfo:l`
      display: flex;
      justify-content: flex-end;
      flex: 1;
    `,matchDetailsInfoLabel:l`
      display: flex;
    `,mainCloseBtn:l`
      background: ${t.darkGray[700]};
      padding: ${r[1]} ${r[2]} ${r[1]} ${r[1.5]};
      border-radius: ${a.radius.md};
      position: fixed;
      z-index: 99999;
      display: inline-flex;
      width: fit-content;
      cursor: pointer;
      appearance: none;
      border: 0;
      gap: 8px;
      align-items: center;
      border: 1px solid ${t.gray[500]};
      font-size: ${n.size.xs};
      cursor: pointer;
      transition: all 0.25s ease-out;

      &:hover {
        background: ${t.darkGray[500]};
      }
    `,mainCloseBtnPosition:e=>l`
        ${e===`top-left`?`top: ${r[2]}; left: ${r[2]};`:``}
        ${e===`top-right`?`top: ${r[2]}; right: ${r[2]};`:``}
        ${e===`bottom-left`?`bottom: ${r[2]}; left: ${r[2]};`:``}
        ${e===`bottom-right`?`bottom: ${r[2]}; right: ${r[2]};`:``}
      `,mainCloseBtnAnimation:e=>e?l`
        opacity: 0;
        pointer-events: none;
        visibility: hidden;
      `:l`
          opacity: 1;
          pointer-events: auto;
          visibility: visible;
        `,routerLogoCloseButton:l`
      font-weight: ${n.weight.semibold};
      font-size: ${n.size.xs};
      background: linear-gradient(to right, #98f30c, #00f4a3);
      background-clip: text;
      -webkit-background-clip: text;
      line-height: 1;
      -webkit-text-fill-color: transparent;
      white-space: nowrap;
    `,mainCloseBtnDivider:l`
      width: 1px;
      background: ${X.colors.gray[600]};
      height: 100%;
      border-radius: 999999px;
      color: transparent;
    `,mainCloseBtnIconContainer:l`
      position: relative;
      width: ${r[5]};
      height: ${r[5]};
      background: pink;
      border-radius: 999999px;
      overflow: hidden;
    `,mainCloseBtnIconOuter:l`
      width: ${r[5]};
      height: ${r[5]};
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      filter: blur(3px) saturate(1.8) contrast(2);
    `,mainCloseBtnIconInner:l`
      width: ${r[4]};
      height: ${r[4]};
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
    `,panelCloseBtn:l`
      position: absolute;
      cursor: pointer;
      z-index: 100001;
      display: flex;
      align-items: center;
      justify-content: center;
      outline: none;
      background-color: ${t.darkGray[700]};
      &:hover {
        background-color: ${t.darkGray[500]};
      }

      top: 0;
      right: ${r[2]};
      transform: translate(0, -100%);
      border-right: ${t.darkGray[300]} 1px solid;
      border-left: ${t.darkGray[300]} 1px solid;
      border-top: ${t.darkGray[300]} 1px solid;
      border-bottom: none;
      border-radius: ${a.radius.sm} ${a.radius.sm} 0px 0px;
      padding: ${r[1]} ${r[1.5]} ${r[.5]} ${r[1.5]};

      &::after {
        content: ' ';
        position: absolute;
        top: 100%;
        left: -${r[2.5]};
        height: ${r[1.5]};
        width: calc(100% + ${r[5]});
      }
    `,panelCloseBtnIcon:l`
      color: ${t.gray[400]};
      width: ${r[2]};
      height: ${r[2]};
    `,navigateButton:l`
      background: none;
      border: none;
      padding: 0 0 0 4px;
      margin: 0;
      color: ${t.gray[400]};
      font-size: ${c.md};
      cursor: pointer;
      line-height: 1;
      vertical-align: middle;
      margin-right: 0.5ch;
      flex-shrink: 0;
      &:hover {
        color: ${t.blue[300]};
      }
    `}};function Z(){let[e]=C(xt(A(it)));return e}var St=e=>{try{let t=localStorage.getItem(e);return typeof t==`string`?JSON.parse(t):void 0}catch{return}};function Ct(e,t){let[n,r]=C();return T(()=>{r(St(e)??(typeof t==`function`?t():t))}),[n,t=>{r(n=>{let r=t;typeof t==`function`&&(r=t(n));try{localStorage.setItem(e,JSON.stringify(r))}catch{}return r})}]}var wt=V(`<span><svg xmlns=http://www.w3.org/2000/svg width=12 height=12 fill=none viewBox="0 0 24 24"><path stroke=currentColor stroke-linecap=round stroke-linejoin=round stroke-width=2 d="M9 18l6-6-6-6">`),Tt=V(`<div>`),Et=V(`<button><span> `),Dt=V(`<div><div><button> [<!> ... <!>]`),Ot=V(`<button><span></span> 🔄 `),kt=V(`<span>:`),At=V(`<span>`),jt=({expanded:e,style:t={}})=>{let n=Ft();return(()=>{var t=wt(),r=t.firstChild;return w(a=>{var o=n().expander,s=i(n().expanderIcon(e));return o!==a.e&&U(t,a.e=o),s!==a.t&&H(r,`class`,a.t=s),a},{e:void 0,t:void 0}),t})()};function Mt(e,t){if(t<1)return[];let n=0,r=[];for(;n<e.length;)r.push(e.slice(n,n+t)),n+=t;return r}function Nt(e){return Symbol.iterator in e}function Q({value:e,defaultExpanded:t,pageSize:n=100,filterSubEntries:r,...a}){let[o,s]=C(!!t),c=()=>s(e=>!e),l=E(()=>typeof e()),u=E(()=>{let n=[],i=e=>{let n=t===!0?{[e.label]:!0}:t?.[e.label];return{...e,value:()=>e.value,defaultExpanded:n}};return Array.isArray(e())?n=e().map((e,t)=>i({label:t.toString(),value:e})):e()!==null&&typeof e()==`object`&&Nt(e())&&typeof e()[Symbol.iterator]==`function`?n=Array.from(e(),(e,t)=>i({label:t.toString(),value:e})):typeof e()==`object`&&e()!==null&&(n=Object.entries(e()).map(([e,t])=>i({label:e,value:t}))),r?r(n):n}),d=E(()=>Mt(u(),n)),[f,p]=C([]),[m,h]=C(void 0),g=Ft(),_=()=>{h(e()())},v=t=>z(Q,_e({value:e,filterSubEntries:r},a,t));return(()=>{var t=Tt();return W(t,(()=>{var t=B(()=>!!d().length);return()=>t()?[(()=>{var e=Et(),t=e.firstChild,n=t.firstChild;return e.$$click=()=>c(),W(e,z(jt,{get expanded(){return o()??!1}}),t),W(e,()=>a.label,t),W(t,()=>String(l).toLowerCase()===`iterable`?`(Iterable) `:``,n),W(t,()=>u().length,n),W(t,()=>u().length>1?`items`:`item`,null),w(n=>{var r=g().expandButton,i=g().info;return r!==n.e&&U(e,n.e=r),i!==n.t&&U(t,n.t=i),n},{e:void 0,t:void 0}),e})(),B(()=>B(()=>!!(o()??!1))()?B(()=>d().length===1)()?(()=>{var e=Tt();return W(e,()=>u().map((e,t)=>v(e))),w(()=>U(e,g().subEntries)),e})():(()=>{var e=Tt();return W(e,()=>d().map((e,t)=>(()=>{var r=Dt(),a=r.firstChild,o=a.firstChild,s=o.firstChild,c=s.nextSibling,l=c.nextSibling.nextSibling;return l.nextSibling,o.$$click=()=>p(e=>e.includes(t)?e.filter(e=>e!==t):[...e,t]),W(o,z(jt,{get expanded(){return f().includes(t)}}),s),W(o,t*n,c),W(o,t*n+n-1,l),W(a,(()=>{var n=B(()=>!!f().includes(t));return()=>n()?(()=>{var t=Tt();return W(t,()=>e.map(e=>v(e))),w(()=>U(t,g().subEntries)),t})():null})(),null),w(e=>{var t=g().entry,n=i(g().labelButton,`labelButton`);return t!==e.e&&U(a,e.e=t),n!==e.t&&U(o,e.t=n),e},{e:void 0,t:void 0}),r})())),w(()=>U(e,g().subEntries)),e})():null)]:B(()=>l()===`function`)()?z(Q,{get label(){return(()=>{var e=Ot(),t=e.firstChild;return e.$$click=_,W(t,()=>a.label),w(()=>U(e,g().refreshValueBtn)),e})()},value:m,defaultExpanded:{}}):[(()=>{var e=kt(),t=e.firstChild;return W(e,()=>a.label,t),e})(),` `,(()=>{var t=At();return W(t,()=>yt(e())),w(()=>U(t,g().value)),t})()]})()),w(()=>U(t,g().entry)),t})()}var Pt=e=>{let{colors:t,font:n,size:r}=X,{fontFamily:i,lineHeight:a,size:o}=n,s=e?Y.bind({target:e}):Y;return{entry:s`
      font-family: ${i.mono};
      font-size: ${o.xs};
      line-height: ${a.sm};
      outline: none;
      word-break: break-word;
    `,labelButton:s`
      cursor: pointer;
      color: inherit;
      font: inherit;
      outline: inherit;
      background: transparent;
      border: none;
      padding: 0;
    `,expander:s`
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: ${r[3]};
      height: ${r[3]};
      padding-left: 3px;
      box-sizing: content-box;
    `,expanderIcon:e=>e?s`
          transform: rotate(90deg);
          transition: transform 0.1s ease;
        `:s`
        transform: rotate(0deg);
        transition: transform 0.1s ease;
      `,expandButton:s`
      display: flex;
      gap: ${r[1]};
      align-items: center;
      cursor: pointer;
      color: inherit;
      font: inherit;
      outline: inherit;
      background: transparent;
      border: none;
      padding: 0;
    `,value:s`
      color: ${t.purple[400]};
    `,subEntries:s`
      margin-left: ${r[2]};
      padding-left: ${r[2]};
      border-left: 2px solid ${t.darkGray[400]};
    `,info:s`
      color: ${t.gray[500]};
      font-size: ${o[`2xs`]};
      padding-left: ${r[1]};
    `,refreshValueBtn:s`
      appearance: none;
      border: 0;
      cursor: pointer;
      background: transparent;
      color: inherit;
      padding: 0;
      font-family: ${i.mono};
      font-size: ${o.xs};
    `}};function Ft(){let[e]=C(Pt(A(it)));return e}Ie([`click`]);var It=V(`<div><div></div><div>/</div><div></div><div>/</div><div>`);function Lt(e){let t=[`s`,`min`,`h`,`d`],n=[e/1e3,e/6e4,e/36e5,e/864e5],r=0;for(let e=1;e<n.length&&!(n[e]<1);e++)r=e;return new Intl.NumberFormat(navigator.language,{compactDisplay:`short`,notation:`compact`,maximumFractionDigits:0}).format(n[r])+t[r]}function Rt({match:e,router:t}){let n=Z();if(!e)return null;let r=t().looseRoutesById[e.routeId];if(!r.options.loader)return null;let a=Date.now()-e.updatedAt,o=r.options.staleTime??t().options.defaultStaleTime??0,s=r.options.gcTime??t().options.defaultGcTime??1800*1e3;return(()=>{var e=It(),t=e.firstChild,r=t.nextSibling.nextSibling,c=r.nextSibling.nextSibling;return W(t,()=>Lt(a)),W(r,()=>Lt(o)),W(c,()=>Lt(s)),w(()=>U(e,i(n().ageTicker(a>o)))),e})()}var zt=V(`<button type=button>➔`);function Bt({to:e,params:t,search:n,router:r}){let i=Z();return(()=>{var a=zt();return a.$$click=i=>{i.stopPropagation(),r().navigate({to:e,params:t,search:n})},H(a,`title`,`Navigate to ${e}`),w(()=>U(a,i().navigateButton)),a})()}Ie([`click`]);var Vt=V(`<button><div>TANSTACK</div><div>TanStack Router v1`),Ht=V(`<div style=display:flex;align-items:center;width:100%><div style=flex-grow:1;min-width:0>`),Ut=V(`<code> `),$=V(`<code>`),Wt=V(`<div><div role=button><div>`),Gt=V(`<div>`),Kt=V(`<div><ul>`),qt=V(`<div><button><svg xmlns=http://www.w3.org/2000/svg width=10 height=6 fill=none viewBox="0 0 10 6"><path stroke=currentColor stroke-linecap=round stroke-linejoin=round stroke-width=1.667 d="M1 1l4 4 4-4"></path></svg></button><div><div></div><div><div></div></div></div><div><div><div><span>Pathname</span></div><div><code></code></div><div><div><button type=button>Routes</button><button type=button>Matches</button><button type=button>History</button></div><div><div>age / staleTime / gcTime</div></div></div><div>`),Jt=V(`<div><span>masked`),Yt=V(`<div role=button><div>`),Xt=V(`<li><div>`),Zt=V(`<li>This panel displays the most recent 15 navigations.`),Qt=V(`<div><div><div>Cached Matches</div><div>age / staleTime / gcTime</div></div><div>`),$t=V(`<div><div>Match Details</div><div><div><div><div></div></div><div><div>ID:</div><div><code></code></div></div><div><div>State:</div><div></div></div><div><div>Last Updated:</div><div></div></div></div></div><div>Explorer</div><div>`),en=V(`<div>Loader Data`),tn=V(`<div><div><span>Search Params</span></div><div>`),nn=V(`<span style=margin-left:0.5rem>`),rn=V(`<button type=button aria-label="Copy value to clipboard"style=cursor:pointer>`),an=15;function on(e){let{className:t,...n}=e,r=Z();return(()=>{var e=Vt(),a=e.firstChild,o=a.nextSibling;return He(e,_e(n,{get class(){return i(r().logo,t?t():``)}}),!1,!0),w(e=>{var t=r().tanstackLogo,n=r().routerLogo;return t!==e.e&&U(a,e.e=t),n!==e.t&&U(o,e.t=n),e},{e:void 0,t:void 0}),e})()}function sn(e){return(()=>{var t=Ht(),n=t.firstChild;return W(t,()=>e.left,n),W(n,()=>e.children),W(t,()=>e.right,null),w(()=>U(t,e.class)),t})()}function cn({routerState:r,router:a,route:o,isRoot:s,activeId:c,setActiveId:l}){let u=Z(),d=E(()=>r().pendingMatches||r().matches),f=E(()=>r().matches.find(e=>e.routeId===o.id)),p=E(()=>{try{if(f()?.params){let e=f()?.params,t=o.path||n(o.id);if(t.startsWith(`$`)){let n=t.slice(1);if(e[n])return`(${e[n]})`}}return``}catch{return``}}),m=E(()=>{if(s||!o.path)return;let e=Object.assign({},...d().map(e=>e.params)),n=t({path:o.fullPath,params:e,decoder:a().pathParamsDecoder});return n.isMissingParams?void 0:n.interpolatedPath});return(()=>{var t=Wt(),h=t.firstChild,g=h.firstChild;return h.$$click=()=>{f()&&l(c()===o.id?``:o.id)},W(h,z(sn,{get class(){return i(u().routesRow(!!f()))},get left(){return z(Ce,{get when(){return m()},children:e=>z(Bt,{get to(){return e()},router:a})})},get right(){return z(Rt,{get match(){return f()},router:a})},get children(){return[(()=>{var t=Ut(),r=t.firstChild;return W(t,()=>s?e:o.path||n(o.id),r),w(()=>U(t,u().code)),t})(),(()=>{var e=$();return W(e,p),w(()=>U(e,u().routeParamInfo)),e})()]}}),null),W(t,(()=>{var e=B(()=>!!o.children?.length);return()=>e()?(()=>{var e=Gt();return W(e,()=>[...o.children].sort((e,t)=>e.rank-t.rank).map(e=>z(cn,{routerState:r,router:a,route:e,activeId:c,setActiveId:l}))),w(()=>U(e,u().nestedRouteRow(!!s))),e})():null})(),null),w(e=>{var t=`Open match details for ${o.id}`,n=i(u().routesRowContainer(o.id===c(),!!f())),r=i(u().matchIndicator(_t(d(),o)));return t!==e.e&&H(h,`aria-label`,e.e=t),n!==e.t&&U(h,e.t=n),r!==e.a&&U(g,e.a=r),e},{e:void 0,t:void 0,a:void 0}),t})()}var ln=function({...t}){let{isOpen:n=!0,setIsOpen:a,handleDragStart:o,router:s,routerState:c,shadowDOMTarget:l,...u}=t,{onCloseClick:d}=ot(),f=Z(),{className:p,style:m,...h}=u;r(s,`No router was found for the TanStack Router Devtools. Please place the devtools in the <RouterProvider> component tree or pass the router instance to the devtools manually.`);let[g,_]=Ct(`tanstackRouterDevtoolsActiveTab`,`routes`),[v,y]=Ct(`tanstackRouterDevtoolsActiveRouteId`,``),[b,x]=C([]),[S,O]=C(!1);T(()=>{let e=c().matches,t=e[e.length-1];if(!t)return;let n=D(()=>b()),r=n[0],i=r&&r.pathname===t.pathname&&JSON.stringify(r.search??{})===JSON.stringify(t.search??{});(!r||!i)&&(n.length>=an&&O(!0),x(e=>{let n=[t,...e];return n.splice(an),n}))});let k=E(()=>[...c().pendingMatches??[],...c().matches,...c().cachedMatches].find(e=>e.routeId===v()||e.id===v())),A=E(()=>Object.keys(c().location.search).length),j=E(()=>({...s(),state:c()})),ee=E(()=>Object.fromEntries(bt(Object.keys(j()),[`state`,`routesById`,`routesByPath`,`options`,`manifest`].map(e=>t=>t!==e)).map(e=>[e,j()[e]]).filter(e=>typeof e[1]!=`function`&&![`__store`,`basepath`,`injectedHtml`,`subscribers`,`latestLoadPromise`,`navigateTimeout`,`resetNextScroll`,`tempLocationKey`,`latestLocation`,`routeTree`,`history`].includes(e[0])))),M=E(()=>k()?.loaderData),N=E(()=>k()),te=E(()=>c().location.search);return(()=>{var t=qt(),n=t.firstChild,r=n.firstChild,l=n.nextSibling,u=l.firstChild,x=u.nextSibling,C=x.firstChild,T=l.nextSibling,E=T.firstChild,D=E.firstChild;D.firstChild;var O=D.nextSibling,j=O.firstChild,P=O.nextSibling,F=P.firstChild,I=F.firstChild,L=I.nextSibling,ne=L.nextSibling,re=F.nextSibling,R=P.nextSibling;return He(t,_e({get class(){return i(f().devtoolsPanel,`TanStackRouterDevtoolsPanel`,p?p():``)},get style(){return m?m():``}},h),!1,!0),W(t,o?(()=>{var e=Gt();return ze(e,`mousedown`,o,!0),w(()=>U(e,f().dragHandle)),e})():null,n),n.$$click=e=>{a&&a(!1),d(e)},W(u,z(on,{"aria-hidden":!0,onClick:e=>{a&&a(!1),d(e)}})),W(C,z(Q,{label:`Router`,value:ee,defaultExpanded:{state:{},context:{},options:{}},filterSubEntries:e=>e.filter(e=>typeof e.value()!=`function`)})),W(D,(()=>{var e=B(()=>!!c().location.maskedLocation);return()=>e()?(()=>{var e=Jt(),t=e.firstChild;return w(n=>{var r=f().maskedBadgeContainer,i=f().maskedBadge;return r!==n.e&&U(e,n.e=r),i!==n.t&&U(t,n.t=i),n},{e:void 0,t:void 0}),e})():null})(),null),W(j,()=>c().location.pathname),W(O,(()=>{var e=B(()=>!!c().location.maskedLocation);return()=>e()?(()=>{var e=$();return W(e,()=>c().location.maskedLocation?.pathname),w(()=>U(e,f().maskedLocation)),e})():null})(),null),I.$$click=()=>{_(`routes`)},L.$$click=()=>{_(`matches`)},ne.$$click=()=>{_(`history`)},W(R,z(we,{get children(){return[z(Te,{get when(){return g()===`routes`},get children(){return z(cn,{routerState:c,router:s,get route(){return s().routeTree},isRoot:!0,activeId:v,setActiveId:y})}}),z(Te,{get when(){return g()===`matches`},get children(){var t=Gt();return W(t,()=>(c().pendingMatches?.length?c().pendingMatches:c().matches)?.map((t,n)=>(()=>{var n=Yt(),r=n.firstChild;return n.$$click=()=>y(v()===t.id?``:t.id),W(n,z(sn,{get left(){return z(Bt,{get to(){return t.pathname},get params(){return t.params},get search(){return t.search},router:s})},get right(){return z(Rt,{match:t,router:s})},get children(){var n=$();return W(n,()=>`${t.routeId===`__root__`?e:t.pathname}`),w(()=>U(n,f().matchID)),n}}),null),w(e=>{var a=`Open match details for ${t.id}`,o=i(f().matchRow(t===k())),s=i(f().matchIndicator(gt(t)));return a!==e.e&&H(n,`aria-label`,e.e=a),o!==e.t&&U(n,e.t=o),s!==e.a&&U(r,e.a=s),e},{e:void 0,t:void 0,a:void 0}),n})())),t}}),z(Te,{get when(){return g()===`history`},get children(){var t=Kt(),n=t.firstChild;return W(n,z(Se,{get each(){return b()},children:(t,n)=>(()=>{var r=Xt(),a=r.firstChild;return W(r,z(sn,{get left(){return z(Bt,{get to(){return t.pathname},get params(){return t.params},get search(){return t.search},router:s})},get right(){return z(Rt,{match:t,router:s})},get children(){var n=$();return W(n,()=>`${t.routeId===`__root__`?e:t.pathname}`),w(()=>U(n,f().matchID)),n}}),null),w(e=>{var o=i(f().matchRow(t===k())),s=i(f().matchIndicator(n()===0?`green`:`gray`));return o!==e.e&&U(r,e.e=o),s!==e.t&&U(a,e.t=s),e},{e:void 0,t:void 0}),r})()}),null),W(n,(()=>{var e=B(()=>!!S());return()=>e()?(()=>{var e=Zt();return w(()=>U(e,f().historyOverflowContainer)),e})():null})(),null),t}})]}})),W(T,(()=>{var e=B(()=>!!c().cachedMatches.length);return()=>e()?(()=>{var e=Qt(),t=e.firstChild,n=t.firstChild.nextSibling,r=t.nextSibling;return W(r,()=>c().cachedMatches.map(e=>(()=>{var t=Yt(),n=t.firstChild;return t.$$click=()=>y(v()===e.id?``:e.id),W(t,z(sn,{get left(){return z(Bt,{get to(){return e.pathname},get params(){return e.params},get search(){return e.search},router:s})},get right(){return z(Rt,{match:e,router:s})},get children(){var t=$();return W(t,()=>`${e.id}`),w(()=>U(t,f().matchID)),t}}),null),w(r=>{var a=`Open match details for ${e.id}`,o=i(f().matchRow(e===k())),s=i(f().matchIndicator(gt(e)));return a!==r.e&&H(t,`aria-label`,r.e=a),o!==r.t&&U(t,r.t=o),s!==r.a&&U(n,r.a=s),r},{e:void 0,t:void 0,a:void 0}),t})())),w(r=>{var i=f().cachedMatchesContainer,a=f().detailsHeader,o=f().detailsHeaderInfo;return i!==r.e&&U(e,r.e=i),a!==r.t&&U(t,r.t=a),o!==r.a&&U(n,r.a=o),r},{e:void 0,t:void 0,a:void 0}),e})():null})(),null),W(t,(()=>{var e=B(()=>!!(k()&&k()?.status));return()=>e()?(()=>{var e=$t(),t=e.firstChild,n=t.nextSibling,r=n.firstChild,i=r.firstChild,a=i.firstChild,o=i.nextSibling,s=o.firstChild.nextSibling,l=s.firstChild,u=o.nextSibling,d=u.firstChild.nextSibling,p=u.nextSibling,m=p.firstChild.nextSibling,h=n.nextSibling,g=h.nextSibling;return W(a,(()=>{var e=B(()=>!!(k()?.status===`success`&&k()?.isFetching));return()=>e()?`fetching`:k()?.status})()),W(l,()=>k()?.id),W(d,(()=>{var e=B(()=>!!c().pendingMatches?.find(e=>e.id===k()?.id));return()=>e()?`Pending`:c().matches.find(e=>e.id===k()?.id)?`Active`:`Cached`})()),W(m,(()=>{var e=B(()=>!!k()?.updatedAt);return()=>e()?new Date(k()?.updatedAt).toLocaleTimeString():`N/A`})()),W(e,(()=>{var e=B(()=>!!M());return()=>e()?[(()=>{var e=en();return w(()=>U(e,f().detailsHeader)),e})(),(()=>{var e=Gt();return W(e,z(Q,{label:`loaderData`,value:M,defaultExpanded:{}})),w(()=>U(e,f().detailsContent)),e})()]:null})(),h),W(g,z(Q,{label:`Match`,value:N,defaultExpanded:{}})),w(n=>{var a=f().thirdContainer,c=f().detailsHeader,l=f().matchDetails,_=f().matchStatus(k()?.status,k()?.isFetching),v=f().matchDetailsInfoLabel,y=f().matchDetailsInfo,b=f().matchDetailsInfoLabel,x=f().matchDetailsInfo,S=f().matchDetailsInfoLabel,C=f().matchDetailsInfo,w=f().detailsHeader,T=f().detailsContent;return a!==n.e&&U(e,n.e=a),c!==n.t&&U(t,n.t=c),l!==n.a&&U(r,n.a=l),_!==n.o&&U(i,n.o=_),v!==n.i&&U(o,n.i=v),y!==n.n&&U(s,n.n=y),b!==n.s&&U(u,n.s=b),x!==n.h&&U(d,n.h=x),S!==n.r&&U(p,n.r=S),C!==n.d&&U(m,n.d=C),w!==n.l&&U(h,n.l=w),T!==n.u&&U(g,n.u=T),n},{e:void 0,t:void 0,a:void 0,o:void 0,i:void 0,n:void 0,s:void 0,h:void 0,r:void 0,d:void 0,l:void 0,u:void 0}),e})():null})(),null),W(t,(()=>{var e=B(()=>!!A());return()=>e()?(()=>{var e=tn(),t=e.firstChild;t.firstChild;var n=t.nextSibling;return W(t,typeof navigator<`u`?(()=>{var e=nn();return W(e,z(un,{getValue:()=>{let e=c().location.search;return JSON.stringify(e)}})),e})():null,null),W(n,z(Q,{value:te,get defaultExpanded(){return Object.keys(c().location.search).reduce((e,t)=>(e[t]={},e),{})}})),w(r=>{var i=f().fourthContainer,a=f().detailsHeader,o=f().detailsContent;return i!==r.e&&U(e,r.e=i),a!==r.t&&U(t,r.t=a),o!==r.a&&U(n,r.a=o),r},{e:void 0,t:void 0,a:void 0}),e})():null})(),null),w(e=>{var t=f().panelCloseBtn,a=f().panelCloseBtnIcon,o=f().firstContainer,s=f().row,c=f().routerExplorerContainer,d=f().routerExplorer,p=f().secondContainer,m=f().matchesContainer,h=f().detailsHeader,_=f().detailsContent,v=f().detailsHeader,y=f().routeMatchesToggle,b=g()===`routes`,S=i(f().routeMatchesToggleBtn(g()===`routes`,!0)),w=g()===`matches`,k=i(f().routeMatchesToggleBtn(g()===`matches`,!0)),A=g()===`history`,j=i(f().routeMatchesToggleBtn(g()===`history`,!1)),ee=f().detailsHeaderInfo,M=i(f().routesContainer);return t!==e.e&&U(n,e.e=t),a!==e.t&&H(r,`class`,e.t=a),o!==e.a&&U(l,e.a=o),s!==e.o&&U(u,e.o=s),c!==e.i&&U(x,e.i=c),d!==e.n&&U(C,e.n=d),p!==e.s&&U(T,e.s=p),m!==e.h&&U(E,e.h=m),h!==e.r&&U(D,e.r=h),_!==e.d&&U(O,e.d=_),v!==e.l&&U(P,e.l=v),y!==e.u&&U(F,e.u=y),b!==e.c&&(I.disabled=e.c=b),S!==e.w&&U(I,e.w=S),w!==e.m&&(L.disabled=e.m=w),k!==e.f&&U(L,e.f=k),A!==e.y&&(ne.disabled=e.y=A),j!==e.g&&U(ne,e.g=j),ee!==e.p&&U(re,e.p=ee),M!==e.b&&U(R,e.b=M),e},{e:void 0,t:void 0,a:void 0,o:void 0,i:void 0,n:void 0,s:void 0,h:void 0,r:void 0,d:void 0,l:void 0,u:void 0,c:void 0,w:void 0,m:void 0,f:void 0,y:void 0,g:void 0,p:void 0,b:void 0}),t})()};function un({getValue:e}){let[t,n]=C(!1),r=null,i=async()=>{if(typeof navigator>`u`||!navigator.clipboard?.writeText){console.warn(`TanStack Router Devtools: Clipboard API unavailable`);return}try{let t=e();await navigator.clipboard.writeText(t),n(!0),r&&clearTimeout(r),r=setTimeout(()=>n(!1),2500)}catch(e){console.error(`TanStack Router Devtools: Failed to copy`,e)}};return O(()=>{r&&clearTimeout(r)}),(()=>{var e=rn();return e.$$click=i,W(e,()=>t()?`✅`:`📋`),w(()=>H(e,`title`,t()?`Copied!`:`Copy`)),e})()}Ie([`click`,`mousedown`]);var dn=Object.freeze(Object.defineProperty({__proto__:null,BaseTanStackRouterDevtoolsPanel:ln,default:ln},Symbol.toStringTag,{value:`Module`}));export{ln as B,V as _,vt as a,Z as b,dn as c,C as d,be as f,He as g,H as h,z as i,w as l,_e as m,rt as n,T as o,W as p,U as r,E as s,at as t,Ct as u};
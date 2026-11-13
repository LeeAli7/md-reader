// График функции прямо из .smd: :::plot с формулами в теле.
// Считаем и рисуем в WebView на canvas — без сети, без новых зависимостей.
// Сетка, оси, подписи, несколько кривых, легенда; тема берётся из ридера.

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

export const SmdPlot = React.memo(function SmdPlot({
  exprs,
  xmin,
  xmax,
  ymin,
  ymax,
  title,
  color,
  muted,
  dark,
  height = 236,
}: {
  exprs: string[];
  xmin: number;
  xmax: number;
  ymin?: number;
  ymax?: number;
  title?: string;
  color: string;
  muted: string;
  dark: boolean;
  height?: number;
}) {
  const html = useMemo(() => {
    const data = JSON.stringify({ exprs, xmin, xmax, ymin, ymax, title: title || '', color, muted, dark });
    return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body{margin:0;padding:0;overflow:hidden;background:transparent}
canvas{display:block}</style></head><body>
<canvas id="c"></canvas>
<script>
var D=${data};
var cv=document.getElementById('c'), dpr=window.devicePixelRatio||1;
var W=window.innerWidth, H=${height};
cv.width=Math.round(W*dpr); cv.height=Math.round(H*dpr);
cv.style.width=W+'px'; cv.style.height=H+'px';
var g=cv.getContext('2d'); g.scale(dpr,dpr);

var PAD={l:36,r:14,t:${title ? 26 : 14},b:24};
var PW=W-PAD.l-PAD.r, PH=H-PAD.t-PAD.b;

var FUNCS=['sin','cos','tan','asin','acos','atan','sqrt','abs','exp','ln','log','floor','ceil','round','sign'];
function compile(src){
  var s=src.toLowerCase().replace(/\\s+/g,'').replace(/\\u03c0/g,'pi');
  s=s.replace(/(\\d)(pi)/g,'$1*PI').replace(/(\\d)(x)/g,'$1*x');
  s=s.replace(/(\\d)(?=(sin|cos|tan|sqrt|abs|exp|ln|log)\\b)/g,'$1*');
  s=s.replace(/(x)(?=(sin|cos|tan|sqrt|abs|exp|ln|log)\\b)/g,'$1*');
  s=s.replace(/\\)(?=(x|\\d|sin|cos|tan|sqrt|abs|exp|ln|log))/g,')*');
  s=s.replace(/(x|\\d|\\))(\\()/g,'$1*$2').replace(/\\^/g,'**');
  if(!/^[0-9x+\\-*/().,%a-z]*$/.test(s)) return null;
  try{
    return new Function('x','with(Math){var PI=Math.PI,pi=Math.PI,ln=Math.log,log=Math.log10;return ('+s+')}');
  }catch(e){ return null; }
}

var fns=D.exprs.map(function(e){ return {src:e, f:compile(e)}; });
function at(f,x){ if(!f) return NaN; try{ var y=f(x); return (typeof y==='number'&&isFinite(y))?y:NaN; }catch(e){ return NaN; } }

var ymin=D.ymin, ymax=D.ymax;
if(ymin===undefined||ymax===undefined||!(ymax>ymin)){
  var lo=Infinity, hi=-Infinity, N=400;
  for(var i=0;i<=N;i++){
    var x=D.xmin+(D.xmax-D.xmin)*i/N;
    for(var k=0;k<fns.length;k++){ var y=at(fns[k].f,x); if(isFinite(y)){ if(y<lo)lo=y; if(y>hi)hi=y; } }
  }
  if(!isFinite(lo)||!isFinite(hi)||hi-lo<1e-9){ lo=-5; hi=5; }
  var pad=(hi-lo)*0.12; lo-=pad; hi+=pad;
  if(ymin===undefined||!(ymax>ymin)){ ymin=lo; ymax=hi; }
}
function X(v){ return PAD.l+(v-D.xmin)/(D.xmax-D.xmin)*PW; }
function Y(v){ return PAD.t+PH-(v-ymin)/(ymax-ymin)*PH; }

function tick(step){
  var e=Math.pow(10,Math.floor(Math.log(step)/Math.LN10)), m=step/e;
  return (m<=1?1:m<=2?2:m<=5?5:10)*e;
}
function stepFor(span,px){ var raw=span/Math.max(2,px/58); return tick(raw); }

var sx=stepFor(D.xmax-D.xmin,PW), sy=stepFor(ymax-ymin,PH);
g.clearRect(0,0,W,H);
g.font='10px -apple-system,Roboto,sans-serif';
g.textAlign='center'; g.textBaseline='middle';

// сетка + подписи по X
g.strokeStyle=D.color+'14'; g.lineWidth=1;
for(var x=Math.ceil(D.xmin/sx)*sx; x<=D.xmax+1e-9; x+=sx){
  var px=Math.round(X(x))+0.5;
  g.beginPath(); g.moveTo(px,PAD.t); g.lineTo(px,PAD.t+PH); g.stroke();
  g.fillStyle=D.muted; g.fillText(fmt(x,sx), px, PAD.t+PH+12);
}
// сетка + подписи по Y
g.textAlign='right';
for(var y=Math.ceil(ymin/sy)*sy; y<=ymax+1e-9; y+=sy){
  var py=Math.round(Y(y))+0.5;
  g.beginPath(); g.moveTo(PAD.l,py); g.lineTo(PAD.l+PW,py); g.stroke();
  g.fillStyle=D.muted; g.fillText(fmt(y,sy), PAD.l-6, py);
}

// оси
g.strokeStyle=D.color+'55'; g.lineWidth=1;
if(ymin<0&&ymax>0){ var y0=Math.round(Y(0))+0.5; g.beginPath(); g.moveTo(PAD.l,y0); g.lineTo(PAD.l+PW,y0); g.stroke(); }
if(D.xmin<0&&D.xmax>0){ var x0=Math.round(X(0))+0.5; g.beginPath(); g.moveTo(x0,PAD.t); g.lineTo(x0,PAD.t+PH); g.stroke(); }

// кривые
var PAL=['#0A84FF','#FF3B30','#30D158','#BF5AF2','#FF9F0A'];
var N2=Math.max(320,Math.round(PW));
for(var k2=0;k2<fns.length;k2++){
  g.strokeStyle=D.dark?['#FFFFFF','#FF453A','#30D158','#BF5AF2','#FFD60A'][k2%5]:PAL[k2%5];
  g.lineWidth=2; g.lineJoin='round'; g.lineCap='round';
  g.beginPath();
  var pen=false, prevY=0;
  for(var i2=0;i2<=N2;i2++){
    var xx=D.xmin+(D.xmax-D.xmin)*i2/N2, yy=at(fns[k2].f,xx);
    if(!isFinite(yy)||Math.abs(yy)>Math.max(Math.abs(ymin),Math.abs(ymax))*40+1e3){ pen=false; continue; }
    var CX=X(xx), CY=Y(yy);
    if(CY<PAD.t-600||CY>PAD.t+PH+600){ pen=false; continue; }
    if(!pen||Math.abs(CY-prevY)>PH*1.6){ g.moveTo(CX,CY); pen=true; }
    else g.lineTo(CX,CY);
    prevY=CY;
  }
  g.stroke();
}

// легенда
if(fns.length>1){
  g.textAlign='left'; g.font='10px -apple-system,Roboto,sans-serif';
  var lh=14, lw=0;
  for(var k3=0;k3<fns.length;k3++) lw=Math.max(lw, g.measureText('y = '+fns[k3].src).width);
  var lx=PAD.l+PW-lw-16, ly=PAD.t+6;
  g.fillStyle=D.dark?'rgba(0,0,0,0.55)':'rgba(255,255,255,0.85)';
  roundRect(lx-8,ly-6,lw+18,fns.length*lh+8,6); g.fill();
  for(var k4=0;k4<fns.length;k4++){
    g.fillStyle=D.dark?['#FFFFFF','#FF453A','#30D158','#BF5AF2','#FFD60A'][k4%5]:PAL[k4%5];
    g.fillRect(lx,ly+3+k4*lh,10,2);
    g.fillStyle=D.color; g.fillText('y = '+fns[k4].src, lx+14, ly+4+k4*lh);
  }
}

if(D.title){
  g.textAlign='center'; g.textBaseline='top';
  g.font='600 12px -apple-system,Roboto,sans-serif';
  g.fillStyle=D.color; g.fillText(D.title, W/2, 6);
}

function fmt(v,step){
  if(Math.abs(v)<1e-9) return '0';
  var d=Math.max(0,Math.min(4,Math.ceil(-Math.log(step)/Math.LN10)+ (step<1?0:0)));
  return (Math.round(v*Math.pow(10,d))/Math.pow(10,d)).toString().replace('-','\\u2212');
}
function roundRect(x,y,w,h,r){
  g.beginPath(); g.moveTo(x+r,y); g.arcTo(x+w,y,x+w,y+h,r); g.arcTo(x+w,y+h,x,y+h,r);
  g.arcTo(x,y+h,x,y,r); g.arcTo(x,y,x+w,y,r); g.closePath();
}
</script></body></html>`;
  }, [exprs.join('|'), xmin, xmax, ymin, ymax, title, color, muted, dark, height]);

  return (
    <View style={{ marginVertical: 10 }}>
      <View style={[s.frame, { borderColor: color + '14', backgroundColor: color + '03' }]}>
        <View style={{ height }} pointerEvents="none">
          <WebView
            source={{ html }}
            style={{ backgroundColor: 'transparent' }}
            containerStyle={{ backgroundColor: 'transparent' }}
            scrollEnabled={false}
            originWhitelist={['*']}
            javaScriptEnabled
            setBuiltInZoomControls={false}
            overScrollMode="never"
          />
        </View>
      </View>
      <Text style={[s.note, { color: muted }]}>
        {exprs.map((e) => `y = ${e}`).join('   ·   ')}
      </Text>
    </View>
  );
});

const s = StyleSheet.create({
  frame: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  note: { fontSize: 11.5, marginTop: 5, textAlign: 'center', fontVariant: ['tabular-nums'] },
});

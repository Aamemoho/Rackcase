/* ============================================================
   포토제네시스 · 프로토타입 0f.1 관측소 지도 핀
   "절차 생성기가 만든 여러 현실 후보 중,
    사진이 하나를 공용 현실로 확정하는 게임"의 최소 검증 단위.
   - 10×10 셀, 중앙 4셀만 현실. 나머지는 미현상 설원.
   - 렌즈(카메라 모드) 안에서만 후보 지형이 노출된다.
   - 셔터 → 필름(미현상) → 인화실 복귀 → 현상 대기 → 셀 고정.
   - BroadcastChannel: 같은 브라우저의 두 탭이 세계를 공유한다.
   - 검증 대상: 이 루프 자체가 재밌는가. 그래픽 아님.
   ── 0b 변경 (플레이테스트 5건 반영) ──
   ① 귀로: 현상 중인 셀이 재 너머에서 보라로 맥동 + 필름 무게가 숨에 실린다
   ② 표본 확인: 고정된 셀에 들어가 [확인] — 카드로 읽는다 (텍스트는 proto0S 병합 대기)
   ③ 지형: 시드 기복 (인화실 주변은 평탄)
   ④ 검은 벽 → 미현상 장막: 그레인이 흐르는 재의 장막 + 경계 접촉 시 시야로 밀려드는 재
   ⑤ 본편 이식: Minolta XE-7 셔터 take(기계 시간) + 입김(피로·필름 무게 반응)
   ============================================================ */

// ---------- 유틸 ----------
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function hash2(seed,x,z){let h=(seed^Math.imul(x+13,374761393)^Math.imul(z+71,668265263))>>>0;h=Math.imul(h^(h>>>13),1274126177)>>>0;return (h^(h>>>16))>>>0}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;

// ---------- 세계 상수 ----------
const params=new URLSearchParams(location.search);
const SEED=parseInt(params.get('seed'),10)||20260711;
const GRID=10, CELL=24, HALF=GRID*CELL/2;         // 세계: -120 ~ +120
const RANGE=64;                                    // 렌즈 노출 거리
const COVER_MIN=0.4;                               // 본편과 동일한 40% 가시 임계
const MAX_CELLS_PER_SHOT=4;                        // 필름 한 장이 담는 최대 셀
let FILM_MAX=6;
const DARKROOM_R=9;
const STATION_X=-10,STATION_Z=-8;

const myId=Math.random().toString(36).slice(2,9);
const greek=['α','β','γ','δ','ε','ζ'];
const myName='탐사자-'+greek[Math.floor(Math.random()*greek.length)]+Math.floor(Math.random()*90+10);

// ---------- 설원 지형: 완만한 눈밭 + 촬영을 유도하는 전망 언덕 + 산/강/절벽 ----------
const TAMP=1.25;
const _tp=(()=>{const r=mulberry32(SEED^0x7f4a);return[r()*6.28,r()*6.28,r()*6.28]})();
function groundH(x,z){
  const base=Math.sin(x*0.031+_tp[0])*Math.cos(z*0.026+_tp[1])*TAMP
            +Math.sin((x+z)*0.017+_tp[2])*TAMP*0.55;
  const d=Math.hypot(x,z);                       // 인화실 주변은 평탄
  const k=clamp((d-DARKROOM_R-2)/12,0,1);
  const mountain=7.5*Math.exp(-Math.pow((z+92)/31,2))*(0.55+0.45*Math.sin(x*0.032+1.4));
  const cliff=4.8*Math.exp(-Math.pow((x+88)/17,2))*clamp((-z+50)/105,0,1);
  const riverX=42+Math.sin(z*0.027)*12;
  const river=-2.6*Math.exp(-Math.pow((x-riverX)/6.5,2));
  // 시작점 남서쪽의 넓은 봉우리. 정상에 오르면 다음 미확정 셀과 강 건너가 한 프레임에 들어온다.
  const vantage=11.5*Math.exp(-(Math.pow(x+28,2)+Math.pow(z-40,2))/(2*23*23));
  const shoulder=3.8*Math.exp(-(Math.pow(x+5,2)+Math.pow(z-25,2))/(2*18*18));
  const shaped=base+mountain+cliff+river+vantage+shoulder;
  return shaped*k*k*(3-2*k);
}

// ---------- 셀 상태 ----------
// state: void(미노출) | developing(예약/현상 중) | fixed(고정)
const cells=[];
for(let cx=0;cx<GRID;cx++){cells[cx]=[];for(let cz=0;cz<GRID;cz++){
  cells[cx][cz]={state:'void',by:null,reservedBy:null,reservedTs:0,photo:null,clarity:0,
                 group:null,ground:null,ash:null,ashU:null,hasRoad:false,pulse:null,anims:[]};
}}
const cellCenter=(cx,cz)=>({x:(cx-GRID/2+0.5)*CELL, z:(cz-GRID/2+0.5)*CELL});
const cellAt=(x,z)=>{const cx=Math.floor((x+HALF)/CELL),cz=Math.floor((z+HALF)/CELL);
  return(cx<0||cx>=GRID||cz<0||cz>=GRID)?null:{cx,cz}};

// 기반층: 시드만으로 결정되는 도로 경로(사진 밖으로 이어지는 연속성 증명용)
const roadCols=[];{const r=mulberry32(SEED^0x9e37);let c=2+Math.floor(r()*4);
  for(let cz=0;cz<GRID;cz++){roadCols[cz]=c;c=clamp(c+Math.floor(r()*3)-1,0,GRID-1);}}

// ---------- 표본 데이터 ② ----------
/* ▼▼ 병합 지점 ▼▼
   9종 「2차 명단 이후」 원문(보이는 것/도감/잔류 3줄)은 proto0S(specimens.html)에만 있다.
   그 파일의 텍스트를 아래 see/log/trace에 붙여넣으면 병합 끝 — 구조·id·계층은 맞춰뒀다.
   빈 줄은 카드에서 '원문 병합 대기'로 표시된다. */
const SPECIMENS=[
  {id:'bus',     tier:0, nm:'멈춘 버스 시간표',        see:'', log:'', trace:''},
  {id:'notice1', tier:0, nm:'북부 이송 공고',          see:'', log:'', trace:''},
  {id:'fmap',    tier:0, nm:'접힌 지도',               see:'', log:'', trace:''},
  {id:'notice2', tier:1, nm:'찢어진 2차 이송 공고문',  see:'', log:'', trace:''},
  {id:'table',   tier:1, nm:'창문 안 식탁 세 그릇',
    see:'창문 안쪽, 낮은 식탁에 그릇 세 개가 놓여 있다.',
    log:'세 자리. 한쪽은 아직 따뜻한 척한다.',
    trace:'촬영 순간에는 보이지 않았다. 현상액 속에서 셋의 간격만 천천히 떠올랐다.'},
  {id:'meds',    tier:1, nm:'빈 약 배급함',            see:'', log:'', trace:''},
  {id:'case',    tier:2, nm:'카메라 케이스',           see:'', log:'', trace:''},
  {id:'note',    tier:2, nm:'수첩',                    see:'', log:'', trace:''},
  {id:'mirror',  tier:2, nm:'거울 조각',               see:'', log:'', trace:''}
];
/* ▲▲ 병합 지점 ▲▲ */
const TIER_NM=['L0 · 세계','L1 · 공동체','L2 · 인물'];
// 배치 철학은 proto0S 그대로: 계층 = 인화실로부터의 거리 = 인화 시간.
// L0 ≈ 51 (두 번째 링) · L1 ≈ 61~70 · L2 ≈ 85 (대각 모서리 안쪽)
{
  const r=mulberry32(SEED^0x51ab);
  const pick=(arr,n)=>{const a=arr.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a.slice(0,n)};
  const q=GRID/2;
  const L0=pick([[q-2,q-2],[q+1,q-2],[q-2,q+1],[q+1,q+1]],3);
  const L1=pick([[q-3,q-2],[q-2,q-3],[q+1,q-3],[q+2,q-2],[q-3,q+1],[q-2,q+2],[q+1,q+2],[q+2,q+1]],3);
  const L2=pick([[q-4,q-4],[q+3,q-4],[q-4,q+3],[q+3,q+3]],3);
  const slots=[...L0,...L1,...L2];
  SPECIMENS.forEach((sp,i)=>{
    const [cx,cz]=slots[i];sp.cx=cx;sp.cz=cz;
    const p=cellCenter(cx,cz);
    let ox=(r()-0.5)*CELL*0.55, oz=(r()-0.5)*CELL*0.55;
    if(roadCols[cz]===cx&&Math.abs(ox)<4.5)ox+=ox<0?-5:5;   // 도로 위는 피한다
    sp.x=p.x+ox;sp.z=p.z+oz;sp.confirmed=false;sp.mesh=null;sp.mark=null;
  });
}
// 0f 세로 조각: L1-TABLE은 임의 배치에서 잘라 기존 관측소의 중앙 창문에 고정한다.
const stationLoop={shot:false,developed:false,pinned:false,rewarded:false,before:null,developedImg:null,
  photoCell:null,detail:null};
const stationSpec=SPECIMENS.find(sp=>sp.id==='table');
{
  const sc=cellAt(STATION_X,STATION_Z);
  stationSpec.cx=sc.cx;stationSpec.cz=sc.cz;
  stationSpec.x=STATION_X;stationSpec.z=STATION_Z+3.52;
  stationSpec.stationLocked=true;
}
let specDone=0;

// ---------- three 셋업 ----------
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.outputEncoding=THREE.sRGBEncoding;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.28;
document.body.appendChild(renderer.domElement);

const scene=new THREE.Scene();
scene.background=new THREE.Color(0xdce7ec);
scene.fog=new THREE.FogExp2(0xd2dde2,0.0065);

scene.add(new THREE.HemisphereLight(0xf5fbff,0x87959c,1.22));
const dir=new THREE.DirectionalLight(0xfffdf4,0.88);dir.position.set(40,75,25);scene.add(dir);

const camera=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,0.1,550);
const BASE_FOV=70,CAM_FOV=46;
const player={x:0,z:8,yaw:Math.PI,pitch:0,h:1.7};   // 인화실을 등지고 출발
let camY=groundH(0,8)+1.7;

const ghostMat=new THREE.MeshLambertMaterial({color:0xb8bfca,transparent:true,opacity:0.34});
// 흰 설원이 주역이고, 색은 필름의 빛샘처럼 셀마다 얇게 스민다.
const PRISM=[0x62d9e6,0x78dfb4,0xffd36a,0xff8d78,0xed8fd0,0x9d8cf4,0x73a9f5];
const VIVID=[0x00d9ff,0x00e676,0xffd400,0xff4b2e,0xff2fa8,0x7448ff,0x146cff];
const snowWhite=new THREE.Color(0xf5f7f7),roadGrey=new THREE.Color(0xb6c1c6);
function prismColor(cx,cz,whiteMix){
  const c=new THREE.Color(PRISM[hash2(SEED^0x4f2d,cx,cz)%PRISM.length]);
  return c.lerp(snowWhite,whiteMix);
}
function prismRoad(cx,cz){
  const c=new THREE.Color(PRISM[hash2(SEED^0x8aa1,cx,cz)%PRISM.length]);
  return c.lerp(roadGrey,0.76);
}

// ---------- 미현상 장막 ④ ----------
// 검은 상자 대신: 인화되지 않은 필름의 결 — 그레인이 흐르고, 아래는 짙고 위는 풀린다.
const ashVert=`
  varying vec3 vW; varying float vH;
  void main(){
    vH=uv.y;
    vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz;
    gl_Position=projectionMatrix*viewMatrix*w;
  }`;
const ashFrag=`
  precision mediump float;
  varying vec3 vW; varying float vH;
  uniform float uTime,uAlpha,uThin,uEdge;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float vnoise(vec2 p){
    vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
               mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
  }
  void main(){
    vec2 q=vW.xz*0.16+vec2(uTime*0.045,-uTime*0.031);
    float n=vnoise(q)*0.62+vnoise(q*2.7+vec2(9.2,3.1))*0.38;      // 재의 결
    float g=hash(floor(vW.xz*4.1)+floor(uTime*9.0));               // 미현상 그레인
    float vert=1.0-smoothstep(0.30,1.0,vH);                        // 아래 짙고 위 풀림
    vert=mix(vert,1.0-smoothstep(0.55,1.0,vH),uEdge);              // 경계는 더 높이
    float a=uAlpha*vert*(0.42+0.44*n)*(0.86+0.14*g);
    a*=mix(1.0,0.34,uThin);
    vec3 col=mix(vec3(0.34,0.38,0.42),vec3(0.48,0.47,0.55),n);
    col+=vec3(0.10,0.08,0.16)*uEdge*smoothstep(0.4,1.0,vH)*n;      // 경계 상단의 희미한 보라 기운
    gl_FragColor=vec4(col,a);
  }`;
const ashMats=[];
function makeAshMat(edge){
  const m=new THREE.ShaderMaterial({vertexShader:ashVert,fragmentShader:ashFrag,
    transparent:true,depthWrite:false,
    uniforms:{uTime:{value:0},uAlpha:{value:1},uThin:{value:0},uEdge:{value:edge?1:0}}});
  ashMats.push(m);return m;
}
// 세계 경계: 못 가는 이유를 침묵의 벽이 아니라 장막의 밀도로 말한다
{
  const H=17,D=10,L=GRID*CELL+D*2;
  [[0,-(HALF+D/2),L,D],[0,HALF+D/2,L,D],[-(HALF+D/2),0,D,GRID*CELL],[HALF+D/2,0,D,GRID*CELL]]
  .forEach(([x,z,w,d])=>{
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,H,d),makeAshMat(true));
    m.position.set(x,H/2-2,z);scene.add(m);
  });
}

// ---------- 셀 생성 (구조층 + 표면층) ----------
function shade(rng,base,amt){const c=new THREE.Color(base);
  c.offsetHSL(0,(rng()-0.5)*0.02,(rng()-0.5)*amt);return c}

// 기복 위에 눕는 판: 회전을 굽고 정점 y를 지형에 맞춘다
function terrainPlane(w,d,segs,wx,wz,lift){
  const geo=new THREE.PlaneGeometry(w,d,segs,segs);
  geo.rotateX(-Math.PI/2);
  const pos=geo.attributes.position;
  for(let i=0;i<pos.count;i++){
    pos.setY(i,groundH(wx+pos.getX(i),wz+pos.getZ(i))+lift);
  }
  geo.computeVertexNormals();
  return geo;
}

function buildCell(cx,cz){
  const c=cells[cx][cz], p=cellCenter(cx,cz);
  const rng=mulberry32(hash2(SEED,cx,cz));
  c.hasRoad=(roadCols[cz]===cx);

  // 바닥
  const g=new THREE.Mesh(terrainPlane(CELL-0.4,CELL-0.4,8,p.x,p.z,0),
        new THREE.MeshLambertMaterial({color:prismColor(cx,cz,0.86)}));
  g.position.set(p.x,0,p.z);scene.add(g);c.ground=g;

  if(c.hasRoad){const rd=new THREE.Mesh(terrainPlane(6,CELL,8,p.x,p.z,0.05),
        new THREE.MeshLambertMaterial({color:prismRoad(cx,cz)}));
    rd.position.set(p.x,0,p.z);scene.add(rd);c.roadMesh=rd;}

  // 오브젝트 그룹
  const grp=new THREE.Group();grp.position.set(p.x,0,p.z);grp.visible=false;
  let n=c.hasRoad?2+Math.floor(rng()*2):4+Math.floor(rng()*5);
  let hasBig=false;
  const put=(mesh,ox,oz)=>{mesh.position.x=ox;mesh.position.z=oz;
    mesh.position.y+=groundH(p.x+ox,p.z+oz);
    mesh.userData.origMat=mesh.material;mesh.material=ghostMat;grp.add(mesh)};
  for(let i=0;i<n;i++){
    let ox=(rng()-0.5)*CELL*0.84, oz=(rng()-0.5)*CELL*0.84;
    if(c.hasRoad&&Math.abs(ox)<4){ox+=ox<0?-5:5;}
    const t=rng();
    if(t<0.48){ // 자작나무 — 흰 수피와 가는 회색 가지
      const h=3.2+rng()*3.6;
      const tr=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.16+rng()*0.08,h,5),
            new THREE.MeshLambertMaterial({color:shade(rng,0xe9ece8,0.08)}));
      tr.position.y=h/2;put(tr,ox,oz);
      const barkTint=prismColor(cx,cz,0.58);
      const br=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.05,1+rng()*1.2,4),
            new THREE.MeshLambertMaterial({color:barkTint}));
      br.position.y=h*0.72;br.rotation.z=0.6+rng()*0.9;br.rotation.y=rng()*6.28;put(br,ox,oz);
    }else if(t<0.70){ // 눈 덮인 바위
      const r=new THREE.Mesh(new THREE.DodecahedronGeometry(0.5+rng()*0.9,0),
            new THREE.MeshLambertMaterial({color:prismColor(cx,cz,0.62)}));
      r.scale.y=0.55+rng()*0.3;r.rotation.y=rng()*6.28;r.position.y=0.35;put(r,ox,oz);
    }else if(t<0.88){ // 폐허 벽
      const h=1+rng()*2.2, len=2+rng()*3;
      const w=new THREE.Mesh(new THREE.BoxGeometry(0.35,h,len),
            new THREE.MeshLambertMaterial({color:shade(rng,0x8e989e,0.07)}));
      w.position.y=h/2;w.rotation.y=rng()*6.28;put(w,ox,oz);
    }else if(t<0.95&&!hasBig){ // 구조물 파편
      hasBig=true;const h=5+rng()*5;
      const b=new THREE.Mesh(new THREE.BoxGeometry(3+rng()*2,h,3+rng()*2),
            new THREE.MeshLambertMaterial({color:shade(rng,0x87939a,0.06)}));
      b.position.y=h/2;put(b,ox,oz);
    }else{ // 보라 앵커 — L2의 언어
      const a=new THREE.Mesh(new THREE.OctahedronGeometry(0.34,0),
            new THREE.MeshBasicMaterial({color:PRISM[(cx+cz)%PRISM.length]}));
      a.position.y=0.55;a.userData.anchor=true;put(a,ox,oz);
    }
  }
  // 표본 ②: 렌즈 속에서 표본만 제 색을 유지한다 — 촬영은 선명하게 할 뿐
  for(const sp of SPECIMENS){
    if(sp.cx===cx&&sp.cz===cz){
      if(sp.stationLocked)continue; // 관측소 창문 전용 디테일은 랜드마크 빌더가 만든다.
      const m=buildSpecimenMesh(sp,rng);
      m.position.set(sp.x-p.x,groundH(sp.x,sp.z),sp.z-p.z);
      grp.add(m);sp.mesh=m;
      const mk=new THREE.Mesh(new THREE.OctahedronGeometry(0.12,0),
            new THREE.MeshBasicMaterial({color:0xa794ff,transparent:true,opacity:0}));
      mk.position.set(sp.x-p.x,groundH(sp.x,sp.z)+1.5,sp.z-p.z);
      grp.add(mk);sp.mark=mk;
    }
  }
  scene.add(grp);c.group=grp;

  // 미현상 장막 ④
  const ash=new THREE.Mesh(new THREE.BoxGeometry(CELL,11,CELL),makeAshMat(false));
  ash.position.set(p.x,5.5+groundH(p.x,p.z)-0.6,p.z);scene.add(ash);
  c.ash=ash;c.ashU=ash.material.uniforms;
}

// 표본 실물: 계층마다 손에 잡히는 크기의 작은 물건 — L2만 보라의 기미
function buildSpecimenMesh(sp,rng){
  const g=new THREE.Group();
  const inkA=new THREE.MeshLambertMaterial({color:0x3a3844});
  const inkB=new THREE.MeshLambertMaterial({color:0x4a4656});
  const vio =new THREE.MeshLambertMaterial({color:0x6f639e});
  const vioB=new THREE.MeshBasicMaterial({color:0x8b7bb8});
  const add=(m,x,y,z,ry)=>{m.position.set(x,y,z);if(ry)m.rotation.y=ry;g.add(m);return m};
  switch(sp.id){
    case 'bus':{ // 기둥 + 기운 시간표 판
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.06,2.1,5),inkA),0,1.05,0);
      const b=add(new THREE.Mesh(new THREE.BoxGeometry(0.7,0.5,0.04),inkB),0,1.7,0.05);
      b.rotation.x=-0.12;break;}
    case 'notice1':{ // 벽 조각에 붙은 공고
      add(new THREE.Mesh(new THREE.BoxGeometry(1.3,1.5,0.28),inkA),0,0.75,0,rng()*6.28);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.5,0.68,0.02),inkB),0,0.95,0.16);break;}
    case 'fmap':{ // 바닥의 접힌 지도
      const a=add(new THREE.Mesh(new THREE.BoxGeometry(0.55,0.02,0.4),inkB),0,0.06,0);
      a.rotation.z=0.14;
      const b=add(new THREE.Mesh(new THREE.BoxGeometry(0.55,0.02,0.4),inkB),0.26,0.11,0);
      b.rotation.z=-0.5;break;}
    case 'notice2':{ // 찢어진 두 조각
      const a=add(new THREE.Mesh(new THREE.BoxGeometry(0.42,0.55,0.02),inkB),0,0.6,0);
      a.rotation.z=0.2;
      add(new THREE.Mesh(new THREE.BoxGeometry(0.3,0.24,0.02),inkB),0.28,0.05,0.1,0.9);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.05,1.2,4),inkA),0,0.28,-0.05);break;}
    case 'table':{ // 낮은 식탁 + 세 그릇
      add(new THREE.Mesh(new THREE.BoxGeometry(1.2,0.08,0.7),inkA),0,0.5,0);
      [[-0.32,0],[0.05,0.12],[0.36,-0.08]].forEach(o=>
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.07,0.09,7),inkB),o[0],0.58,o[1]));
      break;}
    case 'meds':{ // 뚜껑 열린 배급함
      add(new THREE.Mesh(new THREE.BoxGeometry(0.6,0.34,0.42),inkA),0,0.17,0);
      const lid=add(new THREE.Mesh(new THREE.BoxGeometry(0.6,0.03,0.42),inkB),0,0.42,-0.26);
      lid.rotation.x=-1.9;break;}
    case 'case':{ // 카메라 케이스 — 어깨끈이 흘러내린 채
      add(new THREE.Mesh(new THREE.BoxGeometry(0.5,0.36,0.3),vio),0,0.2,0,0.5);
      const st=add(new THREE.Mesh(new THREE.BoxGeometry(0.05,0.02,0.9),vio),0.2,0.05,0.35,0.4);
      st.rotation.z=0.1;break;}
    case 'note':{ // 반쯤 열린 수첩
      add(new THREE.Mesh(new THREE.BoxGeometry(0.34,0.03,0.46),vio),0,0.05,0);
      const p2=add(new THREE.Mesh(new THREE.BoxGeometry(0.34,0.02,0.46),vio),-0.14,0.13,0);
      p2.rotation.z=0.75;break;}
    case 'mirror':{ // 바위에 기댄 거울 조각 — 하늘만 비친다
      add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.4,0),inkA),0,0.26,-0.15).scale.y=0.6;
      const sh=add(new THREE.Mesh(new THREE.PlaneGeometry(0.5,0.7),
        new THREE.MeshBasicMaterial({color:0x9c93c9,side:THREE.DoubleSide})),0,0.42,0.14);
      sh.rotation.x=-0.35;sh.rotation.z=0.2;break;}
  }
  if(sp.tier===2){ // L2의 기미: 아주 작은 보라 파편이 곁에
    add(new THREE.Mesh(new THREE.OctahedronGeometry(0.07,0),vioB),0.4,0.09,0.28);
  }
  g.userData.specimen=sp.id;
  return g;
}

for(let cx=0;cx<GRID;cx++)for(let cz=0;cz<GRID;cz++)buildCell(cx,cz);

// 인화실 (원점 — 지형 평탄 구역)
{const dk=new THREE.Group();
 const pmat=new THREE.MeshLambertMaterial({color:0x66737a});
 [[-2,-2],[2,-2],[-2,2],[2,2]].forEach(o=>{
   const pl=new THREE.Mesh(new THREE.BoxGeometry(0.3,4,0.3),pmat);
   pl.position.set(o[0],2,o[1]);dk.add(pl);});
 const beam=new THREE.Mesh(new THREE.BoxGeometry(4.6,0.25,4.6),pmat);
 beam.position.y=4;dk.add(beam);
 const lamp=new THREE.Mesh(new THREE.OctahedronGeometry(0.3,0),
       new THREE.MeshBasicMaterial({color:0xa794ff}));
 lamp.position.y=3.1;dk.add(lamp);
 const pl=new THREE.PointLight(0xa794ff,0.9,34);pl.position.y=3.1;dk.add(pl);
 scene.add(dk);}

// ---------- 환경 랜드마크: 이전 Breathe 프로토타입의 파사드/설산 문법을 선택 이식 ----------
const solidZones=[];
function buildFieldStation(){
  const g=new THREE.Group(), x=STATION_X, z=STATION_Z, gy=groundH(x,z);
  const wall=new THREE.MeshLambertMaterial({color:0xa9b8c8});
  const trim=new THREE.MeshLambertMaterial({color:0xf0ecff});
  const dark=new THREE.MeshLambertMaterial({color:0x586185});
  const windowCols=[0x62d9e6,0xffd36a,0xed8fd0];
  const body=new THREE.Mesh(new THREE.BoxGeometry(9,4.8,7),wall);body.position.y=2.4;g.add(body);
  const roof=new THREE.Mesh(new THREE.ConeGeometry(6.15,2.3,4),dark);
  roof.position.y=6;roof.rotation.y=Math.PI/4;roof.scale.z=0.82;g.add(roof);
  const cap=new THREE.Mesh(new THREE.BoxGeometry(9.3,0.18,7.3),trim);cap.position.y=4.82;g.add(cap);
  [-2.6,0,2.6].forEach((wx,i)=>{
    const winMat=new THREE.MeshLambertMaterial({color:windowCols[i],emissive:windowCols[i],emissiveIntensity:0.72});
    const win=new THREE.Mesh(new THREE.PlaneGeometry(1.25,1.35),winMat);
    win.position.set(wx,2.65,3.506);g.add(win);
  });
  // 현상 전에는 없는 것이 아니라 잠상으로 숨어 있다. 현상 완료 뒤 중앙 창에만 떠오른다.
  const detail=new THREE.Group();detail.visible=false;
  const tableMat=new THREE.MeshBasicMaterial({color:0x342f3c});
  const bowlMat=new THREE.MeshBasicMaterial({color:0xfff0c4});
  const tableSurface=new THREE.Mesh(new THREE.BoxGeometry(1.02,0.09,0.05),tableMat);
  tableSurface.position.set(0,2.38,3.526);detail.add(tableSurface);
  [-0.32,0,0.32].forEach((bx,i)=>{
    const bowl=new THREE.Mesh(new THREE.CircleGeometry(0.105,12),bowlMat);
    bowl.position.set(bx,2.55+(i===1?0.025:0),3.535);detail.add(bowl);
  });
  const mk=new THREE.Mesh(new THREE.OctahedronGeometry(0.12,0),
    new THREE.MeshBasicMaterial({color:0xa794ff,transparent:true,opacity:0}));
  mk.position.set(0,1.25,3.82);g.add(mk);
  g.add(detail);stationLoop.detail=detail;stationSpec.mesh=detail;stationSpec.mark=mk;
  const door=new THREE.Mesh(new THREE.PlaneGeometry(1.45,2.65),dark);
  door.position.set(0,1.38,-3.506);door.rotation.y=Math.PI;g.add(door);
  const chimney=new THREE.Mesh(new THREE.BoxGeometry(0.65,2.5,0.65),dark);
  chimney.position.set(2.6,6.3,-0.8);g.add(chimney);
  g.position.set(x,gy,z);scene.add(g);
  solidZones.push({x,z,hx:4.9,hz:3.9});
}
function buildRiverAndHorizon(){
  const verts=[],cols=[],idx=[],steps=48;
  for(let i=0;i<=steps;i++){
    const z=-HALF+i*(HALF*2/steps), cx=42+Math.sin(z*0.027)*12, w=4.1+1.3*Math.sin(i*0.63);
    for(const side of [-1,1]){
      const x=cx+side*w, col=new THREE.Color();col.setHSL((0.52+i/steps*0.38+(side>0?0.04:0))%1,0.58,0.73);
      verts.push(x,groundH(x,z)+1.05,z);cols.push(col.r,col.g,col.b);
    }
    if(i<steps){const a=i*2;idx.push(a,a+2,a+1,a+1,a+2,a+3);}
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));geo.setIndex(idx);geo.computeVertexNormals();
  const water=new THREE.Mesh(geo,new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true,transparent:true,opacity:0.78,side:THREE.DoubleSide}));
  scene.add(water);
  const rock=new THREE.MeshLambertMaterial({color:0x7d8b93});
  const snow=new THREE.MeshLambertMaterial({color:0xe9eff1});
  for(let i=0;i<9;i++){
    const x=-HALF+14+i*(HALF*2-28)/8, h=22+7*Math.sin(i*1.7+1), r=18+4*Math.sin(i*2.1);
    const m=new THREE.Mesh(new THREE.ConeGeometry(r,h,7),rock);m.position.set(x,h/2-2,-HALF-18);m.rotation.y=i;scene.add(m);
    const c=new THREE.Mesh(new THREE.ConeGeometry(r*0.42,h*0.3,7),snow);c.position.set(x,h-3,-HALF-18);c.rotation.y=i;scene.add(c);
  }
  for(let i=0;i<13;i++){
    const z=-HALF+15+i*(HALF*1.15/12), h=7+(i%3)*2.5;
    const b=new THREE.Mesh(new THREE.DodecahedronGeometry(5+(i%4),0),rock);
    b.scale.set(1.1,h/6,0.65);b.position.set(-HALF+7,groundH(-HALF+7,z)+h*0.35,z);scene.add(b);
  }
  // 무지개를 지면에 칠하지 않고, 저채도 오로라 막으로 겹쳐 필름 할레이션처럼 보이게 한다.
  for(let i=0;i<6;i++){
    const ag=new THREE.PlaneGeometry(76,7.5,18,1),pos=ag.attributes.position;
    for(let v=0;v<pos.count;v++)pos.setY(v,pos.getY(v)+Math.sin(pos.getX(v)*0.075+i*0.9)*2.4);
    const aurora=new THREE.Mesh(ag,new THREE.MeshBasicMaterial({color:PRISM[i],transparent:true,
      opacity:0.105,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
    aurora.position.set(-48+i*19,23+i*1.6,-HALF-10-i*0.7);aurora.rotation.z=-0.08+i*0.025;scene.add(aurora);
  }
}
buildFieldStation();
buildRiverAndHorizon();

// ---------- 현상 맥동 ① ----------
// 셔터가 예약한 셀은 재 너머에서 보라로 맥동한다 — 귀로가 기다림의 방향이 된다.
const pulseGeo=new THREE.CylinderGeometry(0.35,0.55,9,6,1,true);
function addPulse(cx,cz){
  const c=cells[cx][cz];if(c.pulse)return;
  const p=cellCenter(cx,cz);
  const m=new THREE.Mesh(pulseGeo,new THREE.MeshBasicMaterial({color:PRISM[(cx*3+cz)%PRISM.length],
    transparent:true,opacity:0.14,depthWrite:false,side:THREE.DoubleSide}));
  m.position.set(p.x,groundH(p.x,p.z)+4.5,p.z);m.renderOrder=5;
  scene.add(m);c.pulse=m;
}
function removePulse(cx,cz){
  const c=cells[cx][cz];if(!c.pulse)return;
  scene.remove(c.pulse);c.pulse.material.dispose();c.pulse=null;
}

// ---------- 셀 확정 ----------
const revealAnims=[];
function fixCell(cx,cz,byName,byIdOrNull,animate,photo){
  const c=cells[cx][cz];if(c.state==='fixed')return;
  c.state='fixed';c.by=byName;if(photo)c.photo=photo;
  c.group.visible=true;
  removePulse(cx,cz);
  c.group.traverse(m=>{if(m.isMesh&&m.userData.origMat){
    const mat=m.userData.origMat;m.material=mat;
    if(animate){mat.transparent=true;mat.opacity=0;
      revealAnims.push({mat,t:0,dur:2.4});}
  }});
  if(animate){revealAnims.push({ashU:c.ashU,ash:c.ash,t:0,dur:2.8});}
  else{c.ash.visible=false;}
  c.ground.material.color.copy(prismColor(cx,cz,0.72));
  if(c.roadMesh)c.roadMesh.material.color.copy(prismRoad(cx,cz));
}
function sharpenCell(cx,cz,img){
  const c=cells[cx][cz];if(c.state!=='fixed')return false;
  const before=c.clarity||0;c.clarity=Math.min(3,before+1);if(img)c.photo=img;
  const mix=[0.72,0.48,0.25,0.08][c.clarity];
  const raw=new THREE.Color(VIVID[hash2(SEED^0x4f2d,cx,cz)%VIVID.length]);
  c.ground.material.color.copy(raw.clone().lerp(snowWhite,mix));
  c.ground.material.emissive.copy(raw);c.ground.material.emissiveIntensity=0.025*c.clarity;
  if(c.roadMesh){c.roadMesh.material.color.copy(raw.clone().lerp(roadGrey,Math.max(0.28,0.72-c.clarity*0.14)));}
  if(c.clarity>before)c.group.traverse(m=>{if(m.isMesh&&m.material&&m.material.color&&m.material!==ghostMat){
    m.material.color.offsetHSL(0,0.09,0.012);m.material.needsUpdate=true;
  }});
  return c.clarity>before;
}
// 중앙 4셀 = 시작 현실
{const q=GRID/2;[[q-1,q-1],[q-1,q],[q,q-1],[q,q]].forEach(([a,b])=>fixCell(a,b,'—',null,false,null));}

// ---------- 조작 ----------
const isTouch=matchMedia('(pointer: coarse)').matches||/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||('ontouchstart'in window);
let camMode=false, mapOpen=false, specOpen=false;
const keys={};
addEventListener('keydown',e=>{keys[e.code]=true;
  if(e.code==='KeyC')toggleCam();
  if(e.code==='KeyM')toggleMap();
  if(e.code==='Escape'&&mapOpen)toggleMap();
  if(e.code==='KeyE')tryConfirm();
  if(e.code==='Space'&&camMode){e.preventDefault();shutter();}});
addEventListener('keyup',e=>keys[e.code]=false);
addEventListener('contextmenu',e=>e.preventDefault());

renderer.domElement.addEventListener('click',()=>{
  if(isTouch)return;
  if(document.pointerLockElement!==renderer.domElement){renderer.domElement.requestPointerLock();return;}
  if(camMode)shutter();
});
addEventListener('mousemove',e=>{
  if(document.pointerLockElement!==renderer.domElement)return;
  player.yaw-=e.movementX*0.0022;
  player.pitch=clamp(player.pitch-e.movementY*0.0022,-1.32,1.32);
});
addEventListener('mousedown',e=>{if(e.button===2&&!isTouch){camMode=false;toggleCam();}});
addEventListener('mouseup',e=>{if(e.button===2&&!isTouch&&camMode){toggleCam();}});

// 터치: 좌측 조이스틱 + 우측 시점
const joy={active:false,id:null,ox:0,oy:0,dx:0,dy:0};
let lookId=null,lookX=0,lookY=0;
const joyBase=document.getElementById('joyBase'),joyNub=document.getElementById('joyNub');
if(isTouch){
  document.getElementById('joy').style.display='block';
  document.getElementById('hint').textContent='왼쪽: 이동 · 오른쪽: 시점 · 카메라 → 셔터 · 표본 앞에서 확인';
  addEventListener('touchstart',e=>{for(const t of e.changedTouches){
    if(t.target.closest('.btn')||t.target.closest('#mapOv')||t.target.closest('#photoPanel')||t.target.closest('#specPanel'))continue;
    if(t.clientX<innerWidth*0.45&&joy.id===null){
      joy.id=t.identifier;joy.ox=t.clientX;joy.oy=t.clientY;joy.dx=joy.dy=0;
      joyBase.style.display=joyNub.style.display='block';
      joyBase.style.left=(t.clientX-42)+'px';joyBase.style.setProperty('to'+'p',(t.clientY-42)+'px');
      joyNub.style.left=(t.clientX-17)+'px';joyNub.style.setProperty('to'+'p',(t.clientY-17)+'px');
    }else if(lookId===null){lookId=t.identifier;lookX=t.clientX;lookY=t.clientY;}
  }},{passive:true});
  addEventListener('touchmove',e=>{for(const t of e.changedTouches){
    if(t.identifier===joy.id){
      joy.dx=clamp((t.clientX-joy.ox)/44,-1,1);joy.dy=clamp((t.clientY-joy.oy)/44,-1,1);
      joyNub.style.left=(joy.ox+joy.dx*30-17)+'px';joyNub.style.setProperty('to'+'p',(joy.oy+joy.dy*30-17)+'px');
    }else if(t.identifier===lookId){
      player.yaw-=(t.clientX-lookX)*0.004;
      player.pitch=clamp(player.pitch-(t.clientY-lookY)*0.004,-1.32,1.32);
      lookX=t.clientX;lookY=t.clientY;
    }}},{passive:true});
  addEventListener('touchend',e=>{for(const t of e.changedTouches){
    if(t.identifier===joy.id){joy.id=null;joy.dx=joy.dy=0;
      joyBase.style.display=joyNub.style.display='none';}
    if(t.identifier===lookId)lookId=null;
  }},{passive:true});
}

function canStand(x,z){const c=cellAt(x,z);
  if(!c||cells[c.cx][c.cz].state!=='fixed')return false;
  for(const s of solidZones)if(Math.abs(x-s.x)<s.hx&&Math.abs(z-s.z)<s.hz)return false;
  return true;}

// 경계 접촉 ④: 막힌 방향으로 밀면 시야 가장자리로 재가 밀려든다
const edgeVeil=document.getElementById('edgeVeil');
let veilT=0,veilSubN=0,lastVeil=0;
function pushVeil(now){
  veilT=0.55;
  if(veilSubN<2&&now-lastVeil>6000){veilSubN++;lastVeil=now;
    showSub('이 너머는 아직 확정되지 않았다');}
}

// ---------- 오디오 (공개 안전판) ----------
/*
  원본 프로토타입의 외부 MP3는 정확한 제작자·원본 URL·라이선스를
  복구하지 못해 공개 배포에서 제외했다. 셔터음은 Web Audio로 로컬 합성하며,
  호흡은 시각 효과만 유지한다. 네트워크 요청이나 사용자 녹음은 사용하지 않는다.
*/
const SHUTTER_TAKES=[
  {captureAt:0.18,releaseAt:0.42},
  {captureAt:0.22,releaseAt:0.48},
  {captureAt:0.16,releaseAt:0.40},
  {captureAt:0.20,releaseAt:0.45}
];
let actx=null,audioPrimed=false;
function getAudioContext(){
  try{
    actx=actx||new (window.AudioContext||window.webkitAudioContext)();
    if(actx.state==='suspended')actx.resume().catch(()=>{});
    return actx;
  }catch(e){return null}
}
function primeAudio(){if(audioPrimed)return;audioPrimed=true;getAudioContext();}
addEventListener('pointerdown',primeAudio,{once:true});
addEventListener('touchstart',primeAudio,{once:true});
addEventListener('keydown',primeAudio,{once:true});
function clickBurst(ctx,at,duration,gainValue,highpass){
  const frames=Math.max(1,Math.floor(ctx.sampleRate*duration));
  const buffer=ctx.createBuffer(1,frames,ctx.sampleRate),data=buffer.getChannelData(0);
  for(let i=0;i<frames;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/frames,2.8);
  const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
  source.buffer=buffer;filter.type='highpass';filter.frequency.value=highpass;
  gain.gain.setValueAtTime(gainValue,at);gain.gain.exponentialRampToValueAtTime(0.0001,at+duration);
  source.connect(filter).connect(gain).connect(ctx.destination);source.start(at);source.stop(at+duration);
}
function playShutterTake(take){
  const ctx=getAudioContext();if(!ctx)return;
  const t=ctx.currentTime+0.015;
  const motor=ctx.createOscillator(),motorGain=ctx.createGain();
  motor.type='triangle';motor.frequency.setValueAtTime(92,t);motor.frequency.exponentialRampToValueAtTime(58,t+take.captureAt);
  motorGain.gain.setValueAtTime(0.0001,t);motorGain.gain.exponentialRampToValueAtTime(0.026,t+0.025);
  motorGain.gain.exponentialRampToValueAtTime(0.0001,t+take.captureAt);
  motor.connect(motorGain).connect(ctx.destination);motor.start(t);motor.stop(t+take.captureAt+0.02);
  clickBurst(ctx,t+take.captureAt,0.052,0.16,1100);
  clickBurst(ctx,t+take.releaseAt,0.035,0.075,760);
}
function playIdleBreath(){/* 권리 미확인 음성 대신 시각적 입김만 유지 */}

// ---------- 카메라 모드 ----------
const vf=document.getElementById('vf'),grainEl=document.getElementById('grain'),
      btnShut=document.getElementById('btnShut');
let firstCam=true;
function toggleCam(){camMode=!camMode;
  vf.classList.toggle('on',camMode);grainEl.classList.toggle('on',camMode);
  btnShut.classList.toggle('on',camMode&&isTouch);
  if(camMode&&firstCam){firstCam=false;showSub('렌즈 속에서만, 세계의 후보가 보인다');}
}
document.getElementById('btnCam').addEventListener('click',toggleCam);
document.getElementById('btnShut').addEventListener('click',()=>{if(camMode)shutter();});

// ---------- 커버리지 판정: 화면 투영 + 지형 시야 차폐 + 전방 깊이 ----------
const _v=new THREE.Vector3(),_centerV=new THREE.Vector3();
function terrainVisible(wx,wy,wz){
  const sx=camera.position.x,sy=camera.position.y,sz=camera.position.z;
  const dx=wx-sx,dz=wz-sz,dy=wy-sy,dist=Math.hypot(dx,dz);
  const steps=Math.max(2,Math.ceil(dist/5));
  // 카메라와 피사체 사이를 행진한다. 중간 지형이 시선보다 높으면 언덕 뒤에 가려진 것이다.
  for(let i=1;i<steps;i++){
    const t=i/steps,x=sx+dx*t,z=sz+dz*t,rayY=sy+dy*t;
    if(groundH(x,z)+0.28>rayY)return false;
  }
  return true;
}
function coverage(cx,cz){
  const p=cellCenter(cx,cz);
  const dx=p.x-player.x,dz=p.z-player.z,dist=Math.hypot(dx,dz);
  const fwdX=-Math.sin(player.yaw),fwdZ=-Math.cos(player.yaw);
  const forward=dx*fwdX+dz*fwdZ;
  const lateral=dx*Math.cos(player.yaw)-dz*Math.sin(player.yaw);
  if(dist>RANGE||forward<=0.15)return{frac:0,dist,forward,lateral,centerIn:false,nearAhead:false};
  const centerY=groundH(p.x,p.z)+1.5;
  const centerVisible=terrainVisible(p.x,centerY,p.z);
  _centerV.set(p.x,centerY,p.z).applyMatrix4(camera.matrixWorldInverse);
  let centerIn=false;
  if(centerVisible&&_centerV.z<-.15){_centerV.applyMatrix4(camera.projectionMatrix);centerIn=Math.abs(_centerV.x)<=0.96&&Math.abs(_centerV.y)<=0.96;}
  const probe=cellAt(player.x+fwdX*Math.min(5,forward),player.z+fwdZ*Math.min(5,forward));
  const nearAhead=!!probe&&probe.cx===cx&&probe.cz===cz;
  let inF=0,total=0;
  const pts=[];
  for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){
    const px=p.x+i*CELL*0.42,pz=p.z+j*CELL*0.42;
    pts.push([px,groundH(px,pz)+0.2,pz]);
  }
  [[-0.42,-0.42],[0.42,-0.42],[-0.42,0.42],[0.42,0.42]].forEach(o=>{
    const px=p.x+o[0]*CELL,pz=p.z+o[1]*CELL;
    pts.push([px,groundH(px,pz)+6,pz]);
  });
  for(const pt of pts){total++;
    _v.set(pt[0],pt[1],pt[2]).applyMatrix4(camera.matrixWorldInverse);
    if(_v.z>-0.15)continue;
    _v.applyMatrix4(camera.projectionMatrix);
    if(Math.abs(_v.x)<=0.86&&Math.abs(_v.y)<=0.86&&terrainVisible(pt[0],pt[1],pt[2]))inF++;
  }
  return{frac:inF/total,dist,forward,lateral,centerIn,nearAhead};
}
function candidates(includeFixed){
  const out=[];
  for(let cx=0;cx<GRID;cx++)for(let cz=0;cz<GRID;cz++){
    const c=cells[cx][cz];if(!includeFixed&&c.state==='fixed')continue;
    const cov=coverage(cx,cz);
    const closeCell=cov.nearAhead||(cov.centerIn&&cov.forward<CELL*1.35);
    if(cov.frac>=COVER_MIN||closeCell)out.push({cx,cz,dist:cov.dist,forward:cov.forward,
      lateral:cov.lateral,state:c.state,mine:c.reservedBy===myId});
  }
  out.sort((a,b)=>(a.forward+Math.abs(a.lateral)*0.12)-(b.forward+Math.abs(b.lateral)*0.12));
  if(!out.length)return out;
  const front=Math.min(...out.map(c=>c.forward));
  // 벽에 붙었을 때도 바로 앞 셀 층을 먼저 소진하고, 그 뒤의 갈 수 없는 셀은 찍지 않는다.
  return out.filter(c=>c.forward<=front+CELL*0.72).sort((a,b)=>a.dist-b.dist);
}

// ---------- 셔터 ⑤ ----------
let film=FILM_MAX;
const handFilms=[];   // 미현상 필름
const queue=[];       // 인화 대기열 (순차)
let firstShot=true, cameraBusy=false, shutterIndex=0;

function snapshotWith(cam){
  try{
    renderer.render(scene,cam);
    const src=renderer.domElement;
    const w=320,h=Math.round(320*src.height/src.width);
    const cv=document.createElement('canvas');cv.width=w;cv.height=h;
    cv.getContext('2d').drawImage(src,0,0,w,h);
    return cv.toDataURL('image/jpeg',0.58);
  }catch(e){return null}
}
function snapshot(){return snapshotWith(camera)}
function snapshotAt(pose){
  if(!pose)return null;
  const pc=new THREE.PerspectiveCamera(pose.fov,pose.aspect,0.1,550);
  pc.position.set(pose.x,pose.y,pose.z);pc.rotation.order='YXZ';
  pc.rotation.y=pose.yaw;pc.rotation.x=pose.pitch;pc.updateMatrixWorld();
  return snapshotWith(pc);
}
function stationFramed(){
  if(stationLoop.developed)return false;
  const p=new THREE.Vector3(STATION_X,groundH(STATION_X,STATION_Z)+3.1,STATION_Z);
  const dist=p.distanceTo(camera.position);p.project(camera);
  return dist<82&&p.z>-1&&p.z<1&&Math.abs(p.x)<0.74&&Math.abs(p.y)<0.74;
}
function nextShutterTake(){
  let idx=0;
  if(shutterIndex===0)idx=0;                       // 첫 촬영은 첫 take 고정
  else idx=SHUTTER_TAKES.length>1?1+((shutterIndex-1)%(SHUTTER_TAKES.length-1)):0;
  shutterIndex++;
  return Object.assign({idx},SHUTTER_TAKES[idx]);
}
function shutter(){
  if(specOpen)return;
  if(cameraBusy)return;                              // 필름이 감기는 동안 다음 촬영 잠금
  const pending=candidates(false);
  const free=pending.filter(c=>c.state==='void').slice(0,MAX_CELLS_PER_SHOT);
  const fixed=candidates(true).filter(c=>c.state==='fixed').slice(0,MAX_CELLS_PER_SHOT);
  const mode=free.length?'develop':(fixed.length?'reinforce':null);
  const targets=mode==='develop'?free:fixed;
  if(!mode){
    const held=pending.some(c=>c.state==='developing');
    showSub(held?'바로 앞 셀은 이미 현상 중이다':'프레임 안에 촬영할 셀이 없다');return;
  }
  if(film<=0){showSub('필름이 없다 — 인화실에서 재장전');return;}
  film--;
  const now=Date.now(),cellRefs=[];let distSum=0;
  for(const f of targets){
    const c=cells[f.cx][f.cz];
    if(mode==='develop'){
      c.state='developing';c.reservedBy=myId;c.reservedTs=now;addPulse(f.cx,f.cz);
    }
    const p=cellCenter(f.cx,f.cz);distSum+=Math.hypot(p.x,p.z);
    cellRefs.push({cx:f.cx,cz:f.cz});
  }
  const stationShot=stationFramed();
  const filmRec={cells:cellRefs,img:null,dist:distSum/cellRefs.length,ts:now,mode,
    station:stationShot,pose:stationShot?{x:camera.position.x,y:camera.position.y,z:camera.position.z,
      yaw:player.yaw,pitch:player.pitch,fov:camera.fov,aspect:camera.aspect}:null};
  handFilms.push(filmRec);
  if(mode==='develop')post({type:'reserve',cells:cellRefs,id:myId,name:myName,ts:now});
  if(mapOpen)renderMap();
  const take=nextShutterTake();
  cameraBusy=true;
  playShutterTake(take);
  setTimeout(()=>{
    if(stationShot)filmRec.pose={x:camera.position.x,y:camera.position.y,z:camera.position.z,
      yaw:player.yaw,pitch:player.pitch,fov:camera.fov,aspect:camera.aspect};
    filmRec.img=snapshot();
    if(stationShot){stationLoop.shot=true;stationLoop.before=filmRec.img;}
    shutterBlink();
    const fl=document.getElementById('flash');
    fl.style.transition='none';fl.style.opacity='0.85';
    requestAnimationFrame(()=>{fl.style.transition='opacity .5s';fl.style.opacity='0';});
    if(stationShot){firstShot=false;showSub('관측소가 필름에 남았다 — 창문은 아직 평평하다');}
    else if(firstShot){firstShot=false;showSub(mode==='develop'?'관측되었다 — 아직 현실은 아니다':'이미 열린 장소를 다시 노출했다');}
    else showSub(mode==='develop'?(cellRefs.length+'칸 노출 — 미현상'):(cellRefs.length+'칸 재노출 — 인화하면 색이 깊어진다'));
    updateHud();
  },Math.max(0,take.captureAt*1000));
  setTimeout(()=>{cameraBusy=false;},Math.max(take.releaseAt*1000,take.captureAt*1000+160));
  updateHud();
}

// ---------- 인화실 ----------
function completeStationDevelopment(q){
  if(!q.station||stationLoop.developed)return false;
  stationLoop.developed=true;stationLoop.before=q.img||stationLoop.before;
  if(stationLoop.detail)stationLoop.detail.visible=true;
  stationLoop.developedImg=snapshotAt(q.pose)||stationLoop.before;
  const sc=cellAt(STATION_X,STATION_Z),c=cells[sc.cx][sc.cz];
  stationLoop.photoCell={cx:sc.cx,cz:sc.cz};
  c.photo=stationLoop.before;c.developedPhoto=stationLoop.developedImg;c.stationPhoto=true;
  showSub('확대 현상본의 창문 안에서 세 개의 그릇이 떠올랐다');
  if(mapOpen)renderMap();
  setTimeout(()=>openPhoto(c,sc.cx,sc.cz),420);
  return true;
}
let wasInDark=false;
function darkroomTick(now){
  const inDark=Math.hypot(player.x,player.z)<DARKROOM_R;
  if(inDark&&!wasInDark){
    if(film<FILM_MAX){film=FILM_MAX;showSub('필름 재장전');}
    if(handFilms.length){
      for(const f of handFilms){
        f.dur=(8+f.dist*0.08+f.cells.length*1.5)*1000;
        queue.push(f);
      }
      handFilms.length=0;
      showSub('인화 시작 — '+queue.length+'장 대기');
    }
  }
  wasInDark=inDark;
  // 순차 현상
  if(queue.length){
    const q=queue[0];
    if(!q.startT)q.startT=now;
    if(now-q.startT>=q.dur){
      queue.shift();
      if(q.mode==='reinforce'){
        let vividN=0;
        for(const cr of q.cells)if(sharpenCell(cr.cx,cr.cz,q.img))vividN++;
        if(vividN){
          const levels=q.cells.map(cr=>({cx:cr.cx,cz:cr.cz,clarity:cells[cr.cx][cr.cz].clarity}));
          post({type:'sharpen',cells:levels,id:myId,img:q.img,ts:Date.now()});
          showSub('재노출 현상 완료 — '+vividN+'칸의 색과 윤곽이 깊어졌다');
          if(mapOpen)renderMap();
        }else showSub('이 장소는 이미 최대 선명도다');
      }else{
        let fixedN=0,lostN=0;
        for(const cr of q.cells){
          const c=cells[cr.cx][cr.cz];
          if(c.state==='developing'&&c.reservedBy===myId){
            fixCell(cr.cx,cr.cz,myName,myId,true,q.img);fixedN++;
          }else lostN++;
        }
        if(fixedN){post({type:'fix',cells:q.cells.filter(cr=>cells[cr.cx][cr.cz].by===myName),
                         name:myName,id:myId,img:q.img,ts:Date.now()});
          showSub('현상 완료 — 세계가 '+fixedN+'칸 넓어졌다');if(mapOpen)renderMap();}
        if(lostN)showSub('겹친 '+lostN+'칸은 이미 다른 탐사자의 세계다');
      }
      completeStationDevelopment(q);
    }
  }
  updateHud(now);
}

// ---------- 탭 간 공유 ----------
let bc=null;
try{bc=new BroadcastChannel('photogenesis-0f-'+SEED);}catch(e){}
function post(m){if(bc)try{bc.postMessage(m)}catch(e){}}
if(bc)bc.onmessage=ev=>{
  const m=ev.data;if(!m||m.id===myId)return;
  if(m.type==='reserve'){
    for(const cr of m.cells){const c=cells[cr.cx][cr.cz];
      if(c.state==='void'){c.state='developing';c.reservedBy=m.id;c.reservedTs=m.ts;addPulse(cr.cx,cr.cz);}
      else if(c.state==='developing'&&c.reservedBy===myId&&m.ts<c.reservedTs){
        c.reservedBy=m.id;c.reservedTs=m.ts; // 먼저 예약한 쪽이 기준 사진
      }}
    if(mapOpen)renderMap();
  }else if(m.type==='fix'){
    let n=0;
    for(const cr of m.cells){const c=cells[cr.cx][cr.cz];
      if(c.state!=='fixed'){fixCell(cr.cx,cr.cz,m.name,m.id,true,m.img);n++;}}
    if(n){showSub(m.name+'의 사진이 현상되었다 — '+n+'칸');if(mapOpen)renderMap();}
  }else if(m.type==='sharpen'){
    let n=0;
    for(const cr of m.cells){const c=cells[cr.cx][cr.cz];
      while(c.state==='fixed'&&c.clarity<(cr.clarity||1)){if(!sharpenCell(cr.cx,cr.cz,m.img))break;n++;}}
    if(n){showSub('다른 탐사자의 재노출이 세계를 선명하게 했다');if(mapOpen)renderMap();}
  }
};

// ---------- 표본 확인 ② ----------
// 도감 진행은 세계가 아니라 탐사자의 것 — 확인은 이 탭에만 남는다 (열린 결정, 지금은 로컬).
const specPanel=document.getElementById('specPanel'),
      promptEl=document.getElementById('prompt'),
      btnConfirm=document.getElementById('btnConfirm');
let specTarget=null;
function nearestSpecimen(){
  let best=null,bd=2.6;
  for(const sp of SPECIMENS){
    if(sp.confirmed)continue;
    if(sp.stationLocked&&!stationLoop.pinned)continue;       // 현상본에 핀을 꽂은 뒤에만 재방문 목표가 된다
    if(cells[sp.cx][sp.cz].state!=='fixed')continue;   // 인화된 세계 안에서만 만질 수 있다
    const d=Math.hypot(sp.x-player.x,sp.z-player.z);
    if(d<bd){bd=d;best=sp;}
  }
  return best;
}
function tryConfirm(){
  if(specOpen){closeSpec();return;}
  if(mapOpen||camMode)return;
  const sp=specTarget;if(!sp)return;
  sp.confirmed=true;specDone++;
  if(sp.mark)sp.mark.material.opacity=0;
  if(sp.id==='table'&&!stationLoop.rewarded){
    stationLoop.rewarded=true;FILM_MAX+=1;film=FILM_MAX;
  }
  openSpecCard(sp);
  updateHud();
}
function openSpecCard(sp){
  specOpen=true;specPanel.classList.add('on');
  document.getElementById('specTier').textContent=TIER_NM[sp.tier];
  document.getElementById('specNm').textContent=sp.nm;
  const fill=(id,txt)=>{const el=document.getElementById(id);
    if(txt){el.textContent=txt;el.classList.remove('hold');}
    else{el.textContent='(proto0S 원문 병합 대기)';el.classList.add('hold');}};
  fill('specSee',sp.see);fill('specLog',sp.log);fill('specTrace',sp.trace);
  document.getElementById('specCount').innerHTML='등록 <em>'+specDone+'</em> / '+SPECIMENS.length+
    (sp.id==='table'&&stationLoop.rewarded?' · 필름 휴대량 <em>'+FILM_MAX+'</em>':'');
}
function closeSpec(){specOpen=false;specPanel.classList.remove('on');}
document.getElementById('specClose').addEventListener('click',closeSpec);
btnConfirm.addEventListener('click',tryConfirm);

// ---------- HUD ----------
const subEl=document.getElementById('sub');let subT=null;
function showSub(t){subEl.textContent=t;subEl.style.opacity='1';
  clearTimeout(subT);subT=setTimeout(()=>subEl.style.opacity='0',3800);}
document.getElementById('nameTag').innerHTML='<b>'+myName+'</b> · seed '+SEED;
const filmTag=document.getElementById('filmTag'),handTag=document.getElementById('handTag'),
      queueBox=document.getElementById('queueBox'),covTag=document.getElementById('covTag'),
      specTag=document.getElementById('specTag');
function updateHud(now){
  if(now===undefined)now=performance.now();
  filmTag.innerHTML='필름 <span class="dots">'+
    '●'.repeat(film)+'○'.repeat(FILM_MAX-film)+'</span>';
  specTag.innerHTML='표본 <em>'+specDone+'</em>/'+SPECIMENS.length;
  handTag.style.opacity=handFilms.length?'1':'0';
  if(handFilms.length)handTag.textContent='미현상 '+handFilms.length+'장 — 인화실로';
  let html='';
  queue.forEach((q,i)=>{
    const p=q.startT&&i===0?clamp((now-q.startT)/q.dur,0,1):0;
    const remain=q.startT&&i===0?Math.ceil((q.dur-(now-q.startT))/1000):Math.ceil(q.dur/1000);
    html+='<div class="qitem">'+(q.mode==='reinforce'?'재노출 현상':'현상 중')+' · '+q.cells.length+'칸 · '+remain+'s'+
          '<div class="bar"><i style="width:'+(p*100)+'%"></i></div></div>';
  });
  queueBox.innerHTML=html;
}
setTimeout(()=>{document.getElementById('hint').style.opacity='0'},12000);
showSub('화산재 너머는 아직 현실이 아니다');

// ---------- 지도: 이동을 막지 않는 실시간 탐색 계기판 ----------
const mapOv=document.getElementById('mapOv'),mapGrid=document.getElementById('mapGrid'),
      mapStatus=document.getElementById('mapStatus');
let mapMe=null,mapCellEls=[],mapSummary='';
function toggleMap(){mapOpen=!mapOpen;mapOv.classList.toggle('on',mapOpen);
  document.getElementById('btnMap').textContent=mapOpen?'지도 닫기':'지도';
  if(mapOpen)renderMap();}
document.getElementById('btnMap').addEventListener('click',toggleMap);
document.getElementById('mapClose').addEventListener('click',toggleMap);
function renderMap(){
  mapGrid.innerHTML='';mapCellEls=[];
  mapGrid.style.gridTemplateColumns='repeat('+GRID+',1fr)';
  let closed=0,developing=0,fixed=0,vivid=0;
  const here=cellAt(player.x,player.z);
  const stationCell=cellAt(STATION_X,STATION_Z);
  for(let cz=0;cz<GRID;cz++)for(let cx=0;cx<GRID;cx++){
    const c=cells[cx][cz];if(!mapCellEls[cx])mapCellEls[cx]=[];
    const d=document.createElement('div');d.className='mc';mapCellEls[cx][cz]=d;
    if(c.hasRoad)d.classList.add('road');
    if(stationCell&&cx===stationCell.cx&&cz===stationCell.cz){d.classList.add('station');d.title='관측소 (4,4)';}
    if(c.state==='void')closed++;
    if(c.state==='developing'){d.classList.add('dev');developing++;}
    if(c.state==='fixed'){d.classList.add('fix');fixed++;
      if(c.clarity>0){d.classList.add('vivid');vivid++;}
      if(c.by===myName)d.classList.add('mine');
      if(c.by&&c.by!=='—'){const w=document.createElement('span');
        w.className='who';w.textContent=c.by.slice(4);d.appendChild(w);}
      const sp=SPECIMENS.find(s=>s.cx===cx&&s.cz===cz&&(!s.stationLocked||stationLoop.developed));
      if(sp){const m=document.createElement('span');m.className='sp';
        m.textContent=sp.confirmed?'◆':(sp.stationLocked&&stationLoop.pinned?'!':'◇');d.appendChild(m);}
      if(c.photo){d.classList.add('photo');d.addEventListener('click',()=>openPhoto(c,cx,cz));}}
    if(here&&here.cx===cx&&here.cz===cz)d.classList.add('here');
    mapGrid.appendChild(d);
  }
  mapSummary='열림 '+fixed+' · 현상 '+developing+' · 닫힘 '+closed+(vivid?' · 재촬영 '+vivid:'');
  mapStatus.textContent='현재 '+(here?'('+here.cx+','+here.cz+')':'경계 밖')+' · 관측소 (4,4) · '+mapSummary;
  mapMe=document.createElement('div');mapMe.id='mapMe';mapGrid.appendChild(mapMe);updateMapMarker();
}
function updateMapMarker(){
  if(!mapOpen||!mapMe)return;
  mapMe.style.left=((player.x+HALF)/(GRID*CELL)*100)+'%';
  mapMe.style.setProperty('to'+'p',((player.z+HALF)/(GRID*CELL)*100)+'%');
  mapMe.style.transform='translate(-50%,-50%) rotate('+player.yaw+'rad)';
  const here=cellAt(player.x,player.z);
  mapStatus.textContent='현재 '+(here?'('+here.cx+','+here.cz+')':'경계 밖')+' · 관측소 (4,4) · '+mapSummary;
  for(const el of mapGrid.querySelectorAll('.mc.here'))el.classList.remove('here');
  if(here&&mapCellEls[here.cx]&&mapCellEls[here.cx][here.cz])mapCellEls[here.cx][here.cz].classList.add('here');
}
const photoPanel=document.getElementById('photoPanel'),
      photoDevelopedFrame=document.getElementById('photoDevelopedFrame'),
      photoDeveloped=document.getElementById('photoDeveloped'),
      photoPin=document.getElementById('photoPin');
function openPhoto(c,cx,cz){
  document.getElementById('photoImg').src=c.photo;
  const station=!!(c.stationPhoto&&stationLoop.developed);
  photoDevelopedFrame.classList.toggle('on',station);
  photoPin.classList.toggle('on',station&&!stationLoop.pinned&&!stationSpec.confirmed);
  if(station){
    photoDeveloped.src=c.developedPhoto||c.photo;
    document.getElementById('photoCap').innerHTML=
      '관측소 · <b>촬영 순간에는 없던 간격이 현상본에 남았다.</b>';
  }else{
    photoDeveloped.removeAttribute('src');
    document.getElementById('photoCap').innerHTML=
      '셀 ('+cx+','+cz+') · 최초 현상: <b>'+c.by+'</b>';
  }
  photoPanel.classList.add('on');
}
photoPin.addEventListener('click',()=>{
  if(!stationLoop.developed||stationLoop.pinned)return;
  stationLoop.pinned=true;photoPin.classList.remove('on');
  showSub('사진판에 핀을 꽂았다 — 관측소 중앙 창문으로 돌아가자');
  if(mapOpen)renderMap();
  setTimeout(()=>photoPanel.classList.remove('on'),320);
});
document.getElementById('photoClose').addEventListener('click',()=>photoPanel.classList.remove('on'));

// ---------- 입김 ⑤ (본편 이식) ----------
/* 숨은 상태를 가진다 — 피로(exert)와 필름의 무게가 호흡의 리듬·깊이·가시성을 지배한다.
   "보이지 않는 숨"도 한 번의 숨이다. 타이머는 돌되 김만 생략한다. */
const breathPuffs=[];let breathTimer=2.0,breathTex=null,exert=0;
function makeBreathTex(){
  const c=document.createElement('canvas');c.width=c.height=64;
  const x=c.getContext('2d');
  const g=x.createRadialGradient(32,32,2,32,32,30);
  g.addColorStop(0,'rgba(238,246,250,0.9)');
  g.addColorStop(0.5,'rgba(226,238,244,0.35)');
  g.addColorStop(1,'rgba(220,232,240,0)');
  x.fillStyle=g;x.fillRect(0,0,64,64);
  return new THREE.CanvasTexture(c);
}
function spawnBreath(power,life){
  breathTex=breathTex||makeBreathTex();
  const fwd=new THREE.Vector3(-Math.sin(player.yaw),0,-Math.cos(player.yaw));
  const n=power>0.7?4:power>0.4?3:2;
  for(let i=0;i<n;i++){
    const m=new THREE.SpriteMaterial({map:breathTex,transparent:true,opacity:0,
      color:0xe9f3f8,depthWrite:false});
    const s=new THREE.Sprite(m);
    s.position.copy(camera.position).addScaledVector(fwd,0.55+Math.random()*0.15);
    s.position.y-=0.18+Math.random()*0.06;
    s.position.x+=(Math.random()-0.5)*0.08;s.position.z+=(Math.random()-0.5)*0.08;
    s.scale.setScalar(0.07);
    s.userData={life:0,max:life*(0.85+Math.random()*0.3),power,
      delay:i*0.09,                                          // 날숨은 한 줄기로 이어진다
      vel:fwd.clone().multiplyScalar(0.35+power*0.55)
        .add(new THREE.Vector3((Math.random()-0.5)*0.18,
          0.22+power*0.28+Math.random()*0.1,(Math.random()-0.5)*0.18))};
    scene.add(s);breathPuffs.push(s);
  }
}
function updateBreath(dt,moving){
  // 피로: 걷는 동안 서서히, 서면 가라앉는다 · 미현상 필름은 어깨의 무게 ①
  exert=moving?Math.min(1,exert+dt*0.10):Math.max(0,exert-dt*0.16);
  const e=clamp(exert+handFilms.length*0.11,0,1);
  breathTimer-=dt;
  if(breathTimer<=0){
    let interval,life,power,skip;
    if(!moving&&e>0.15){              // 숨 고르기: 길고 깊게 — 피로만큼 크게
      interval=2.7-e*1.1; life=1.5+e*0.9;
      power=0.45+e*0.55;  skip=0.04;
    }else if(moving){                 // 걷기: 보통 숨
      interval=2.5-e*0.6; life=1.0+Math.random()*0.35;
      power=0.35+e*0.2;   skip=0.15;
    }else{                            // 평온: 드문드문, 이따금 서리지 않는 숨
      interval=3.4+Math.random()*0.8; life=1.1+Math.random()*0.4;
      power=0.3;          skip=0.15;
    }
    if(Math.random()>skip){
      spawnBreath(power,life);        // 생략돼도 숨은 쉬었다
      if(!moving&&!camMode)playIdleBreath(power);  // 렌즈를 들지 않았을 때만 숨소리를 붙인다
    }
    breathTimer=interval*(0.9+Math.random()*0.2);
  }
  for(let i=breathPuffs.length-1;i>=0;i--){
    const s=breathPuffs[i],u=s.userData;
    if(u.delay>0){u.delay-=dt;continue;}
    u.life+=dt;
    const k=u.life/u.max;
    if(k>=1){scene.remove(s);s.material.dispose();breathPuffs.splice(i,1);continue;}
    s.position.addScaledVector(u.vel,dt);
    u.vel.multiplyScalar(Math.max(0,1-dt*0.9));               // 찬 공기 속 감속
    s.scale.setScalar(0.10+k*(0.42+u.power*0.75));            // 깊은 숨일수록 크게 퍼진다
    const peak=0.38+u.power*0.30;
    s.material.opacity=k<0.15?(k/0.15)*peak:peak*(1-(k-0.15)/0.85);
  }
}

// ---------- 루프 ----------
let last=performance.now(),firstEnter=true,firstSpecNear=true;
function loop(now){
  requestAnimationFrame(loop);
  const dt=Math.min((now-last)/1000,0.05);last=now;

  // 이동
  let mx=0,mz=0,blocked=false;
  if(!specOpen){
    if(keys.KeyW||keys.ArrowUp)mz-=1; if(keys.KeyS||keys.ArrowDown)mz+=1;
    if(keys.KeyA||keys.ArrowLeft)mx-=1; if(keys.KeyD||keys.ArrowRight)mx+=1;
    if(joy.id!==null){mx=joy.dx;mz=joy.dy;}
  }
  const moving=!!(mx||mz);
  if(moving){
    const len=Math.hypot(mx,mz);mx/=len;mz/=len;
    const sp=9*dt*(camMode?0.55:1);
    const fX=-Math.sin(player.yaw),fZ=-Math.cos(player.yaw);
    const rX=Math.cos(player.yaw), rZ=-Math.sin(player.yaw);
    const nx=player.x+(fX*-mz+rX*mx)*sp;
    const nz=player.z+(fZ*-mz+rZ*mx)*sp;
    if(canStand(nx,nz)){
      const before=cellAt(player.x,player.z),after=cellAt(nx,nz);
      player.x=nx;player.z=nz;
      if(firstEnter&&after&&before&&(after.cx!==before.cx||after.cz!==before.cz)&&
         cells[after.cx][after.cz].by&&cells[after.cx][after.cz].by!=='—'){
        firstEnter=false;showSub('필름이 먼저 다녀간 곳이다');}
    }
    else if(canStand(nx,player.z)){player.x=nx;blocked=true;}
    else if(canStand(player.x,nz)){player.z=nz;blocked=true;}
    else blocked=true;
    if(blocked)pushVeil(now);
  }
  // 경계의 재: 밀 때 차오르고, 물러나면 가라앉는다
  veilT=Math.max(0,veilT-dt);
  edgeVeil.style.opacity=veilT>0?String(0.5+0.4*Math.sin(now*0.02)):'0';

  // 카메라
  camera.fov+=( (camMode?CAM_FOV:BASE_FOV)-camera.fov )*Math.min(dt*8,1);
  camera.updateProjectionMatrix();
  const gy=groundH(player.x,player.z)+player.h;
  camY+=(gy-camY)*Math.min(dt*10,1);
  camera.position.set(player.x,camY,player.z);
  camera.rotation.order='YXZ';
  camera.rotation.y=player.yaw;camera.rotation.x=player.pitch;
  camera.updateMatrixWorld();
  if(mapOpen)updateMapMarker();

  // 렌즈 노출: 미확정 셀 후보 표시 + 장막의 결
  for(const m of ashMats)m.uniforms.uTime.value=now*0.001;
  for(let cx=0;cx<GRID;cx++)for(let cz=0;cz<GRID;cz++){
    const c=cells[cx][cz];if(c.state==='fixed')continue;
    const p=cellCenter(cx,cz);
    const near=Math.hypot(p.x-player.x,p.z-player.z)<RANGE;
    c.group.visible=camMode&&near;
    c.ashU.uThin.value+=(((camMode&&near)?1:0)-c.ashU.uThin.value)*Math.min(dt*6,1);
  }
  if(camMode){
    ghostMat.opacity=0.26+0.08*Math.sin(now*0.013);
    const cand=candidates(false);
    const free=cand.filter(c=>c.state==='void').slice(0,MAX_CELLS_PER_SHOT).length;
    const held=cand.filter(c=>c.state==='developing').length;
    if(free)covTag.innerHTML='신규 포착 <em>'+free+'칸</em>'+(held?' · 현상 중 '+held:'');
    else{
      const fixed=candidates(true).filter(c=>c.state==='fixed').slice(0,MAX_CELLS_PER_SHOT).length;
      covTag.innerHTML=fixed?('재노출 <em>'+fixed+'칸</em> · 인화하면 선명도 상승'):(held?'바로 앞 셀 현상 중':'촬영 대상 없음');
    }
  }

  // 현상 맥동 ①: 재 너머에서 기다리는 셀
  for(let cx=0;cx<GRID;cx++)for(let cz=0;cz<GRID;cz++){
    const pu=cells[cx][cz].pulse;
    if(pu)pu.material.opacity=0.09+0.08*Math.sin(now*0.0035+cx*1.7+cz*2.3);
  }

  // 표본 근접 ②
  if(!camMode&&!mapOpen&&!specOpen){
    specTarget=nearestSpecimen();
    if(specTarget){
      promptEl.textContent=isTouch?('확인 — '+specTarget.nm):('E — '+specTarget.nm+' 확인');
      promptEl.style.opacity='1';btnConfirm.classList.toggle('on',isTouch);
      if(firstSpecNear){firstSpecNear=false;showSub('현상된 세계에 무언가 남아 있다');}
    }else{promptEl.style.opacity='0';btnConfirm.classList.remove('on');}
  }else{promptEl.style.opacity='0';btnConfirm.classList.remove('on');}
  // 미확인 표본의 기미: 아주 작은 보라 맥동
  for(const sp of SPECIMENS){
    if(sp.mark&&!sp.confirmed&&cells[sp.cx][sp.cz].state==='fixed'&&
       (!sp.stationLocked||stationLoop.pinned))
      sp.mark.material.opacity=0.10+0.10*Math.sin(now*0.004+sp.x);
  }

  // 입김 ⑤
  updateBreath(dt,moving);

  // 리빌 애니메이션
  for(let i=revealAnims.length-1;i>=0;i--){
    const a=revealAnims[i];a.t+=dt;const k=clamp(a.t/a.dur,0,1);
    if(a.mat){a.mat.opacity=k;if(k>=1){a.mat.transparent=false;revealAnims.splice(i,1);}}
    else if(a.ashU){a.ashU.uAlpha.value=1-k;
      if(k>=1){a.ash.visible=false;revealAnims.splice(i,1);}}
  }

  darkroomTick(now);
  renderer.render(scene,camera);
}
requestAnimationFrame(loop);

addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
});

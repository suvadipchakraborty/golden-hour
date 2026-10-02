const $=s=>document.querySelector(s), audio=$('#audio');
const SERVERS=['https://de1.api.radio-browser.info','https://fi1.api.radio-browser.info','https://at1.api.radio-browser.info'];
const WX={0:'Clear sky',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',48:'Fog',51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',61:'Light rain',63:'Rain',65:'Heavy rain',71:'Light snow',73:'Snow',75:'Heavy snow',80:'Showers',81:'Showers',82:'Heavy showers',95:'Thunderstorm',96:'Thunderstorm',99:'Thunderstorm'};
const WINDOW=45*60e3;
let ranked=[],ci=0,stations=[],si=0,wantPlay=false,fails=0,deferred=null,city=null,wx=null,token=0;

const status=t=>$('#status').textContent=t||'';
const countryName=cc=>{try{return new Intl.DisplayNames(['en'],{type:'region'}).of(cc)}catch{return cc}};
// Local mean solar time from longitude (no timezone database needed)
const solarTime=(d,lon)=>{const t=new Date(d.getTime()+lon/15*36e5);return t.toISOString().slice(11,16)};

function rank(cities){
  const now=Date.now(),out=[];
  for(const c of cities){
    let best=null;
    for(const k of[-1,0,1]){
      const s=SunCalc.getTimes(new Date(now+k*864e5),c.lat,c.lon).sunset;
      if(isNaN(s))continue;
      const d=s-now;
      if(best===null||Math.abs(d)<Math.abs(best.d))best={...c,sunset:s,d};
    }
    if(best)out.push(best);
  }
  return out.sort((a,b)=>a.d-b.d); // later sunsets = further west
}
function pickStart(){
  const inWin=ranked.map((c,i)=>[c,i]).filter(([c])=>Math.abs(c.d)<=WINDOW);
  const pool=inWin.length?inWin:ranked.map((c,i)=>[c,i]);
  const [,i]=pool[Math.floor(Math.random()*(inWin.length?pool.length:1))]||[0,0];
  return inWin.length?i:ranked.reduce((b,c,j)=>Math.abs(c.d)<Math.abs(ranked[b].d)?j:b,0);
}

function skyClass(code,cloud){
  if(code>=45&&code<=67||code>=80)return'sky-rain';
  if(cloud>=60||(code>=71&&code<=77))return'sky-cloudy';
  return'sky-clear';
}
async function loadWeather(c){
  try{
    const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current=temperature_2m,cloud_cover,weather_code`);
    const j=(await r.json()).current;
    wx={t:Math.round(j.temperature_2m),cloud:j.cloud_cover,text:WX[j.weather_code]||'Sky'};
    document.body.className=skyClass(j.weather_code,j.cloud_cover)+(wantPlay?' playing':'');
  }catch{wx=null;document.body.className='sky-clear'+(wantPlay?' playing':'')}
}
function renderCity(){
  $('#city').textContent=city.city;
  $('#country').textContent=countryName(city.cc);
  const w=wx?` • ${wx.t}°C, ${wx.text}, ${wx.cloud}% cloud`:'';
  $('#meta').textContent=`Sunset at ${solarTime(city.sunset,city.lon)} solar time${w}`;
  document.title=`${city.city} · Radio Golden Hour`;
}

async function fetchStations(cc){
  for(const s of SERVERS){
    try{
      const r=await fetch(`${s}/json/stations/bycountrycodeexact/${cc}?limit=30&order=votes&reverse=true&hidebroken=true`);
      if(!r.ok)continue;
      return(await r.json()).filter(x=>x.url_resolved&&x.url_resolved.startsWith('https')&&/^(mp3|aac|aac\+)$/i.test(x.codec||'')&&x.lastcheckok!==0);
    }catch{}
  }
  return[];
}

async function goCity(i){
  const my=++token;ci=(i+ranked.length)%ranked.length;city=ranked[ci];
  audio.pause();audio.removeAttribute('src');stations=[];si=0;fails=0;
  $('#station').textContent='Tuning in…';$('#bitrate').textContent='';
  status('Looking for local stations…');
  const [,list]=await Promise.all([loadWeather(city),fetchStations(city.cc)]);
  if(my!==token)return;
  renderCity();stations=list;
  if(!stations.length){status('No stations here — drifting on…');return setTimeout(()=>my===token&&goCity(ci+1),1200)}
  status('');tune(0);
}
function tune(i){
  if(!stations.length)return;
  si=(i+stations.length)%stations.length;
  const s=stations[si];
  $('#station').textContent=s.name.trim();
  $('#bitrate').textContent=[s.bitrate?s.bitrate+' kbps':'',s.codec].filter(Boolean).join(' • ');
  audio.src=s.url_resolved;
  updateMedia();
  if(wantPlay)audio.play().catch(()=>{});
}
// Failover: quietly move to the next station on error/stall
audio.addEventListener('error',()=>{
  if(!audio.getAttribute('src'))return;
  if(++fails>=stations.length){status('Stations unreachable — drifting on…');fails=0;return goCity(ci+1)}
  status('Station unavailable, trying another…');tune(si+1);
});
audio.addEventListener('playing',()=>{fails=0;status('');setPlaying(true)});
audio.addEventListener('pause',()=>setPlaying(false));
function setPlaying(p){
  $('#play').textContent=p?'❚❚':'▶';
  $('#play').setAttribute('aria-label',p?'Pause':'Play');
  document.body.classList.toggle('playing',p);
  if('mediaSession'in navigator)navigator.mediaSession.playbackState=p?'playing':'paused';
}
function toggle(){
  if(audio.paused){wantPlay=true;if(!audio.src&&stations.length)tune(si);audio.play().catch(()=>status('Tap play to start'))}
  else{wantPlay=false;audio.pause()}
}
function updateMedia(){
  if(!('mediaSession'in navigator)||!city||!stations[si])return;
  const icon=stations[si].favicon;
  navigator.mediaSession.metadata=new MediaMetadata({
    title:stations[si].name.trim(),artist:`${city.city}, ${countryName(city.cc)}`,album:'Radio Golden Hour',
    artwork:[{src:new URL('icon.svg',location.href).href,sizes:'512x512',type:'image/svg+xml'}]
  });
}
if('mediaSession'in navigator){
  const h=(a,f)=>{try{navigator.mediaSession.setActionHandler(a,f)}catch{}};
  h('play',()=>{if(audio.paused)toggle()});h('pause',()=>{if(!audio.paused)toggle()});
  h('nexttrack',()=>goCity(ci+1));h('previoustrack',()=>tune(si+1));
}

$('#play').onclick=toggle;
$('#drift').onclick=()=>goCity(ci+1);
$('#station-btn').onclick=()=>tune(si+1);
$('#vol').oninput=e=>audio.volume=+e.target.value;
audio.volume=.8;
$('#share').onclick=async()=>{
  if(!city)return;
  const s=stations[si],text=`Watching sunset and listening to live radio in ${city.city} on Radio Golden Hour${s?` (${s.name.trim()})`:''}`;
  const data={title:'Radio Golden Hour',text,url:'https://golden-hour.suvadipchakraborty.workers.dev/'};
  try{navigator.share?await navigator.share(data):(await navigator.clipboard.writeText(`${text} ${data.url}`),status('Link copied'))}catch{}
};
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;$('#install').hidden=false});
$('#install').onclick=async()=>{if(!deferred)return;deferred.prompt();await deferred.userChoice;deferred=null;$('#install').hidden=true};
window.addEventListener('appinstalled',()=>$('#install').hidden=true);

(async()=>{
  if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
  try{
    const cities=await (await fetch('cities.json')).json();
    ranked=rank(cities);
    await goCity(pickStart());
  }catch(e){$('#city').textContent='Could not load cities';status('Check your connection and reload.')}
})();

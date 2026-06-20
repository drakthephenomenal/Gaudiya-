/* ══════════════════════════════════════════════════════════════
   Vedic Panchanga — self-contained module
   Loads:  panchanga.html  (HTML fragment, injected into #vpanchanga-mount)
           panchanga.css   (linked from index.html)
           panchanga.js    (this file — engine + loader)
   Wiring in index.html requires only:
     <link rel="stylesheet" href="./vedic-panchanga/panchanga.css">
     <div id="vpanchanga-mount"></div>
     <script defer src="./vedic-panchanga/panchanga.js"></script>
   The B&C sub-tab buttons (vpSwitchTab) stay in index.html as wiring.
   ══════════════════════════════════════════════════════════════ */
(function () {
  // ── Resolve own folder so fetch works regardless of host path ──
  const _selfSrc = (document.currentScript && document.currentScript.src) || '';
  const _baseURL = _selfSrc ? _selfSrc.replace(/[^/]*$/, '') : './vedic-panchanga/';

  // ── Inject HTML fragment into the mount point, then boot the engine ──
  function _bootPanchanga() {
    const mount = document.getElementById('vpanchanga-mount');
    if (!mount) {
      console.warn('[panchanga] #vpanchanga-mount not found in DOM — skipping.');
      _initEngine();
      return;
    }
    fetch(_baseURL + 'panchanga.html', { cache: 'no-cache' })
      .then(r => r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status)))
      .then(html => {
        mount.innerHTML = html;
        _initEngine();
      })
      .catch(err => {
        console.error('[panchanga] Failed to load panchanga.html:', err);
        mount.innerHTML =
          '<div style="padding:20px;text-align:center;color:#f87171">Vedic Panchanga module failed to load.</div>';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _bootPanchanga);
  } else {
    _bootPanchanga();
  }

  // ── Engine ────────────────────────────────────────────────────
  function _initEngine() {
    /* === BEGIN ORIGINAL ENGINE (extracted unchanged) === */
(function() {
// ── Vedic Panchanga Engine (scoped) ─────────────────────────
// All globals renamed with VP_ prefix internally


// ═══════════════════════════════════════════════════════════════
// ASTRONOMY
// ═══════════════════════════════════════════════════════════════
function toRad(d){return d*Math.PI/180}
function norm(d){let x=d%360;return x<0?x+360:x}
function dateToJD(date){
  const Y=date.getUTCFullYear(),M=date.getUTCMonth()+1;
  const day=date.getUTCDate()+date.getUTCHours()/24+date.getUTCMinutes()/1440+date.getUTCSeconds()/86400;
  let y=Y,m=M;if(m<=2){y--;m+=12}
  const A=Math.floor(y/100),B=2-A+Math.floor(A/4);
  return Math.floor(365.25*(y+4716))+Math.floor(30.6001*(m+1))+day+B-1524.5;
}
function jdToDate(jd){return new Date((jd-2440587.5)*86400000)}

// ── Lahiri Ayanamsa (IAU standard for Vedic calculations) ────────────────
// Subtracts from tropical to get sidereal longitude
function lahiriAyanamsa(jd){
  // Chitrapaksha/Lahiri — J2000.0 epoch 23.85358°, rate 50.2564"/yr (0.013597°/yr)
  return 23.85358+0.013597*(jd-2451545.0)/365.25;
}





// Sidereal versions used for Nakshatra/Yoga/Karana (Vedic)
function moonLongSid(jd){return norm(moonLong(jd)-lahiriAyanamsa(jd));}
function sunLongSid(jd){return norm(sunLong(jd)-lahiriAyanamsa(jd));}
function sunLong(jd){
  const T=(jd-2451545)/36525;
  let L=280.46646+36000.76983*T+.0003032*T*T;
  let M=norm(357.52911+35999.05029*T-.0001537*T*T);
  const Mr=toRad(M);
  const C=(1.914602-.004817*T-.000014*T*T)*Math.sin(Mr)+(0.019993-.000101*T)*Math.sin(2*Mr)+.000289*Math.sin(3*Mr);
  return norm(L+C);
}
function moonLong(jd){
  const T=(jd-2451545)/36525;
  let L=norm(218.3164477+481267.88123421*T-.0015786*T*T+T*T*T/538841-T*T*T*T/65194000);
  let M=norm(357.5291092+35999.0502909*T-.0001536*T*T+T*T*T/24490000);
  let Mp=norm(134.9633964+477198.8675055*T+.0087414*T*T+T*T*T/69699-T*T*T*T/14712000);
  let F=norm(93.292095+483202.0175233*T-.0036539*T*T-T*T*T/3526000+T*T*T*T/863310000);
  let D=norm(297.8501921+445267.1114034*T-.0018819*T*T+T*T*T/545868-T*T*T*T/113065000);
  const A1=toRad(norm(119.75+131.849*T)),A2=toRad(norm(53.09+479264.29*T));
  const Mr2=toRad(M),Mpr=toRad(Mp),Fr=toRad(F),Dr=toRad(D),L0r=toRad(L);
  let s=0;
  s+=6288774*Math.sin(Mpr);s+=1274027*Math.sin(2*Dr-Mpr);s+=658314*Math.sin(2*Dr);
  s+=213618*Math.sin(2*Mpr);s-=185116*Math.sin(Mr2);s-=114332*Math.sin(2*Fr);
  s+=58793*Math.sin(2*Dr-2*Mpr);s+=57066*Math.sin(2*Dr-Mr2-Mpr);s+=53322*Math.sin(2*Dr+Mpr);
  s+=45758*Math.sin(2*Dr-Mr2);s-=40923*Math.sin(Mr2-Mpr);s-=34720*Math.sin(Dr);
  s-=30383*Math.sin(Mr2+Mpr);s+=15327*Math.sin(2*Dr-2*Fr);s-=12528*Math.sin(Mpr+2*Fr);
  s+=10980*Math.sin(Mpr-2*Fr);s+=10675*Math.sin(4*Dr-Mpr);s+=10034*Math.sin(3*Mpr);
  s+=8548*Math.sin(4*Dr-2*Mpr);s-=7888*Math.sin(2*Dr+Mr2-Mpr);s-=6766*Math.sin(2*Dr+Mr2);
  s-=5163*Math.sin(Dr-Mpr);s+=4987*Math.sin(Dr+Mr2);s+=4036*Math.sin(2*Dr-Mr2+Mpr);
  s+=3994*Math.sin(2*Dr+2*Mpr);s+=3861*Math.sin(4*Dr);s+=3665*Math.sin(2*Dr-3*Mpr);
  s-=2689*Math.sin(Mr2-2*Mpr);s-=2602*Math.sin(2*Dr-Mpr+2*Fr);
  s+=2390*Math.sin(2*Dr-Mr2-2*Mpr);s-=2348*Math.sin(Dr+Mpr);s+=2236*Math.sin(2*Dr-2*Mr2);
  s-=2120*Math.sin(Mr2+2*Mpr);s-=2069*Math.sin(2*Mr2);s+=2048*Math.sin(2*Dr-2*Mr2-Mpr);
  s-=1773*Math.sin(2*Dr+Mpr-2*Fr);s-=1595*Math.sin(2*Dr+2*Fr);s+=1215*Math.sin(4*Dr-Mr2-Mpr);
  s-=1110*Math.sin(2*Mpr+2*Fr);
  s+=3958*Math.sin(A1);s+=1962*Math.sin(L0r-Fr);s+=318*Math.sin(A2);
  return norm(L+s/1000000);
}
function findElong(jdS,jdE,target){
  let lo=jdS,hi=jdE;
  for(let i=0;i<52;i++){const m=(lo+hi)/2;const d=norm(norm(moonLong(m)-sunLong(m))-target);d<180?hi=m:lo=m}
  return(lo+hi)/2;
}
function findMoonLng(jdS,jdE,target){
  let lo=jdS,hi=jdE;
  for(let i=0;i<52;i++){const m=(lo+hi)/2;const d=norm(moonLongSid(m)-target);d<180?hi=m:lo=m}
  return(lo+hi)/2;
}
function findYoga(jdS,jdE,target){
  let lo=jdS,hi=jdE;
  for(let i=0;i<52;i++){const m=(lo+hi)/2;const d=norm(norm(moonLongSid(m)+sunLongSid(m))-target);d<180?hi=m:lo=m}
  return(lo+hi)/2;
}

// ═══════════════════════════════════════════════════════════════
// NAMES & CONSTANTS
// ═══════════════════════════════════════════════════════════════
const TITHI=['Pratipada','Dwitiya','Tritiya','Chaturthi','Panchami','Shashthi','Saptami','Ashtami','Navami','Dashami','Ekadashi','Dwadashi','Trayodashi','Chaturdashi','Purnima','Pratipada','Dwitiya','Tritiya','Chaturthi','Panchami','Shashthi','Saptami','Ashtami','Navami','Dashami','Ekadashi','Dwadashi','Trayodashi','Chaturdashi','Amavasya'];
const NAKSHATRA=['Ashwini','Bharani','Krittika','Rohini','Mrigashirsha','Ardra','Punarvasu','Pushya','Ashlesha','Magha','Purva Phalguni','Uttara Phalguni','Hasta','Chitra','Swati','Vishakha','Anuradha','Jyeshtha','Mula','Purva Ashadha','Uttara Ashadha','Shravana','Dhanishtha','Shatabhisha','Purva Bhadrapada','Uttara Bhadrapada','Revati'];
const YOGA_N=['Vishkambha','Priti','Ayushman','Saubhagya','Shobhana','Atiganda','Sukarma','Dhriti','Shula','Ganda','Vriddhi','Dhruva','Vyaghata','Harshana','Vajra','Siddhi','Vyatipata','Variyan','Parigha','Shiva','Siddha','Sadhya','Shubha','Shukla','Brahma','Indra','Vaidhriti'];
const KAR_MOV=['Bava','Balava','Kaulava','Taitila','Garija','Vanija','Vishti'];
const KAR_END=['Chatushpada','Naga','Kimstughna'];
function karName(i){if(i===0)return'Kimstughna';if(i>=57)return KAR_END[i-57];return KAR_MOV[(i-1)%7]}
const VAAR=['Rabi','Som','Mangol','Budh','Brihaspati','Sukro','Shani'];
const VAAR_ICON=['☀️','🌙','🔥','🌿','🪐','✨','⏳'];
const VAAR_PLANET_IMG=[
  'data:image/png;base64,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',
  'data:image/png;base64,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',
  'data:image/png;base64,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',
  'data:image/png;base64,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',
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAAB4CAYAAAA5ZDbSAABVbElEQVR42u39ebTtV1bfh37mWuvX7O50t79XfVONVB1VgCnAlATBBcTAw0FykzgOIxjcAB7pjN/jDa40HkncxM6z/UjCsGM7iXk40gAHJ8YYA1KBy1BFFdWhUpWkUkm6/T3tbn/Naub7Y+17VTAerkaqosD6aWgc6d59ztn7N39zrjnn9zu/E167Xrteu167Xrteu167Xrteu171S/6gfSBVFXjc8ORT+bM98HH9bS94fP31ofzlySevywMAD5xUeDyJoK89Fl9GxlQ9b/SJ8071Ifvq/VyMPvEup3reqP7+doLfd2/+/Pnz5oEHMA88cL+KPBx/+986fu3XfvrU3RufeMd4042a5ZWtsJjdWkq/ZVJTOvGGmCQpsQ/i+8RUiuLCaHLmYD7rFlfi5CPveNffvkzsf7vBH8M+eeJd8sCT70nyKOk1A3+xwi5PqcijN2/wiy9+dHtkfut1Vbz0VYSjtzp/9FZhfkdlFidgDv0M+jm0SwgtxJC/0ZagFiIgBWpq+lQy88WhMYOXoq0+JoPtD9my/rVO3vDc2bf/yO7N93Iew/0PCQ/9/gjn8uVt2PMG7pfP9NRn3/9Ttx471X9j5ZYPGL/7zbXsnUNfgH4XZrvQruiDjdhSoULtQDR00C/xvUdUEGMJfUdYdXSrlpSiGmPMYFgbWxjEKKYY4xnRMdgz1fBfUg2ebIvTT972tf/4uZff30MW7vttD91rBv4crscee8zC4zz88OMRYE91o9r95W8x/qP/gQn731wPltv012BxROgaFUJCHBQ7oohIXIn2UwgdGgP4Nn9QsUTvAYMgaIok3xMjBB+IIai1pYau1XY2J4ZkxCKDUU09nrCSydJsnPqF0Ynbf3L4pv/s50XetrwRwnno/JeloeXLz2MfURFRgGvXfvWtG3Xzx12/96ccz95O+Bhcfw6/WkQpdsAMjBgRIQERYkT7A7RboEERU6ApEvsGKYdroyoxeVBBxEFKqAqq5K9BSArRB2JQgk/aLlfJ9x7rxI7GFeVkmzjYem506tz/Przjnp+U43/76RvJGY/Al9M5LV8ehs1n7I1QvJr98teZ/vJflO7KQ2V10bH3W8TZxRSbQxW7aUy1I6QWDXMgIAikiKaIRtDe57NVleQ7VAUzGJPaOcn3iC1ADKHtUE2AJflEiApJSAliSHivGFdii2r9ABhV1eT7VoRoJtsTQn2sq7Z3fjJt3vI/nnjHP/nATY9+mCT83p/R8ntv3MfsDcNeu/gv37Y5fPGHi+7CnzD6aeLVp9HuIBJ7CfN9Y4oRZngc9TNIHk0hf4AU0RhJMedSRI8KpD5hCouYgthHVBOiEd8lbGHo24Rqvg0xQoxKDOCDIkZIYpkfBUBwhaFwgrEOWziSamo7n6wkd+zEmDje6SanTv79xcbZv33r23/m2XzUPGRvHDP/zhn4M7320ic+cHzn+MUfdv7pH3LykTJe+5Sm/jCRjEmxl/7wCracUG6eg9SAGjBDCAtSf5RDMwZSJC5XYBwJMChiHKiSQkJTIPWBGECMEHzCDUaYcghAbFd4H4nJEKJQlCWzvQVd0xM9lLWhawIxQlFZ+ghdj6pqMlbt2bMTip2d6ej06b/+Ef3+v/Xgg9/T5kTs9y7j/j0x8GOPPWYffjh77Wz3Pd9Zx6f/u6J64Z507QOkvomYoRUzAFORugNSv8SNTkFq0eY6xpSoSP7/GBAxpH6Bhg7tW3zX4wZjsht7NEQ0JVL0JJ89PfYBERCxxKCkAL5L+ecKiDEUVU2KSjNdogqurHCDMdcuHyAkkgghCn2vtL2qqqTxAHvb3TuUJ8+935254y/vvP3/eM+N/OL3IgmTL73nPuFEHgyf/vSHtk6NLvw3dXz6z0v3UfziWhRbGXGbIlKisQdtIHlEAxobCCsggAiqEVQROwEzAI2oRoQAoSd5j7ghcXkdDSs0WVJMaOjREOmbnmIwIq0OsJJIAXoPISgYg4jBt4GyqmiWnhgT3oOra0JQmiY3Q1IS1Bi8F7pWaH3U0sV04lhlJ2fPxM077vkbv376P3vk2173bZ3qQ1bkSxuy5UtnWAQeMyIPx6Mrn/zquvjgT1TyW2/zVz6kYmuVYmJAIS3XnulBHOI2ETtCbImmbNzUvEQKC2x1DDFDlAL8DOgRFUgBUsgxUROpa9AYSL4ldQsERWNEXE1qV0haEb1HY1yfxeDqDfpO8cspgmUx6wgx0fWQcsKFKoiBEIUUhaJyiOTw3nU+Genl3jecEXZufW84dtdfuPWd/+Sj+hhWHib+gTJwPm9BRHRx+JHvreKH/3vX/cY4rBZB3MCJETQuIcwREioWNRtIsQ1YRBu030e7XaQ6hUiCfpcYFZUCCVOM24SwRFOH2OHLvzz2qF8Rmjmx7xBxaFKsMYh1GONIKsS+JcWAmApNil/NSEmIPqIxYMyAxWxFFxTfd/imJ5HzZN8rvYeUwFqhrCqqumK56jT2XTx769jVJ84eVWde/0OnvuFn/zc9j+ER9EtxLssX37j57NHzalY/+Gt/fVg8/V9w8G+IyUVxhaXfR8NhNo4mSCsoz4Gtkf4yQiD1M9TUUN2O1RmSOrAjktsmRcWkDsKctLqIqY7lpMsY6OdoijA4g/ZztFsCBcaWYOzam0FVURFC36PJQojEZk4zn1LUNaGPYAfEpPRNz6pJVFWBb+Z4HwkBFiul7wSxQoprQ5cGHyIpaRxPjD1++znMmbsfueuPPPkoJPQ85otdM8sX2XONiKS9Pd3YKH7pfy344HeGi78SiTMDKxHfoXFJameYchvSChUFu42Eq6gq4nYgzMEdB7eF8VegqEAtIqBaAIrOX0LtKIdcPGhCQgNb95EwSFiCHZDaGeCy4aPPbcvVnH7ZEsUCBmJEFEQT7TJQjkpiAu+hbTy2GuSzV3t854lR6Vql95auV7qbHp1wDpwRyoGoNUlP33bM1Kdu/Z/f1z/wgw8//N83X2wjyxfbuO9738ePve31z/7T0v/cH+6f/xfBWOs0xHUG6/DzfUx9DFsUaD9D4yp3pUJEY4dxBkkC6kFAowPrMC6HWlSQFEhJ0eoWUt+g86vYrdNovyIsZqCJ2EEyDlM4UlIkpFw+xUQzT0QsgxPHMBrpFzO6WcBYpY+WojLEKBgnrFaBEBJuUCAIoYsoCsZyeKCklGh7ofdKSuBjom2UyViYTKxGn+Kdd45dceLML1zeesuf/Npvefzgi2lk+8ULyw+mF1/86PbdJ3/jZ6v+n//h/oVfDqY+4TA1VKeRdpfk5xhxuKoEv4BigoQ5Bof6iEiBcRVqCtQncEPEFaS2QZOS2h5te1KIaBJwY4xRpG9JbgszHiOxufksq6acacdEO42ELoERvBdIINoQmwbnBI1gByUgLGcR3ycWs0joYbkil0aLyP6e0rbQNkrXJZZtDvkx5TPZCCiGoxm4wghizP5BG7br9t5RXLzzB//st/7M8e/7WHv+/Hnznve8R7/sPTgnVMJTT/3W6J4Tv/FPK/3Vfy9c/UiQ8rjDAL7JPeDph0kK4gaIeGKskNHtSHcF2n3EFGAcmnoQhyLE6XVsVQNKbDowDsGA0ZzarnowQneohB6KCUhpcigPQvCKGIh97jtTFBijaB+ICZpZBDE4l7ClQ8XSznu6IKyWibbLYbooBbWG5VKZzxLGQDUQYhSWnRKCokDhBFeAEaEoDGJBo9J0inMa7r6tdvXpW37p0/Id3/lH/vTfXOVE9NVNvOTVN+4j8uSTD5ivfcveT5Xpvd8drv5mEIkOW0P3Yg6pfkrOREbZs/yScHSAqWtM6XIHVxOqBootNDSon4NazMatiHZIakEsRE+SGpWSdP0iftqirsTtbKN+SVouUIXVoSF5KOuIKqSYe84YQYNiS6GZJ7omH8MYIQSlD4IPSlIhJcW6bLjxxIC1XLkU8FFZrpS+F8qhcDjNAIYPQlUpvoPNLYGkbGwXtG0kqdJ7Da+/a+DcsbOPvenPfuqP6/+ulod4Vbter7KBc1+52/+F/09pn/iL4dJ7goTWKYr6XQwRGdyOapWz5dRnQyUP9GgMObGSEuwE3Xw7ah2y/BRowIhDig1SdwjdldwMSZ7YdGhKaNOSWo8bD6GoiMuGuOrQBNEbylpIRGIPvoG+Efo+UVaCkRxWYxRcLYSk9B20LfQ9WAudh+BzSO47GI8gqjBbKMs2f48awVih7RKFy1EjJCFGpSihKCxlCYOBoRoWNLNVuOvOkatuv/uv3f8nPvpXXu1miLyK3mtFJM6v//J/Pi5+/W/Gq78Y0Ogoz0KcgXa5dWhK1C/AWgwJNAIObIVOvhLtdzGrZ2D0RmK3C9pgh3dB6pD+KqRIWr0EcQHlidxp6HIzIi4P0WaX5D3qE4rkf1Qh5aCRkuavMQP/3SoRO8WVSgi5RYkVuiblOhjwXTZ+2+SzNyZou3zGFoXQtMp8mV/bBcFHKEulaUCNIpK7ZEWZS6iuV4yFjYljPILChHD364677bte/wN3fMd7f/yJJ97lHnzwPeHLxsA3PHe++75vGuj7f04PftEyuMsYI4ItoT8ASRCmuaGBIZ/UFrEDcGPQgBa3QjxE0gpNoO1LmPF9EJv198+RuETNIIMNGIScbRM6RAza7eeyKnSoX6Eoqfdo1xGX84weqdA3kRSUFCK+A+tyA0wsJLGsFhk+DEHou/xgBJ//vg/kjhZC2ygodBE0CaYUlg3ElLPoqEofhVWX/8waIWnOBTSCs7C9aXSjTPq6+0/q9t23vuuO7/zge1Uxa6D799bAN0D63d2nT2+XL7zPte+/NQSXxDojYReJc1QMyABJczQucsljBMSBFFCfRuhJ3T4iDmOGqD9EB2ezsfwcsRNUA8QWMYr2h9klVSCuoLsOZpTbnN0cGZwDWxGvPZWbGSQkRVQMyXtSH4khoaYkRUXbjthn1Kn3gpsMaWYdfuVRlVzXaoYUxeQyqO9h2Qh9yEYuSgMC80U2Zp+EGBJ9hD7lh6L3GclCwbj82q0xbA5IO5tq7r7v1HNn7r//6//HX/3l3Ud45eQBebW8t9n/1cfr4UvfHY6uR8PSEo4gzSFOAUHiDPVHQJv/zO0g5Vm0OAO6QBcfR4tjmPFbkHiIttfR5NHQIuEge6hRcBsICXSFSoG202x0sajvEFNCzBGAYpu02F+DElV+v74hhXX4DT7f5WSQ0KNR6VbKcqGoNQwmNSko3aLD2pz59OtwHQL0bcInYe8AiiIbryyF1Uppelg0+QSJrIEMYNVC5YThSJgvlKSQVNkYQNtqvPeOwp57/el/8pV/8eKf1Mf0Ffet5dU4dxfXP/C9o8mFv5cOPxQ0TB3tc/knawB/FVKDuAmYGrp9cEOgQbCoGUF7KYdoexyoIbVIP0dTi9qtnHWXW9BdheEdiHZoWKBuG6mOgy3Qg08iboy4IbSXELFrg/ak4NeMD4uMz6Cra5mqgyM0C0LXgVo0CaGPSFGQMDR7SyY7I7qlZ37kc2PF5NvW99B1iabLoVoTLBq9AazgPRwtYX8OPgliwDjhYJbr5PEAQgTncgI3rAzGCE0T4tvfOrYn777tT731P/n4T71ScEJegXENoIdXPn7bqH7xQ677tU1dvQj+oiEu0PqNkPYRvwv1OVK/wNIiozejYR/m7wNjs+fJAG13kdiB1lBtQ2qIgzeg/T6230NNiaxeAGsgNKCChgimRNyA1LdIuYkpKiRp7i6FQGymmHKD1DV0swVm81asjbmfLS6T8lyVk7DgMxtEE8vDFr/oKStDaBPeC9PDiI9K18EqvwWcBUWo62zgtgUfhKhgrLBolYMFND3EJDgnHEwTrtD8GrLXWytsbxh8p2lnkuTu+45f2nrDm7/yzd/xy9d5BPlCQ7V7Re4vosuDX/nrZfHMdjh4JmKHVopNpNhG0xH0U2T4BqJM8MvfxJ26H+2v5hJp84Fs3NXHgBK2v5rkp0j3XAYYZAdT74C/ho5ugcVzyPZX5MZHXORamBJNESnGWAVdXsmnrdgMCYrFbNyJhhYSlCe2QApit0RSgrWRSbKGExt82xF7j8FQjRzNPHfUiqEw1kTfKq4yDDaErlVWy5TbpCpUDjqzjvoJmi43QcYDQRGaXhFVzhzL3t13kATalVI4xQdlMjLmqJG4OJjfUlx49sdE+LN6/gt3RHkl5+7Rtfe+e2w+9vNp8fEkxZaI2xLi+uztr0B9L6IJdIk4lxMsOwbZQGIPtsrnpRkAk1zdd8+i4QCxdUaY3AhdfRprLWIGkHqUgGgHYtCY1r8j5v82A7CDnID53OQg+nVIlkwcSBaKTVJ7hPqG0Bxhhydo5lNSN6eenMFYS2xXhNZjqgJcxfzyJaKPiHG0iz6XW6osVusELBgClsOjPrekxLB3lOgCLDshRSXoy3d93uQSKq6TOLtuHG+MRLfHml5/74TtW2/95q/5/qee+EL71fL5GzeDoI8//Lj59v9h48m6uvL1MWwlcIY4z4BAmIOpMW4C2mWDaQPVSVRLJDUggmjOglUjGmf5zFafs2WNGXRIXT5bSZmPZY+BudEoWUHoILU5k44txCazPcSiq6ukbj+D+yGSUkDVI2aQQ34KxG5F7BYkU6MyIC53KSen0RTxiykpBGJMhGQJXY8xQugyJTf0keUiW6asDE0HoYfFMlBUhlUnXL4aGY2FrldSUrpg2D1Qupgyo0gFY3PIFwFjcjtzUBDPnjD2jW87/f6Nbzr/9e94x/cHydbSL7KBs/dOr3/sj442qn9GbJS4MhIOc6Ik5HoUixjLuqDNVBs12Wi4HMdyFpTDKSk3RKQEu4F21zO91Y7XlBz78s/QCGEXwj4qNchwDSpENK7JAc2LmOE54mIvvx8zWLMrZ/m1sScuL4GdEENDaPYxxYTYLwl9l/++a0kh0vmA7zyKxVUjBEh9R/IJ7yNtH7EW2lZZLgLiLH2XWCyVPuQa2gchpJfrZx+VlYdVl5OyzBKBcQ3V+takoPFt94/tmdff+p++43uf/gdfSML1BRg495u72Z/5xWqjfjAuridJh5m/Qp/bj1JkBAhFUgAyPIixa4PYXDqlJcQ5Go/yQ2AqKO/OWC8pPzDqUbEZVMDmpkc4RMM0k/ISGDdCsCS/JPl9rLUQjrJXV3egIbz84Ps5obkO4vCLS7jRbcTo8bNPorHPhD41pJRATSbKe0/fzOibBeDwfU+zOMIAKSpdiISoNAuP95GkmdvlfaTrlaZNmcFZWkISuj4REixbpc0nDT7md2itslEJkxGkkNKxMXLrHSefm5z+6re94/v+r+bz9eLPK8l67LHHcjty9xMPDjYH3xBXByrSGbE1GqcQZvmm2yESDjB2SHKDmx4sUkA4QON8DTYMIS5QWyODexGzicZFRpvCfv6ZZPAhaQ8xYetTqNvCjF6HmhqXGlJY5YQptkh5jBhmSFSYfQqGJjNE1IP2hNVVTHWSRIEdWYJfoqbEjO/N9y16Ur/ItzAG+sUey4NrWOeQYpgbHaWl3qjo2p4QE3YwJHae2M/BpczRNgExCWMSg1JoO48x+UQxZSL2EVNEBoUgYiiT4lO2XicwMEKUYA5WIZ5eLO5l+fSfEuHvf75eLJ9vaSQiqZlfebwey3eHxYUoFivNJ1GpEFNlKk13AHhsfTbXsqnNRp5/NPOX3QgZvgljt1GbSXWkhtRdgBQQq+jyOaQcQVjkpMkMc/g2EyhPZcwvdeD30dSgad0K7Xahn5Oaa5jRHVCfyzXuugPmV7sZzMBlnnRoSHFJCj0kiP08k/tMgZ9epl/sgh0hxRDVRAwGFYPvPdH3+L4n4pjPFmiCvvP43hNCJCbo+4gPiajgQ6TrNJMA2kBUwSfwfcI5IWJIUXHWUJZQl0IpKZ3ZSHLLLdsfnw3f9I5v/aGf7z8fL3afr3EPL/7W25xd/NE0e14FDM0z2WjlPdA+D7rCuBG4k6i/CnGen6LZB/LzZLagui3jvRJy1yruQbefGxgS0eZFRCPp4CmMBaFAiwE6vA+p71yXNUdIXKDNS4DLPemDX0dF0eUuZnAun+UpIBIg5bEV42pISooNGnu0P8KkFj97CXGbFIOTYEtSPyMWA2w1QewQKTaI7RRbOkI7Iyz30N6jakkypLBgqxpjbE4WTUFoeiRj/JlA4AwF4NuMWxux2CQoiZgy6pSSElVRY4gIsazMNBq93Zr7d+T61yE8oY9hPlcv/rzr4KLY/R4XXqrD0QejmGQleVQmMP/N3MCICzQZTHU8016lQfsjaK6T+mXuEXcXQeeodVDdDt2F3OVKFrRBtEd9C26HsLyOcYIxBaIeVs/B4C4kdWh7KYf89gjpdpHFS5j6ZC7H5vvQX0GDz3VxsQ3l2fwgYDGxIzYHYMZgR9Tb92DLY8TQErsDYr9CNGFMjW9mmBBR39M3h7RHlxAp6btI5wUzFJyUpBSpSsvh7hLFslr2RAwiRR6LWdNtfR+xzqEYxKyTUh8gJaw1GJtJClWZ85g2SOqDMyMn3yfwy4+92kmWqoqI6DO/+diJW49f+0jFs2e0fymh0SAlNBcy+0IDaXkZCSuk2EaGW2i7h2y9Eb3+NDp/EQYTzOa9pOVliDPsnQ+Rps/C8mlESjSZfNNTguo4MrwTHd9Pev4fYdhDijFaHgNbYzSSZldIfcwc1OYAqbexw5Ok2YtomKP1OVSGpBCR0Vliv0S7JXE5hQTF5AzGOrBFrqXtkNXhHslHYlI0yXq6YY9y+zaKjXPMr32aw2uXaFYtg/EWXZ972sPJNm3bsVg2TKcrghp8WPOk+0BISlGWtH3Ah4j3inOGLgjzVZ+TLLF5Lkojm+OSQeWoCqentgu549ad+ao6dd+D3/fzF1WRz4UY8Dl68OMGiMd3mm+pq4MzYXaYpLtmpDqdgff+CNwEqh1M2RHnF0mLKbofKUYgk9swt34D4RP/FKZzVJ/FVCPCIsIzj2POfRUc+3rS/DJpeRVpL2MkIt0hLJ7HmIjc+xeJL/4UMvsghisQlTQ8CSGQZIJs3405USPGIu1VTDUmdSv8tUuY4QBCgz/4FKHPyKOWmyyvznHxKuMdsONNwrIl+oAdjfGzlm6l+agzuaFydHiAHbzI8PhZTpy7jetXrnC0f0j0kbJyaLtETcGoHpHSkMtXZ0Q19CHTeMRAs+wyDzskiqJEUawkjJDD+3puGYHVqsdZg0iSvWmIt51LkxMjeRj4W08+8i4Lnx0z/hwN/JQClKb9DnSqhD3FnYDxPcTLn0aWV5FBgKPnMGe+Dq3PEi5/BLdzD7TPoHsfgp0W9/pvJV5+mrj/HKaf4uoN1BSkl34Ds3kae9cfR5ZL4gv/jGBH6P6ziIHS/BKmu4bc8x+TVg+SLvyfxCvPEnavoQlC2qfYe4H6rjcjm29E5CRCRMoJhTtieXWP4KHvBE3CeKfAGWXnjXez2m9o967A0XTdeICwmGEHA+o60c57gvf0XghJ8P0ei4M9qlHJ9uYmk8kJLj63x97lFUUlbGwUaL+itiVbQ+X6QUuMhqRwcBgZ1RBCXBMREq0HFYM1Bh8Dhgw5ikJRuMwVawNgOJx2Otn2f+z8+fP/7wcgwXteOasyh+cH9Zlnfu7Etr3839juhQnikMEZMbpalz4N4fAi3d4S+iMEwWpBefbtuWbd/gZYXYLFpzE7Z7En74Rqgq5mxKMV1DuY1UugQnf9Ijp7EbN1N9o3sHkf/uKLsHiBtPfrSLWNOfkWZFQgErCVg9DitjYRP4OjZ9aI0XUMETcaUO0MsKWhGFhGm5aEIS0b0mLK4PgxxredQ0Y1SQMpemIU+i4RvFJUhsmW4fhJR7tU5jPwvdAtI82sYeeY4dSpIWVp6Xthb89zeOBZLTpKC5OBYVQLZ485wno+amsk7O5FUkqEkOj7hA+R4NdU3hSZzjK3W0loilhrJPooO9uD09/0leP/bfI9f/Pwc2Fius81PG/L/jvLKp6Jq16NCUaWHycu9jID8uRX4TbvIZVP0770aeTKLs6SjbvYQ7ZbGJ9C7Rg92iVN96Dt6fcX+JlHijnVzpDafIj6+OtQdxKdfQxz/F5S1yP0+EWBNkfo9ccRB3a0QaSmuuOrKFmRji6sa+sBwVew7NDFPqvpAqoCI4bgleU00i8iMVokRvTCp6i2azbuPMvwzEn6vavIKqFtwtWGqojglQufCly5kmg8NB5sJZy5ZUBsG5p+wcnjY45vFnS+5l//2oLpPJIOPNZCREA6trZLhhNwRjmxY7myH6mr3CzxIREjdJLBi5SEvu/pug7jLINSZbFKcXW0Wx5cfO4bgX/wAE+aR/m396c/BwNnxbCyMl8rxQHSPR0JR44USKsVKXTIi/8XUGGCpagFYwxGFD26hqqQrj5D7J8hJUOyFdW5kxnhCR5TG2JQVtdXmRo9+xhiR0QP4eJH0VVDsTPAVBFjHGoVvwp0yxlpNaN54ZcY33M7ZQWoITSeK+/7FfpFy/E3nkNGY9q9XcIqAjbjDtExP1KMgT4YFldb0sefx1aCKQw7ZwaMR4ndSw2xVZyFtjcczgSc0nk4PFJeut7w1vsdg9pw/eocjYn9haXt4PRx4aVryqzJdJ3hEK7PesYDmIyF8dAwXhlWPlEWMFvmVubGSDOeHJWuU0YDoesCh0dL0qjXK5d66oH5OuAf7H78s/OoP2sWncdDhNXFn3hikJ54IO6+N5KsJXVopiGSujmpyboXxbGz6Hw/NywKg4aARiV0CTWO8u43wOqAcOkyohaco592ebK+VWJQoofCgERwp3cY3zVAD3ax2wOILbHJoS0cQZwmCqcUE4urLe1Bz+Xnoe3BJxif2eLMGzcZjANx1ZKOZpig7F0T5vOIsdAFmK+Ua9dhtcr0mzO3FJw7ZxFJ9I1ntYDr14UkaW0AuD6D+TKD9qpCEmHWKNtDuP0UHC4yCW/ZwbJNNFGICDsbWUXAOEtRG3yf6H3ihSuKkI26NckH8apVxkOh7aF2miaVmHd+5cln7vyGP/fWOx98tF3bUL+gM/j8+fPmySffo+974rHTp7aOHiniJ4baNSKTe4TUYcohpiwxJ78GBjuYcBU7mCCGjIQXFVjFOBAriFVMmEE7xVQlohFTWlwFRS242lAOclMgpTwqoqsOExrMxgTvLasX59gairFF2zy4Xd0+picnJN0CVofp5sPZT1tW15cMRomy7jGlRUUpRmCLRFUpVQmjARSSWRZ1CRqUxTwxHBmOna6YHwXqShnVmWc/Hq7vrIAthKhKTMrWxLBooXDQNLDolEEJG0OhcMrBEq4cwqxRdo8S86XS+RwVLJkO1Pn8cFiRm79vUArDWkQjjKq0tV1f/D9+/Gf3rqhiHn30dzewfG5sySceGPT/5gldfFhNsSP0FyDsZXCgGJPaBfHgWdz2nWhzAaP9mhnRZ/J6TGjfItaCs9nzQ8CsRVNisrmV3Cu+E1KXyxMREJ+nBMqxYAcGGQ+xkwJcTby2i60N3byjXViWu8piN+HKjGcIeaqgb5WNTdi+1ZKMsJorTSfUE0tzkCm2bZtZlT4J0SujkUNRlsvEYGI4fq5ittcRm0jbC0dLoW0TphCWXeZhYYUrh/DidWVrDMMiu1bn80NUFcLKw7Vp5mI1fY4eTQAfheMTYdVlWFHybWMyEEqnlC4/JMfGpPvuLs25209999t+8KWf/my9afe5nL/gztqt2wh2K6lRKwfPw/iroboL9c+il38Ku/MW5NjXI6uX0OY5JB5CdQ86eTvx2R/HVREZHkNNhbE1lDtgJhgizC/BxaehMNiBzUJkNqFeSW3KxjJgNgym9Kir6aYrXG1xp08jwwPsYEFSgxkIda20+ymXGqUyuKNgdMziU/b4QS2kWSJVI3b35pQk6qGQUGhzwFsuAr6DkGD/IHLpUst4IsxnsGih98p4JDiBk9tw6IQXr8HRTDk+gYTShgwBRs0Y8sEyP7TOQuuhsEJVKlWA6QpCVIxAzCoSlIXQeKWLUOUEG/Wqi1lgtfTvBH76VamDy/rY/QwtrF5Em08io3cggzeR0op08GnsmW+A8ZtRKqS+GylPIzpdk+F+BTfZwoy/MvOfRRHtwe1AaokHT6HzK9jtExQut2ZUJOPF5QS7uJhbnqFDqwlaDtFuj2L7TK6zjSLtxzH9nPGOUo0T3UIZHbcMx+C2x5iRJUXFqmBCInQRmXlmF6cMKsFHw9EikXzmNu+cMtRlYraXMd5khaN5Yu9C5kRHVQoH8zVr8sKhsDfLuO/mGEZVJtWpZFpt47O3lpVwOFOQTC2La6qPE2VSZzIeIpQWQsraXfV6kiel/AAUBewdRkaH3d0AjzzFKyqTssiQGd9NvA5SIfXtGbTXDtpPYcavQ4vjN3UyknhMdYa0PCLOP4kpJsjo61DZRJxD0iHqr6CrT6FHzyJSYY/dj2IyE8SNMXSZWluOwJ1D4xKx51B3DHSJ2bgHKU+SVhfQ6Quw3MfVFvGBVG0xngimO8QevwOqmjC/DBQ5EYpC1MTRbo9xI+545zb9ckHoM1fZ2Z66CsyvtiynOdFbtVBuFNz3BvBNYNUK+wcQukQyht1dRclnbFBY9LDss3ciOUTvTITdxboTLkLTQ+szOVB5udZJCqUTBg5Kl0/RsoSmVQaVUJUqXRT29vv7P/wvv3n0tnf/q6Wuc+HP18BijEmAJN/cgu0yOU7GmcccDpHiZJ4hIoEpEDtBUos2z4PdxJ3509AfrcdMtjLlJhbQXkXMBNl4W4b+cFloxdRAymC+3IqmOeJOIYNbQAqMdplX0F5GDz8Evstk99EWHDuO6Q8Ybd5JXLyEhAYxkbDap5s1NPNZLpE0zxsV28c4de9J0nKfcjDGViDdHO08ey/2zI+UNgmrmKcVbrvLMdyE6xcSx09ZRhPh4gs9XQ93nICmV+ZN9vCk0EelJ5eAR0th3sOqX5Ph13z9usoqPTfM3MdcI6uAMcK4hv0ldC04azBG6YKINUJVMrxjIhWwRH/3bMr9WzpYiAif/vQTlbF+J6sFNgJNHhRTQYrjQMrjJ1Sodkh/gHHHYPgmoADTgx1mnlVKWUahvA1jN0FlrXORULuFuhGibeZqladzpGieQvs9pDiJ2C20uQJuA7b+MEaqjBGHPMAmYUUMS5LdIK1WyOwCvmsJZoPBiZM57EvJZuEQWbG8eom46KnHAZNWLPdb+haiQjGEYJVxKexU0Hcthy8YjvbhJBHfJLY3wRolxTyFOF8J+/OcITsLdaU0vRLJMOB4INBkA4IgksO6NflomjUQ1tMTTYCih0mtzLtsDx8zh2vRJEC3PvXUpVPAwSOP/O6l0mc9g7e3v2Jo7JUJ0ebHSoYQmoznYjJ5LnlSzC1K3PHMktR1Q1UtSCL2U0R7RLbBDUj51VmoTApwxzKtJy3X3+vyqOnwLWi5j3ZXod1FBq9fh9sVGprM+QpLUnMNMTVqKijvwOy8Dh1PcXGBq0+D1sT+EFFPWF4lhYrqxHH8eJ/QLrA6xB5Taslald1qSVw1WK+EmPB9QkTZ2skA/WDoGI5hfzeybLNRbCGMBrDqBY3Z8NbkszNlydSbVghJCREGleS/B1SUmEeUGRVKGwxJwJhMoE5G6BMyKlGjabR/ZXYv8PT99//u1dDvauBHHnlEAC2KMNAkE+wOYhMiERXQxSeQ0QlEA0lbsFuoGowEVGeQLGKHpNRBWCFmhIaAGdyePdBPUTsCWyJhP+tqhDkaluAmaIx5LkkKNPaIO426s1Ddksn0/SxPJJoBYmok9pkdUt6KIKSQHxS1Y7A7hOYg6yPhMNUxUt/gl7uk6DDVKSIu03tShJCwZsGg7mmWSwpbMRQIvcdoInYr+jZwOPMs1eHLzIFulwHS2gvTemAtwbCWPNyW8p+3HuZtph8uOvApk/NiWjMryU0a47L3GgOVEXwUolOMQVVVJiMz/IKz6EceeYRHH30UY3yp0VZqtxDbQJwh7iQ6ZD15b8DWaD/FuA1S8zykOaa+C40RU26gwSHVuTXrsUWkQIpjqFgIV0irl5D6FvCrrBAbl4jJNBuNB5jyNBTHc6EamjWD5FQGzFOTs+zyNHH2LEYdKYQ8orrWyop9g0hBUsm8rGYPkRI3PJVzCL/MGlrRE0P+Ktahvsc6KIfb+GaBdYJIyXwZ6VMJA6hsogBsH6hGga7tsVWeTGy6dZZcGhZNwvd5TJWQGA4MlcJ8qZRGGK7DuI/5AWhD5qkklM7nSYmQlKrMJPrFSinE2M8sZr+gEN33wQ1caTXFfO5SQOyR8mwOj3EP0YAUG2AGyOAONE5RKdbc5hKG96wnCDxSnYX2ev6+/hqaFvnR9kcQl6g7jrhtdPkpsNvo5PWImuzdGiBlLlbyU9RPod3FFCUyuh27dR+x2UP7+ZqaWyJGsL4hxj6/X99g3QQzOEvymXlBdJm/7RekdkpMFlNtAwuKaovYr2CNNPUhYcoRhoTxitGQI5NIlmaShCfik+JKSGppfCKoIRll6QNqHUYUQ66llTzyIja7r9dcKqUEdZXboM7kunlYAaIkEZZ9cK+8Du7morY2xNVaLnAtJOEPwE2QYgf1U0QixClix4gdZE91oywjuPp4zrjdFhKmUJ9F9SRSbCLtBbTIoyXUZ9FiB5rn8/f6Q2grGN4BYnItrKs8CkqJMkCp16MmlzPdtj6DqW/L0sLdflamFYMxBjUWpCb2C8LsBVI/y0R5MXk+KnWE/gBjNojt0drzc8RxRUH0LUU5RL0F3xJCiw+B0HtChBgTzhUUhUGJ+AB9iDlyCDhnCMlirclk+jUZrwsJrybn0qoURU7AxGQeV5ZXzClP4SxiYTAssa6QV6HR0efsV9q1BzXZiMZh0wEpOXCjdWFlSc0LmPpMlh6MEYpNJFxDFx9GqluhPJnHSO0QylugOrme3F+hvsH4/TWrcQsZ7EC3S9p/Mof1yZtheDdCQEhIv4K4IvkjtJ9Cv4fOn8/8rsEZVCrUDBE3QKNC6jJXu95AywRuRpi/lMuyeguZnKEa3JY1pUMkuZ4UWmI3JXUNq1VPHw8xbkLXNlgSpTOUxZAQI3VKpGiYS4srskWWTaBbq/m0IWXxU80zxX3Iwi0Jwbhs9Dwcbm42IUSEohQMa8NbSxMCAUNR1q+cdKfldtR4OUm8bpO6PMTtSkgrZpd/neGZr87ZsAZwA7S7Qjx4ErPztTC6D00Gqe/CmAG6fJbUXkImbyUtPoGufg7cduZXlScw5fGs6ew0l1axQSb3ZcXY6ftJF34Ss/XV6PAOkm8wxQDcMUxxAuqO5I+QcISGg3x7XJnVapsp4razjCEK5QRDgTLEMiDGBdru45fXiRRQ7mCrAYXL2W+sW/rVfp4gvHKB1C/wIdG3LePRAOtKmqVn0bYUVhjUJasu0XUhy0hYR11YmlnOmGLIc1LWFbnBkXL/OaghasKJyYXtWoGvLCwWcIUhiWAKB65ETRVfbik//vka+BEAqmojyurZKIsPFlLdgsQj6J/LWhthhoYppthAk4fVVeiuQHkmJ2CH70c23oL0s3zWVSfR6W+R2suY7bchk7vAjFEzRFcXibOPYTbfnpvt9U4mkfspAGbzHWi/gN1fRHbeiQ7vJh5+CDO6F61vyclSIUhqckbtl2gCW4xyNh8S6mdo8MTVtTVaNSahiN3AbJ7GTAKhm+KXu7SHn0KqjZx32CEYh7OGk2fv4vBgF+l6REoWyyXORUbjIeVowHy2oOs8w7oieMWIsmojRSnYolgLpwlJDUVp8XEt56C5DHNOKJyj9ykP9EQlWTDGEKLSG5gMaox1iJr4hXvwI+vWWYrBhX0v4ZM1/gL4qwhL1Ac2hmdIzUdJi5CbHf0h2i+wp/5QprW6El09i6ae5HfRfgnVKSQ1pL33IKM3YCqLMUoanUGNJ83eh9l5ID+9/hD8AYR9Yns1zw9XxyF2xIPfwNTnUDtBF8+ipljP+zako0+QgkcGZwjLa6if4yZ3ovUJbPQIgp+9SFhdRiiIKSJugClP4oZnsdUGq/1r1MMBi91nqTZvQ9WwnB2S1FLWE3xYZjx34IjRM5utCFEZDAcsm8DhtKcoHQPjSJLY3V9RDGqQSIprI6eMLad1fXyj56whk9+TGpB0s50ZVW6q0VdVRTIu8rv67mc18CPKo48yjH0X/Ysrwv5EiOD30LAgrQ7R+afAbaAyzAmSnWBGJ9HD9+ZJvtQh3RU0CVrfBsVxpL2E8XOUElZ7xOVFpNzOY6HaI+PXkRZPZ/I7bZZiMCOwjhSnYB3aXkDtDtSn0O5KxgbDPGfBzTVkcBvGTdCwwBQ1Yf5pOh1Q7pwiEfOMFBC7BdF7XL1BWC6QzhNjxJRDJqfvQ1OgGGzjuyXtakaz6mnbQNf0DLdOgTV5CD0Jx08e59Kl61y7PmUwGmHKAfuHS+raEnyiKAzB9/i1EHnhDDHlDNqHCMaQVPMZDPmhk6wc0HaJ4SBrclrnMMaJNZZVG+av4AzOCdoL+938HAe7lnBK4lzV90K/xCjgBuBqNAqpuQxhRZyupwy63Twyal2WJlw8nztWpsiSgrHLdaooistlVDlAD98PYbEO6duYwbG1+GhEyjHICMVgoxD3fnWtB71A26McCUKP3XgdtpqRxKKuojz91ZjyGLHdR7op/fQi3dElQtNiyw3a2WVi8NjRnZhqTN8uQSPt4oAUA6beoBwcY7A1opnt069WaFrRNEu6eY9YwbdK33lWnTJvF1hb0PWZMbJsAvN5z+ZWja8MXZdwZUEImWznrOT+s1hiSgiZPOBDFoqp6pKkCYtQWKtGVAI6PXVi/AzAU089/oUC/lkKuH/hr/yzIvzmt8flPJrUWW2neSZ3dC7P9DSXSOIww9uR4SmYPQthQVjNiKs5brCRdSclZ4jaLVBjUFtlFMo6cA6ptjBpQZxdQsa3rmUa8tCt+I60nOXecsyCJhQu87qiYpzLtaupwZRAnSOHJjT2hGZO6HqaRY/GFW48IMQav2wQieuFHJFoagbH76Y5ukK7nDM8cRvl+BhhNac5vE7bNBhnszB5VLwX1JVcvLygi4ItHCHk9maIhlXrmc08nU8Mh1n9LoMOllFdIEaZzn1Onoyhj2ndWM7eW5YFzuUBNWOFYeXSsUlhXn/n+MJ3fc/XvkXu/F+O/m0k+M+SRX98Peak19m8h7R4BmKDmCHiRsjodtLiEmFxgD3xFTA4i7/yG8jyAuIcxg1g6w7MaBvaJfHoBSQFzIk3Y4aTPJ9jDdrOQVek5UViMyUlh7/4HP2sgwRVlTNI3IBitIO1SiGJpB7tTd6okkBTixtsYGyFTi8ioScRs1hpm/LPMkIfDWHp8asWFUNYF5lFWWClpJvuMb+2x2Bjgp8fsrx2gdi09MHQdonBpEaKAatFT9N6+rikrmpKhOWyQ9XQd4nlMrBos0ipcXA4y1ofiuBTz8AlNieGxSyyWCplKagoxlpETL4/BnxIWKM4a0kpUhQV1qr/8X/0G+GzuennwOh4nFVz9JubY/lPtTxGAmxZkhbPYxcvQTcHHWFHtxAu/Tr++mXK07dCMSIuD3DHT9K98D7EFdjt+7H1ENk6l0sfc5Lwwk9jh0Pi3j6pWRLU0vqIpISpa9xkiNvYwtaDLOStWeeZ2GawYZjl+/smInaEMR5JPVQFySYkGIiCrTKhzThwPpI0kdZNBLHKslG6JiDS0bVHuSQJC/xiTt9DTIamyV996PCxpR6PcKVFO2W16Jk1kaZTQtLMivT57RYu9ynUCNUga2AOxTAqlb3rfYYDDXRdRqFKq7jC0nsleE9UQZzBWYsTdFAopY0f/YHzH1+e/yzSDp/FwDk/C+74c3r5SeiSYXIP2u/nfu/0JcTV2HJMnD1P7OZotIQeUnD4i4dU/jmKnVtJ0wtw7M1gDuH5f07aeRv9lQ9RVonuwgw9WmTWm1PqgVIMK9zQIcManEN9i7ZzUoxI8rksSz4zHDtPv+yROKcqBN9YCqeIrDeshAwdpwxbg+Zx4b4FKQqq7R2SXTK/sqKshHro8roAQMsMAhATVZ2JdL2HhKFb9vQ+Mm3WCrMmI2QaFUNmZMQEzgrWKCZB2yt9yOS6/VnK+pifccej5qVcwbd5tslneNGNLEYFDTDMGtqXAL3//izs9IUZ+JH7FOCFC/WnhpNqXs0+MAnLKxrFSIoe7VokzbHViHTwDJSb9M0Cd+0Ci/0LVOMxxZ1fi+0vIIuX0KtPoCaiq4a4+A3MsqOnBClwt53LH7bpCI3n6MKC0ESqjSmTkzXWBMxwgD1+OzH2aLePaCTEhNqSajJAu57UdTRHAU7u4DY2McZiY5dFxWP2/hQT4Ch9oF32zPaWFDYy2qjYu9Iw2TBEXUsv9ErXgw/5387nf/s+gSQSWTYpIYQ+C6SFJPQxSxmmJCy6PNGf8Vxuip8lMucrphxm0w0RgpRhQ0iECFWp+BbmqaGyKquFko6733zF46Py6KMK8H9+4//z06//zY8+Z4rhV4TpriKF+K6n3NrGHx2AaREKRA3OOUZ33Mv4jZuYyYg0e56w/wKUxzBViT88Is4UUySalcFViWID+tUUY8hKrFs1k9tOMf3UAYfPt0yvNNQDqGpPefICw1tOgw6R+jjF6AQp9Fn3Ug2kwObxRS6FbE13eBn8DFWLHWyBLQjzozw90Hf0yxUEs27wK6fODTIkqnlmt20SbmBYLhIuCUWl2FWmUFR1DqvWZeN15P6xBiGErNZoRSkLwcTMd44xAwVNlyUcbrQko74sIJ78jZ0PQhEzIcAZGJeKKGa19IzH/ik+WxH8uXCysrytxL/0/j/1for6K5Jt1K+U2PR0fsHktnvR/ecQWxFnC8qt3PeV5oC4/yk0Bcz4DCl2SDun3VuRVok+aVacdeDbFpHcwouaMNcXFGNhPLSM3zFgdRQ5vNDTz8BMj1i+eERRQbVpqE9coFt12NGAvjdEranGE2xpCMsDUt9ipEREOHrpMpMzZ0h9IMXMShnubBNjT+oT82lPTHEtHCMUowrjW1wyOVxboS6FECKlKsOxJaE085R3TUhmWQaUyoHVfKb2IU8r9F5Z9Zm01/m8jiek7MlCJvurZDCnD9CtMrlvaDNJT5XkjJpjm3K5qv1zAA89/opHV9aQQxj+aoyj7zcyl2JQkuZTwnLK9b1PMtoQpJ9SFBbrBC/7iHO4wmE3TuLbgEtHNFfntAeJYmwZnaiojm1hnMmSR9h1MmigjfijBWkxhaZhuF1ibMHhhUjq8yB1v4S+S7TLFckZuist5VBo5lMc1yjGjmI8QYohIomiLigHLYcvvkQMlhQU3yRSaalqpWs8ZW3wQdm9mqgGDrPoma9ARFkslaNZDsmTSRYTv3wlsrVdMBjAwSzR+cx3DgrLLivbzTtousy3SikD+THBoMyaVEbIu54ysy1/f8wh2tlMpUspn9koWpfCcGzf+4d+cL5//nPQzvqsBn5kfQ7P3df+yig8e1DXRzt9G9SVVgablum1nuV1pSqgHCWkHOBnU3R4EhkfI157FoKymq5IgwFb945wpWCHA6IZkcwAcSNsMci00RSQoqMeLtF4HL9/wOzSLsbCzjnLYj+xOkxIUnyCplH6EDE20s6zDnSn4JqAXj1E5DDXzRGiZODc91lCeDSE5e6MVZuHybo+syd6D92+xxXKvMkiZT5pJqk3cPmaMqgzNef5Sz2uyp5obOZMtV0G7p2D0imrjnx/XD4GfMrS/63PkkphndA5s0aPbCbJo4qTHAUKq0xX6JljjnpYvRcaeQBe+fDZo48+uubffc/F+Yd+4b1u8YlvX16/ltQVVkph57RjeaQM7ng96WiffvcqWgjh4Dpua5voDelgTqonbL7xdeiaXeHVwfAupD6NEYeKzxCjujwNMX8OnT2Dm4zZvM0zvzpneeiZbBu2ThpWh0q7UOJC6ZpM/TJrXWdNma0oVqlrIYY8q9R2yrLJiY3qWnxMDY2HxRRcoUxGefCrDTnLVs3KsdYKvsttRGdzwqVJM+1mobQx94pV81CbWMGFbPCyyPNI6LrHHHM4n7WZUnuDl7XsckJViJCdV/BJkQSHK6F26iYjw/aW+1VAH+CzK999LiFa4TELEtPg/GMM9dvL5lcFN8EONtDZRdL8iOXudbbf8HbM5gn80SXS4QHNi7/F8PgOTZwzvu0UsVthTIXaAqluh8G94IZodxHRBRpSVquzx5HN14MbEucvkIIwPNHhBsJs10NIbBwzTE4b/EqYHCqrlTKfKqHNXOSihuEoly2xV6qBMI7CZoR6KIRgWS6V5Twxdsqx7UyKmy+VjW3HidqyWtNsdk4OWM56rl3t82tWMF3mCGIMjIdCrcL+fL1RzSjLVolr1mhdwLVDXWfgmWxnjN7MqPuQ55eCZtqtD0qZXi6bblRQpyZii9J8+Bu+6faPnT+/9zlJG36OZ/BDCeAT0+pfvO3Em16oX3/LHe3VDyczOm202GFju2P54gdIi4tUZ+6lvOVtpOU1+sPLpNk1mAzoj65Q22PIcJQ3npS3oFTQT8HvId1lwuwKSoGbnCB2pzHVKRjdmrlZqSe11xmesCyPlJeeybO1k20ojLA1gUEBXQdi8s3VGyMgm1kucL34mzYa0sqwuRWoSiV4ZbZUggqnzzomO5ajQxiVFlsb9g8CV670uFIwUbjnTsdqFRArHM4Te1Ol84lz23n9YtMrowoOlsqiBVfn6BGS5LBdZDKexkxud259LhdQrKk6IlnyfeCEwuYtjDsToSzNE/KVH/Tn34XjVfJgRETXMkr7i0/+lX9RlubPF5PbVVKHSokITO76Q3lv72oXZBcxjnrnBGlYUZ+taK48y+rgkKJdUW7dk4VWMoxNSo5w9ZO4+T59A5z1uOOWZAbgJhmEF0c52mJ2dRc3hGP3OA5ejCwvKM7lhReklxm34hS7XjPXtYpYoW+yLP/RPNIHYThQ9g9zyC7LzJx46qmEMREf1zUqOUmKkkP3rWcLnrmo7B0qmxOQlM/YaSu5qWE0U4A0G3mtaYVbrwyI6/cYUpYzrErJiRbrhzBo1qUGNkdgJL8meOxoKGFjk58EeOQB0qPveYV18O/oaglAG0Y/U7fXv19iNLgRFJrpMm6MSC7mtN8FVaJaJEWkqKhP30NYXEHUEtsF0l9HBneDugwzFmNk0GBsIrXXoK9J1Z1ZX2rjHvpmhimEatIwvzzFOMPkGOjWetlzB6mXTAyfJ1aNguTEp3A5JLoi38SdTWXWRK7vKc7BqM49kOU0sbORBXfEQBsM+zMlkOeH2pXwsecy/2o4NExnCWPzBEThhK0qJ3M+5EQqrUO4ajaSD7llmchD4eEm8T+H63Vvg9IJwzrrZRkRYpQ4KNQMBvaD3/XXmg+uwYX0ihsdv/16OAH88nT43m8/ufHRupq91a8OkqRg0jr7JbaZ9xQaKLaQ6iTEltTPYXQaUUH6FXZ0K747xFZNFjXTAUzupQ9LTB1wRkjmGMmM0DAntosM5mvegJY8+DYhhVCNHPVAqYdVllNKwsYq5P6xKQlBSMFjJVHVhhSE0HnGx4Sd43ng2/e5NNkYr2WBEUIyuAC43JUKHpwTxgPDeASrNtGsuYISc0i9gQCZ9ehqu84HDPnoMHlOICvPKliTvTilnOoo+TVJs3hpDEpZKILKrbdaOXmi/rtoz+MPc0PV9dUzsAi6nhdu5s//d/8Auf53dP6UaupJUmLqHUQkzwX3gdRcwkxAiglia1Kzj8gQqTegPoENPXH+Kdz22zBFnZ/kEFHp0eE5tD5D6A7zjqQY0JQIyyntsmF4YpPBxGKdohRr4dKEXzW08xZjhaKE0oU1KJ/X6vRdIPY5y/V+3T2S3GWwFvw6s24D9EnpYz5DQ/4xWKNYgfGooK4iF/vIshWEvFll0ebe8g012bAmv0ddl2mZEn0Tqb3RwWI9PZbLodzN8vHmf6faIpsTd+GW+878M5jJQ4/l2/VFULp7KAFy5Wj7n9w+qP6rcjy5pWtTIolJMWRCWbPI3f1kSPNdpFiQYt4vpCkRUoE2h5lD3Lfo8BwH1/YYjkZUx76OFFq8dujqiORniB2h4YjU7GNdydad9+MGI9LqCqmbZfW5VUNsAyJCWVu6VmmmMSdmZA1nMVlFYLUe30yq+HUd2vd58uBwup7JstD7LOQdfC6JAusMNyovXOgYDvOOhd7nkU40Ny9WPWvAPp/JSSV7t9zMZ0CU0grWal641WfcenMkFCbnDjHlrlnToaePiTmxM/y7X/+9n5w/9hBW5IskRvqZU//LZ37kx4b67I90iy6i1qr2JN8gyROOns8jIAimnFCMT3L5k58mdh3Hzh5DpMt7eds59vjbOTiqKK1ncvJOYrdCJWKsATz4Q9LsOZwRTDUgNbuoX9EtprTznhgSVgwiQr9KNAtlvJP7ejEKXZcVa6JmYshynmeLQjB0XhhPcq2yWGSkJ4rBFg4Ngek84Qroo7ycqIVcS8/bPPfbB2FQ5JC7uxDmLYxqWQuX5gerjy8DCzdeb+wa+8ipAmLArSNJWeY55bqSFL3ytnuqy9/wzpNvectfeOloPUj4xZETvuHFqioXP/r3/idjr39f0X/4eDs9SkmGhnoLNziJGbTgD0gxZT6ycSxmnuW0Z+PWk1T2GourFygHjub5J9k88w7M4CRheQXRlHcoxYbU7aL9YWYXqkdmC0xYkWIkxRJsQVEX+Q6liMFTOYOpHcl3FMMSO0z0XSBJng+uJkqJ0jWRjbpiethhjVJPhIEIi5Vj0ViGg8TIFYhNFFEYbigYYdUkbA2mVcxSoc2gwKxRhgMY1GCL/HD1IeEj4IXgszc7B5G8X1gkb2NJSRGFHqiNZASpMCRVfePthb3l7OTvvOUvvHT42JdCEDx7cd6vd/T0D/8/Nhe/+F8vLn86LqfelltnSZqIQShsQzXcIHUBOxjlVem2otw8Rnf1WVYHV1lMW8ZbFaFd4eoa4yymqIjJ4YoasZYYsjy/ldy31bBEUaIaNLakZNcAQcZgWeOwGgMYS+8NFJvEmGhWi8yxshXNMuRmQ4Kkib7L2pGY3OhfNaDGEjV7e25AJELINW8fdC0wmsN0VMkywV12yRve2fkE2DUsmEl1KWWXtdZgTZY1BM1CpKIUhcE5m3YGat549+CZN9y181X/4uC5xSNfwFr4L3DryuNJz583n+DWv4v/8J8Z2mde12iT4tFLppxMWO0t2Luy4vR9p7GuJiz3wda44Rb99etYB4NJRdclYkg4KeiPGuqdDQgRE1aEbo6UQ+xggqu2MsBDAaUh9EskLEnR590LJqM1XYgYJO9M0g6lRIY7hGQQGyilwPc+03OGMWevPmUj20BKKfehQyJKxnI77/EB2j7m2jWAD1k0RK3gfSCg6xFRi1ilDyl7pwiYPJ4iRjCSdykaTSjZmDlvyGNmIoI1Ji9kTcrJExUbW5P/+9f8pedm67P3817K8QUZWATVxz5u3vjGR+d7H/0v/wrx2s9U0w+n3qvRbsnOTkXRdfSXryI2r7gJBopjkdi0FLXB1gXbZ2sIkRR7RtUIKQb0exexRZ4+iqkhzJvcFDZFFh0vRrhyQNctUWpsMQExNKtZ1gCxdZ4UTHkVQFnUxGaB9x0xGVISgu8JfVgvtDKkyHqRVsoLplFiTPQ+0nURr4a+jyxbXSvBgmok6JpWExM+5DIpxOzlGRlK65FRId5A9SXrVmr0OGcQZ/Igm8nj1zZzsNKpTWdHQ/uzf+zRF39mvXHlC1qO9QXvTZKHH0+PPfaQPf6Wv/VPjz78Hz2+efbaQ4eXrkXCyoZ2yeT4kNhDXKyIKtikhIMrLGY5/5qcrDEiGAKC0sVZfopNzlhzPWjz4HQ4zLrKtiQtLSoFrhgQxNAcXcW6AYolrKZYO6MoXJYIlsDq+ovMpy2jnQnGFLSrFculRzB5sGst09R1nqMjTx8zm6OP0LRrWUEkh+VOGE8qmra/ebr5kPcdZSNnzDemnAqJXTcwUo4qGbXRNZBgc128zqyNKM4KIUadDK3cetLObz81/mHYuzGDwJfUwIA+9NB9qvq4HFx64L/ozPQPj/R9p0LnkzatWe61jG65C1NdpYht7mqZgnKQPalddHnbyo0s0uYej7UG7xOXLgjbW4FqmDNMQUDbnE9pLl/U5nq26zITM4ZAWWWKaUoJV2ZR0d5Du2yoRoPM6erzGe7bRNflicmmU9pWsYMxhavo53Mmo5LRuKRpOvYOGqqNihAjySdWvVJWFklgSDhZCx44xTrLchnpu5TZoJq9ue3z5y1c3jEcvVKWNu/XjErSSOkk3XNK7Okd9//61h994ZNf6L6kV5Rk/fZFHQ/Zhx9+PB4991/9yc3u/f/f/vAgipSmnx5Kzg4jutpHrMkge9diqwluNKCfXid0Gd6zYvBdwJhEPXYcHjjqkUEk0M48fZdLiGLNhMx7JdfrXdf6uz5a2kVYe11uYviQW0l5n6Cul0zmGjgCUS3eJ+IamqvGY7Z2Ntm7fkBZWWIIXLzcM1ust4jG/L1Yg7VZ/aYoMqDf9dkbk94g1+X3oAhdyJ8zy1rk3ndZWYYDi9WU26nWpDNjNa+7rfiVePz4u1/gxf6RR7OgwhdqH/tKDfz44x9X1Yfs4Njf++h/+ee+5q7BsP0KP59HU28ZsSUptEg5Rk2JrSfrzSMriu1zhBBxZUHfeWIMFMOSYrKJsYnNnTIv57ADjDOI5HBHTKSg1BsW52A4MAxGQlkLw6HB2cyRUm5kwnlHU1i3/mwhNC1M50JRFrStsupyOaMKg9qye33JwX7DfN6zux/o+wwNhtwwoypz88L7XBvHuCYJ+HVE8Z8B9emaUWmy6p6RjBY5l+UJ+y7kzW2QJES566Q9uOfO8bf/sfOXdx94AHnwPa9s3furtCA6A3Mf+9d/fuue4cVfHPiX3r44mkZjRzb6HrElSJ0zS3pSNyUBxg3QboYxjm45Q03FhYsVt545wuWtj0QfMeUA37d0vbLYDzqqEd8HfBuQlMuV4HM7ECtUk5LltGO2gGJQ4oqKtovEEBhUwmqVqTNJE00vLNvE/lHECAwGwmyRsC4LgNrC0neRRQfdei+dtS97LJLZHF2fGyI+ZAC/84oxglkbt3B5w8qyySWUWbcko+Yed4mGd9xdure+afKn/+iP7f/jxx7CPvw4r3jV+6u44j2PuVz6wJ95w0668h4ze+Fk50m2GJh+OcsT6y6r75iiIK4OSLHHFQVq1nM5/YrICCs9oZnirMG3HT4EEEdkzEc+4rnrdmU0tJACvvX4NrE48rQt2IHBWaHvIqsW1BrqYZ1HW1B802QC3Lp3vFhCPShYtonLV3uKYi0ZCNjS4KNh1cPBNGZajskdKL+mwcaUDaySaTjOQF1k7ckbG78xWavjhpqOIU/rsP49dUF4223W3XXHxo//h3/n8AdeLeO+qgb+zAbI7q/9ie+YpE8/3u5fKkIoKIcbEtv1xm5ibkKs19wlyVtGjK2yCFpKmGKMBk/olpmMFiNd01BWBV0/5Pq1OSfPnST5Dk09GgLdsqGZ91BmQt3BbsT3+deElJGbEPI53Pbrda9kKk9UYTQ0HM1zImRszmoj4NWwWK2J7RlxQaywbHNi5iMkyeBCBiRyJEnrc9eQc4cbD42udTfMerQKId590tg33DX8pa//jtP//of/4XPhocfXR/eXm4E/08jTD3339xSzT//P/nA3UW0ZurnE1W7W8iBntxpjfoytxRRlxig072d1ZYUtKmLfIaqItbTLKaghUZKkInRZkiF4T4pKu+jwfcA6oVlEQswoTYgQemXRsN4hmOGbmFcMkyTTcJRs+LbLYqLKGrNde2vTr61ksrf2/gbNJidyRrJ67A2ajV0T5lLK9a0za0LAugysC+LJDewb7xl94M1fc8s3fv33fnL+uW5T+VKUSb9LE+TxuDbyP5x96OETG1Xx12ZXrqTgI2gps90847tx4hj9YkpoV4gkut7nBoDN4xqIoEkpSpMzzKIgRej7jhCatRiMIWgm1aWk4BzOFqj3DCc5a+16pZsljBOGo8zCrC1YJ1nCqIRlC8NhBhKwkr1+HSBDt14cSSYHqGR0CVmfozHDiLIeIKnWgqpmbVwrGeuty9xjVl2r3BnCmS3cG+6onn7DfYPv+Prv/eRcz2O+kG7Vl9SDsxcj8JAReTzu/fq3/eh4/tyj8/1ZTFKZ2HYy259TlGAk5QVYqoQ1j9gVWTldrMO4GkFJoUWjz499OaRbZc3f7KU5aSkquybPK12rlAOhWeZ2ZFjTZLzXHKbV4P0a5VkrziWTRzu7PofeRDZ83u97o0uVxUZ7z03V967P9Jv8CMhaQTZ7c13mt2yt3LzRNstvhOMj3JvuKD594vaNd3/7j+49+2qeu190A//OcH3wG//ej2wsr/zY4d4y5dDam67pCT5SVlUWPevnOQnqffZGcndIxGKcJfUejMVUI5rZIc2iIQaDG+StYiJKv8rhOSRhtUrUQ4eQ4cHGZ4PpepZIRTLVJyTaNhPauygsl+tEyEHT5Qiga+EmH/SmOo5qDrV9EHyStRRwvqVpzZq067BdllA5Q2EVTYTjY3V3nLKfPH1y8J3/t78x/+QXy7hfdAOvvdmKEHd/9YEfLg5f+KtHu1OCGScr1iAO7wOmqHHO5uZ8yrO+KXr6doViM31BTJYgCpGirOmaJSF4sCUaFI2edrlgtWox1mELB0a4djWAibm5kRzWmLwPeE2lqAtD0gzttV2kC2YN8ymIW4MIGSVadkq7xpfFyloG+OWYKmv9zUxkV5reUJeCM4nCQmkJt+3gbjtp37t9cvQnv+u/PrzwxTTul8rAN8P1tZ//6v84HLzwP02vHw5WvoxlWVlrHc45EMXVE5zL/WIx9XoPQn6bIfh1Upbdy1iXJxR6Twy53ZhCoOv6vMbGOKIPKJbOR5rG07breWlbMF+u6Pq0FkBRwjr5CjGrwyrycm953U/NsgogxmAk86hvCHdn9VjNGPg6Rut6sjOpam01vfk2a287Xfz0A99695858+6PLr/Yxv2SGPimoZ94l5MH3xOu/dI7/gjTvX+4uHTt7P5RG4rSudK5zEPqPLbepHBZ0yJSgrU5s85ZFc4VqCT6zhNi7k5hioy1RiWhN1Vr2i5DfTEZYmC9gTsnc66oSArLVU/vA2ILuj7QtIG0ptw0fcKvM2XND2s+r/Xmw5vDuWSAPsQ8+ZDP2Vw6+SRxUqt9060Fd95S/K0/9lff/ZdFHo+vtMf8ZWdggCeeeJd78MH3hJf+zUP3jPY+8j/4vcvffPmlhYZkVAxGVel74fjxkr7X3Mp0ynwOq3lksinMVusZXM0JE2KoBvW6xkw3DRzXKE8fNavJr9XlQoLWp7WsoVs/AImEySMrXcD7HKJjXBtprdMcNY+riJF1cM5Zs1krwXZ9QozgsvKyxkQ8s23c68/Yw9vu3Pihd//I1X8MyFq5X78U9/xLamCAG1tCfuIDP1F8196P/9jq4uW/vLh2wOFUw7U97MaGk63NtKa3CGVhKJxhf9/T9YnxZs18mTic5iWPeYI/5UQnZbm/mF4e2A4pTyz49XSfXcORXcjZs9d1iDVZ/SYqiLX4KHlQ3Jj1z8rqdKAYoxRGQYVRbeg8LNdsTVUhQSydsa87I9x52j75xtdNfuArfuDaU+uQnOBLY9zfEwMDfGZ4uvYrX/Mt/YWX/rpMD9/80sWW5YqYEBvjeojLCNZm4HRvPyKu4OTJIb7v6H0grEcFYlQSltki4kSph4ajWWTRKL2X9SKq/HFbnwfKlIz7+vCyEFlYD2K3/oYnZu+9kTUbybK/wsv7FYoiK9GJSIqKbg7FntuR+W2nir9x/Nvf8d8++OB7wmOPYR9++It73n7ZGPjl5CsT9/d+/T/c0Kvv/eGDl/b/UjtvRtf2o3ZZacHGdXMgJDK+2+fwOxoWlEXey9v3OYxWlWPVpnXPWDiaK22fRVHE5Lo1RFlzlLNQig8Z3vvM2VxZQ3yK0Pr1alhePntv3LXCCnWelkjGoMPa2Fu3LeeO25+9587yR9/5l48++jsf6H9nDPw7QzbAwb9685uvf+ryj159afHdfdtztFDNOp1ikiLGrOG2NbZ7o6EQNeOyTZdX1wQ1dF5vksrzDuC1l6vkVQHkCcB+TY6L68HspOtzupf1fFIGCmLKQIK1nyE5mPsjaXMo7tbjlhPb7pN3ni3+22//q4v/BZS1135JQ/KXnYFvevPjN/bSCxceu/Ub9y5Mf2h25L9zMWvZPUh4JZSFGNZNQb1pDM1erTfQndzI8MrN7SZG8tnZh3w+3/DgeGPALCk+ys3XZe5VNiasB8YyEknSm2uGZViJObdjOLVtnr7lZP0T73z38O+fefe1JSDnzyOP/h557ZedgT/zbAbI4Uy48NP3fuPh5dmf27u++K7lvHerRlFr02zea0oqGDGypqEqa8OlLHHUr6cZ+qA3gfdlp6z6G0R4uamdoWTvzrhtnh2yJoftqORVzkoKUdVZcae2hJObhu0Jv3nLieLvf91bz/3k8T/93AzgS1Hb/r418Ms0IOxTT6E3POD6z73xK66+sP8ndq8uvq1t9E0HBz3TZWTZokaIxiDOIsaIRES8zwo29mZSlXf09uvtYXCjtMlJVljrVlmTI2nKutyqisaUiRjDWjixIWxO7N7JHfnnd5ytfvpdP/ItPyfyeLzxnh96+NWD+f5AG/h3M7TqPdVz/2j/wYPr/psOp+Hblot4X9eEjM22eZPJvNOYs2K5OUF/Y0Z3PcSXWZM+h3Rdj28agZhUk2JLh9SFsDWEjZFQVRyMavlXJ7bNL7zp9skvvO4vHVy8+R4fwr6a+O2/Uwb+zND9JJgHH80apNnY76pf/EcffcfBQfcN166F+9qetx0u9c4YdOQ9rLqUSW8pd5WSCq1PmcYa8xCZpoz0VIVQV0JhMwBRV/qiE336+IZ9amNsfu0N95h/ffefXV678bsfegj7EPClrmn/wBr4plFBeAzzOPA7a0pVlQ/97Y17RpW7dzrrTh8t9A0hmON9FzfajqEPqeojLgRNfdRkRPq6KrqicHPj9LAsef6WY8WlVTJXv+ndxQflK6+sPvPnn8/5gXnkEeKXqgv175yBf6exH38Ic+I+5AFIX4Q6U544j939OPrQY6TfT0b9A2Hg/3+f5fx55JH7kSefQnY/ng3yOHDffejv3JJ9fv3ZP/4Q8hDAQ3Bi/X1fzmfqa9dr12vXa9dr12vXa9dr12vXl8H1/wMM842P2cvbnAAAAABJRU5ErkJggg==',
  'data:image/png;base64,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',
  'data:image/png;base64,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'
];
const VAAR_BN=['রবি','সোম','মঙ্গল','বুধ','বৃহস্পতি','শুক্র','শনি'];
const HM=['Chaitra','Vaishakha','Jyeshtha','Ashadha','Shravana','Bhadrapada','Ashwina','Kartika','Margashirsha','Pausha','Magha','Phalguna'];
const VM=['Vishnu','Madhusudana','Trivikrama','Vamana','Shridhara','Hrishikesha','Padmanabha','Damodara','Keshava','Narayana','Madhava','Govinda'];

// Tithi effects
const TITHI_FX=['New beginning, auspicious start','Prosperity & growth','Victory & success','Danger — avoid important work','Auspicious for all good deeds','Good for social gatherings','Win over enemies, good travel','Mixed — caution for new work','Completing pending tasks','Excellent for all activities','Ekadashi fast — highly sacred','Breaking fast, gifts & charity','Avoid new ventures','Ancestral worship, sacred','Full Moon — very auspicious',
'New beginning after full moon','Growth of plans','Success in undertakings','Obstacle — delay decisions','Auspicious, creative work','Pleasant, social activities','Overcoming adversaries','Eight directions — be cautious','Completion of tasks','Good for regular activities','Ekadashi fast — sacred vrat','Post Ekadashi, charity','Avoid new ventures','Ancestral rites','New Moon — worship ancestors'];
const NAK_FX=['Swift & fierce, good for bold acts','Fierce, avoid auspicious deeds','Mixed, good for cooking & fire','Very auspicious, love & growth','Gentle, good for creativity','Sharp, removal & healing work','Auspicious, renew & restore','Excellent for all beginnings','Sharp, avoid new activities','Good for old work & traditions','Pleasant, arts & romance','Stable, sacred ceremonies','Mobile, journey & trading','Sharp, piercing tasks','Good for moving & travel','Auspicious, spiritual growth','Devotion & fixed tasks','Sharp, fierce activities','Fierce, avoid auspicious deeds','Speed & travel, good for haste','Fixed, stable ceremonies','Good for learning & devotion','Quick, good for moving tasks','Severe, purification tasks','Fierce, avoid major starts','Fixed, stable ceremonies','Gentle, renewal & auspicious'];
const YOGA_FX=['Inauspicious — obstacles likely','Love & friendliness abound','Longevity & health favored','Good fortune in all matters','Prosperous & beautiful time','Anger & sudden obstacles','Good deeds bring results','Stability & determination','Thorny path — avoid big moves','Obstacles & health issues','Growth & financial gain','Fixed & stable, good for vows','Sudden setbacks possible','Joy & happiness prevail','Sudden dangers — be careful','Success in all endeavors','Highly inauspicious — avoid','Very auspicious & favorable','Encircling obstacles to remove','Auspicious, Shiva-blessed','Success with effort','Achievement of goals','Auspicious for good deeds','Pure & clean time','Brahma-blessed — sacred deeds','Indra-blessed — victory','Highly inauspicious — avoid'];
const KARANA_FX_LOOKUP={
  'Bava':'Auspicious for all works — good for new beginnings & prosperity',
  'Balava':'Favorable for love, arts & pleasant activities',
  'Kaulava':'Good for friends, family matters & gentle pursuits',
  'Taitila':'Auspicious for agriculture, trade & steady work',
  'Garija':'Suitable for travel, seeking boons & religious acts',
  'Vanija':'Excellent for commerce, trade & financial dealings',
  'Vishti':'Inauspicious (Bhadra) — avoid new work & important decisions',
  'Kimstughna':'Fixed — auspicious start of lunar cycle, good for sacred rites',
  'Chatushpada':'Fixed — auspicious for animal-related & agricultural work',
  'Naga':'Fixed — good for mantra, tantra & occult practices',
};
const MEFF={
  'Brahma Muhurta':'Best for meditation, study & prayer. Spiritual practices begun now bear great fruit.',
  'Abhijit Muhurta':'Victory muhurta. Excellent for important work, meetings & new starts.',
  'Vijaya Muhurta':'Afternoon victory period. Good for negotiations, signing agreements.',
  'Godhuli Muhurta':'Sacred cow-dust time. Auspicious for prayers, marriages & new ventures.',
  'Nishita Muhurta':'Midnight — for Tantra, Mantra & deep Sadhana. Highly sacred.',
  'Amrita Kala':'Nectar time — all deeds performed now give abundant results.',
  'Rahu Kalam':'Rahu rules this period. Strictly avoid new beginnings & auspicious work.',
  'Yamaganda':'Yama\'s period — inauspicious. Avoid travel & important decisions.',
  'Gulika (Mandi)':'Saturn-influenced — delays & obstacles. Avoid auspicious activities.',
  'Varjyam / Tyajya':'Moon-based inauspicious window. Avoid important & sacred activities.',
  'Dur Muhurta 1':'Daily inauspicious slot — avoid new ventures & rituals.',
  'Dur Muhurta 2':'Daily inauspicious slot — avoid new ventures & rituals.',
};

// ═══════════════════════════════════════════════════════════════
// VEDIC CALCULATIONS
// ═══════════════════════════════════════════════════════════════
function tithiIdx(jd){return Math.floor(norm(moonLong(jd)-sunLong(jd))/12)}

function getTithiPeriods(jd,count=10){
  const periods=[];let s=jd-0.5;
  for(let i=0;i<count+1;i++){
    const idx=tithiIdx(s);
    const end=findElong(s,s+2,((idx+1)%30)*12);
    periods.push({index:idx,name:TITHI[idx],paksha:idx<15?'Sukla':'Krishna',startJD:s,endJD:end});
    s=end+.0001;
  }
  for(let i=1;i<periods.length;i++)periods[i].startJD=periods[i-1].endJD;
  periods[0].startJD=findElong(jd-2,jd,periods[0].index*12);
  return periods;
}

function getLunarMonthTithis(jd){
  const elong=norm(moonLong(jd)-sunLong(jd));
  // Use -3 guard (was -2) so we don't miss New Moon when elong is very small
  const prevNM=findElong(jd-(elong/360)*29.53-3,jd,0);
  const periods=[];let s=prevNM+.0001;
  for(let i=0;i<30;i++){
    const idx=tithiIdx(s);
    const end=findElong(s,s+2,((idx+1)%30)*12);
    periods.push({index:idx,name:TITHI[idx],paksha:idx<15?'Sukla':'Krishna',startJD:s,endJD:end});
    s=end+.0001;
  }
  for(let i=1;i<periods.length;i++)periods[i].startJD=periods[i-1].endJD;
  periods[0].startJD=prevNM;
  return periods;
}

function getNakshatraPeriods(jd,count=3){
  const SPAN=360/27;const periods=[];
  // Search up to 3 days back; use jd+0.5 as upper bound so bisection
  // doesn't collapse to jd when the current nakshatra is still ongoing
  let idx=Math.floor(moonLongSid(jd)/SPAN)%27;
  const curNakStart=idx*SPAN;
  let trueStart=findMoonLng(jd-3,jd+0.5,curNakStart);
  // Safety: if bisection returned a start that's after jd (no crossing found
  // in window), fall back one full nakshatra span earlier
  if(trueStart>jd) trueStart=findMoonLng(jd-4,jd,curNakStart);
  let s=trueStart;
  for(let i=0;i<count;i++){
    // NOTE: idx is carried forward rather than re-derived from
    // moonLongSid(s) here — s sits exactly ON a boundary, and
    // floating-point bisection can land a hair below it, which would
    // floor() into the WRONG (previous) index and collapse this
    // period's start/end to the same instant (0-duration bug).
    const end=findMoonLng(s,s+3,((idx+1)%27)*SPAN);
    periods.push({index:idx,name:NAKSHATRA[idx],startJD:s,endJD:end});
    s=end+.0001;
    idx=(idx+1)%27;
  }
  return periods;
}

function getYogaPeriods(jd,count=3){
  const SPAN=360/27;const periods=[];
  const c0=norm(moonLongSid(jd)+sunLongSid(jd));
  let idx=Math.floor(c0/SPAN)%27;
  const curYogaStart=idx*SPAN;
  let trueStart=findYoga(jd-3,jd+0.5,curYogaStart);
  if(trueStart>jd) trueStart=findYoga(jd-4,jd,curYogaStart);
  let s=trueStart;
  for(let i=0;i<count;i++){
    // idx carried forward — see note in getNakshatraPeriods above for why
    // re-deriving it from moonLongSid(s)+sunLongSid(s) at the boundary
    // itself is unsafe (floating-point rounding causes 0-duration bug).
    const end=findYoga(s,s+4,((idx+1)%27)*SPAN);
    periods.push({index:idx,name:YOGA_N[idx],startJD:s,endJD:end});
    s=end+.0001;
    idx=(idx+1)%27;
  }
  return periods;
}

function getKaranaPeriods(jd,count=5){
  const periods=[];
  let idx=Math.floor(norm(moonLong(jd)-sunLong(jd))/6);
  // Extend window to jd+0.5 so bisection doesn't collapse when karana
  // boundary is right around now; also search 2 days back (karana ~6h)
  let trueStart=findElong(jd-2,jd+0.5,idx*6);
  if(trueStart>jd) trueStart=findElong(jd-2,jd,idx*6);
  let s=trueStart;
  for(let i=0;i<count;i++){
    // idx carried forward — see note in getNakshatraPeriods above for why
    // re-deriving it from norm(moonLong(s)-sunLong(s)) at the boundary
    // itself is unsafe (floating-point rounding causes 0-duration bug).
    const end=findElong(s,s+1.5,((idx+1)%60)*6);
    periods.push({index:idx,name:karName(idx),startJD:s,endJD:end});
    s=end+.0001;
    idx=(idx+1)%60;
  }
  return periods;
}

function gaurabda(date){
  // Gaurabda year starts on Gaura Purnima = Phalguna Purnima (Sukla Purnima when Sun is in Aquarius/Pisces ~Feb-Mar)
  // Approximate: find the Purnima (Full Moon, elong≈180°) closest before/on this date in the Feb–Apr window
  const y=date.getFullYear();
  // Search for Purnima between Jan 15 and Apr 20 of current year
  const winStart=dateToJD(new Date(y,0,15));
  const winEnd=dateToJD(new Date(y,3,20));
  // Find all Purnimas in window (elong = 180°, tithi index 14)
  let gauPurnimaJD=null;
  let s=winStart;
  while(s<winEnd){
    const idx=tithiIdx(s);
    const end=findElong(s,s+2,((idx+1)%30)*12);
    if(idx===14){gauPurnimaJD=s+(end-s)/2;break;} // found Purnima; take midpoint
    s=end+.0001;
  }
  if(!gauPurnimaJD){
    // Fallback: crude March 15 cutoff
    const m=date.getMonth()+1,d=date.getDate();
    return y-1486-((m<3||(m===3&&d<15))?1:0);
  }
  const gauPurnima=jdToDate(gauPurnimaJD);
  return y-1486-(date<gauPurnima?1:0);
}
function hinduMonth(jd){const idx=Math.floor(sunLongSid(jd)/30)%12;return{name:HM[idx],vaishnavName:VM[idx]}}
// Find the most recent New Moon at or before jd, and the next New Moon at or
// after jd, using a tight ±2.5-day bisection window centred on a synodic-rate
// estimate. A wide blind window (the old approach) could accidentally skip
// over the nearby conjunction and lock onto the NEXT one instead whenever jd
// sat within ~1-2 days of an upcoming New Moon — silently merging two lunar
// months into one and breaking Adhik Maas (leap month) detection.
const SYNODIC_MONTH=29.530589;
function prevNewMoon(jd){
  const elong=norm(moonLong(jd)-sunLong(jd));
  const estDays=elong/360*SYNODIC_MONTH;
  let lo=jd-estDays-2.5,hi=jd-estDays+2.5;
  if(hi>jd)hi=jd;
  return findElong(lo,hi,0);
}
function nextNewMoon(jd){
  const elong=norm(moonLong(jd)-sunLong(jd));
  const estDays=(360-elong)/360*SYNODIC_MONTH;
  let lo=jd+estDays-2.5,hi=jd+estDays+2.5;
  if(lo<jd)lo=jd;
  return findElong(lo,hi,0);
}
function adhikMaas(jd){
  const prevNM=prevNewMoon(jd);
  const nextNM=nextNewMoon(jd);
  const sS=sunLongSid(prevNM),sE=sunLongSid(nextNM);
  const moved=norm(sE-sS);
  const dist=norm((Math.floor(sS/30)+1)*30-sS);
  const isAdhik=dist>=moved;
  const sunMid=norm(sS+moved/2);
  // Adhik Maas takes the name of the FOLLOWING Nija month (the next sankranti's rashi),
  // not the sign the sun is currently in. e.g. Adhik between Vaishakha & Jyeshtha 2026
  // is "Adhik Jyeshtha", matching Drik Panchang.
  return{isAdhik,nextMonthName:HM[(Math.floor(sE/30)+(isAdhik?1:0))%12],isPurushottam:isAdhik&&sunMid>=60&&sunMid<90};
}

// ═══════════════════════════════════════════════════════════════
// MUHURTA — computed from a SPECIFIC vaar's sunrise/sunset
// ═══════════════════════════════════════════════════════════════
const RAHU=[8,2,7,5,6,4,3],YAMA=[4,8,3,7,2,6,5],GULI=[7,6,5,4,3,2,1];
function dayParts(sr,ss){
  const parts=[new Date(+sr)];const ms=+ss-+sr;
  for(let i=1;i<=8;i++)parts.push(new Date(+sr+i*(ms/8)));
  return parts;
}
function partPeriod(arr,wd,sr,ss){const p=dayParts(sr,ss);const i=arr[wd]-1;return{start:p[i],end:p[i+1]}}
const DUR={0:[5,8],1:[7,15],2:[1,8],3:[3,11],4:[6,14],5:[7,9],6:[3,15]};
const VARJ_OFF=[7,4,10,4,14,8,6,2,4,4,12,2,6,4,4,6,2,4,4,4,4,4,4,4,2,4,4];

function getMuhurtaData(vaar,lat,lng){
  const{sunrise,sunset,brahmaMuhurtaStart,brahmaMuhurtaEnd}=vaar;
  const wd=sunrise.getDay();
  // Get accurate solar noon and moon times for THIS vaar's date
  const t=SunCalc.getTimes(sunrise,lat,lng);
  const noon=t.solarNoon;
  const mt=SunCalc.getMoonTimes(sunrise,lat,lng);
  const moonrise=mt.rise||null,moonset=mt.set||null;
  // Next day sunrise for nishita
  const nextDay=new Date(+sunrise+86400000);
  const nextSR=SunCalc.getTimes(nextDay,lat,lng).sunrise;
  const midnight=new Date((+sunset+nextSR.getTime())/2);
  const durMs=(+sunset-+sunrise)/15;
  // Nakshatra index for this vaar (use JD of this vaar's sunrise)
  const jdSR=dateToJD(sunrise);
  const nakIdx=Math.floor(moonLongSid(jdSR)/(360/27))%27;
  const varjOff=VARJ_OFF[nakIdx]*48*60*1000;
  return{
    sunrise,sunset,noon,moonrise,moonset,wd,
    brahmaMuhurta:{start:brahmaMuhurtaStart,end:brahmaMuhurtaEnd},
    sandhyaEnd:new Date(+sunrise+48*60*1000),
    sunsetSandhyaStart:new Date(+sunset-48*60*1000),
    rahuKalam:partPeriod(RAHU,wd,sunrise,sunset),
    yamaganda:partPeriod(YAMA,wd,sunrise,sunset),
    gulika:partPeriod(GULI,wd,sunrise,sunset),
    abhijit:{start:new Date(+noon-24*60*1000),end:new Date(+noon+24*60*1000)},
    vijaya:{start:new Date(+noon+(+sunset-+noon)*2/5),end:new Date(+noon+(+sunset-+noon)*2/5+48*60*1000)},
    godhuli:{start:new Date(+sunset-24*60*1000),end:new Date(+sunset+24*60*1000)},
    nishita:{start:new Date(+midnight-24*60*1000),end:new Date(+midnight+24*60*1000)},
    durMuhurtas:(DUR[wd]||[]).map(pos=>({start:new Date(+sunrise+(pos-1)*durMs),end:new Date(+sunrise+pos*durMs)})),
    // Only use moonrise if it falls within this vaar's day window (sunrise → next sunrise ~24h)
    // SunCalc can return yesterday's moonrise if moon hasn't risen yet today
    varjyam:(moonrise&&+moonrise>=+sunrise&&+moonrise<+sunrise+86400000)?{start:new Date(+moonrise+varjOff),end:new Date(+moonrise+varjOff+38*60*1000)}:null,
    amritaKala:(moonrise&&+moonrise>=+sunrise&&+moonrise<+sunrise+86400000)?{start:new Date(+moonrise+varjOff+68*60*1000),end:new Date(+moonrise+varjOff+106*60*1000)}:null,
  };
}

// ═══════════════════════════════════════════════════════════════
// VAAR STRIP — each button represents a DIFFERENT calendar day
// ═══════════════════════════════════════════════════════════════
function getBM(date,lat,lng){
  const t=SunCalc.getTimes(date,lat,lng);
  return new Date(+t.sunrise-96*60*1000);
}
function getVedicVaarIdx(now,lat,lng){
  const todayBM=getBM(now,lat,lng);
  const tomorrow=new Date(+now+86400000);
  const tomorrowBM=getBM(tomorrow,lat,lng);
  if(now>=tomorrowBM)return tomorrow.getDay();
  if(now<todayBM){const y=new Date(+now-86400000);return y.getDay();}
  return now.getDay();
}
function getVaarStrip(now,lat,lng){
  const activeIdx=getVedicVaarIdx(now,lat,lng);
  return VAAR.map((name,i)=>{
    // Offset from today: 0=today, 1=tomorrow, -1=yesterday etc wrapped in 7
    const diff=((i-activeIdx)+7)%7;
    const dayOffset=diff>3?diff-7:diff;  // -3 to +3
    const td=new Date(now);
    td.setDate(td.getDate()+dayOffset);
    // Use noon of that day so sunrise is reliable
    const noon=new Date(td.getFullYear(),td.getMonth(),td.getDate(),12,0,0);
    const t=SunCalc.getTimes(noon,lat,lng);
    const sunrise=t.sunrise,sunset=t.sunset;
    const bm=new Date(+sunrise-96*60*1000);
    return{index:i,name,isActive:i===activeIdx,dayOffset,
      brahmaMuhurtaStart:bm,brahmaMuhurtaEnd:new Date(+bm+48*60*1000),sunrise,sunset};
  });
}

// Special yogas
const SARV=[[0,[0,7,20,21,22,23,26]],[1,[3,6,7,22,23,24,25,26]],[2,[0,3,15,16,17,26]],[3,[3,6,7,15,22,23,24,25,26]],[4,[3,6,7,15,22,23,24,25,26]],[5,[3,6,7,15,22,23,24,25,26]],[6,[7,15,26]]];
const AMRT=[[0,[23]],[1,[3]],[2,[3]],[3,[6]],[4,[6]],[5,[7]],[6,[26]]];
function specialYogas(vaarIdx,nakIdx,vaarStart,vaarEnd){
  // vaarStart/vaarEnd = Brahma Muhurta start to next day BM — the full Vedic day span
  const r=[];
  const t=vaarStart?{start:vaarStart,end:vaarEnd}:{};
  if(vaarIdx===0&&nakIdx===7)r.push({name:'Ravi Pushya Yoga',symbol:'☀️',desc:'Sunday + Pushya — extremely auspicious',...t});
  if(vaarIdx===4&&nakIdx===7)r.push({name:'Guru Pushya Yoga',symbol:'🪔',desc:'Thursday + Pushya — highly auspicious',...t});
  const sc=SARV.find(([d])=>d===vaarIdx);if(sc&&sc[1].includes(nakIdx))r.push({name:'Sarvartha Siddhi Yoga',symbol:'🌺',desc:'Favorable for accomplishing all goals',...t});
  const ac=AMRT.find(([d])=>d===vaarIdx);if(ac&&ac[1].includes(nakIdx))r.push({name:'Amrita Siddhi Yoga',symbol:'🌼',desc:'Very auspicious — removes obstacles',...t});
  return r;
}

// ═══════════════════════════════════════════════════════════════
// FORMAT HELPERS
// ═══════════════════════════════════════════════════════════════
function fmt12(d){if(!d||isNaN(+d))return'—';return d.toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit',hour12:true})}
function fmtDate(d){if(!d||isNaN(+d))return'—';return d.toLocaleDateString('en-IN',{month:'short',day:'numeric'})}
function fmtDT(d){return fmtDate(d)+' '+fmt12(d)}
function sameDay(a,b){return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate()}
function fmtEnd(end,ref){return sameDay(end,ref)?fmt12(end):fmtDate(end)+' '+fmt12(end)}
function dur(s,e){const m=Math.round((+e-+s)/60000);return m<60?m+'m':Math.floor(m/60)+'h '+(m%60?m%60+'m':'')}
// Relative-time pill — "starts in 2h 14m" / "3h 41m left" / "ended 12m ago"
function relStr(s,e,now){
  if(!s||!e||isNaN(+s)||isNaN(+e))return{cls:'past',txt:''};
  const nm=+now;
  if(nm<+s){const m=Math.round((+s-nm)/60000);return{cls:'soon',txt:'starts in '+(m<60?m+'m':Math.floor(m/60)+'h '+(m%60?m%60+'m':''))}}
  if(nm<+e){const m=Math.round((+e-nm)/60000);return{cls:'live',txt:(m<60?m+'m':Math.floor(m/60)+'h '+(m%60?m%60+'m':''))+' left'}}
  const m=Math.round((nm-+e)/60000);return{cls:'past',txt:'ended '+(m<60?m+'m':Math.floor(m/60)+'h '+(m%60?m%60+'m':''))+' ago'};
}
function relHTML(s,e,now){const r=relStr(s,e,now);if(!r.txt)return'';return`<span class="vp-rel vp-rel-${r.cls}">${r.txt}</span>`}

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════
let LAT=22.5726,LNG=88.3639;
let selectedVaarIdx=null;
let selectedAnga='tithi'; // tithi | nakshatra | yoga | karana — option-driven anga view
let DATA=null;

// GPS
// location handled by main app via window._appLat/_appLng

// Clock
function tickClock(){
  document.getElementById('vp-clock').textContent=new Date().toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit',second:'2-digit',hour12:true});
}
// clock handled by vpStartClock

// Grid toggle
function toggleGrid(){
  const w=document.getElementById('vp-month-grid-wrap'),b=document.getElementById('vp-tithi-toggle');
  w.classList.toggle('open');b.classList.toggle('open');
}

// Vaar selection
function selectVaar(idx){
  selectedVaarIdx=(selectedVaarIdx===idx)?null:idx;
  renderAll();
}
function clearSelectedVaar(){selectedVaarIdx=null;renderAll();}

// Step the displayed day forward (+1) or backward (-1) around the 7-day
// orbit ring, relative to whichever day is currently shown — used by the
// swipe gesture on the dial. Mirrors tap selection (an explicit index equal
// to activeVaarIdx renders identically to the null/"today" state).
function swipeVaar(delta){
  if(!DATA)return;
  const activeVaarIdx=DATA.activeVaarIdx;
  const curIdx=selectedVaarIdx!==null?selectedVaarIdx:activeVaarIdx;
  const curPos=((curIdx-activeVaarIdx)+7)%7;
  const nextPos=((curPos+delta)%7+7)%7;
  selectedVaarIdx=(activeVaarIdx+nextPos)%7;
  renderAll();
}

// Pointer-based swipe (covers touch + mouse) on the orbit dial: a horizontal
// drag past a small threshold steps to the next/previous day, with a damped
// live nudge while dragging and a spring-back snap on release. Bound once
// per wrap element (guarded) since renderAll() only replaces the orbit
// BUTTONS, not the wrap itself, on every re-render.
function initOrbitSwipe(wrap){
  if(!wrap||wrap._vpSwipeBound)return;
  wrap._vpSwipeBound=true;
  const THRESH=42,NUDGE_MAX=26,NUDGE_RATIO=.3,DEADZONE=6;
  let sx=0,sy=0,tracking=false,swiped=false,captured=false;
  function onDown(e){
    if(e.pointerType==='mouse'&&e.button!==0)return;
    sx=e.clientX;sy=e.clientY;tracking=true;swiped=false;captured=false;
  }
  function onMove(e){
    if(!tracking)return;
    const dx=e.clientX-sx,dy=e.clientY-sy;
    if(Math.abs(dx)<=Math.abs(dy))return; // more vertical than horizontal — leave it to page scroll
    if(Math.abs(dx)>DEADZONE){
      if(!captured){
        // Only now do we know this is a genuine drag, not a tap — capture
        // the pointer so the gesture tracks correctly even if it leaves the
        // dial. Capturing unconditionally on pointerdown would retarget the
        // native click event of a plain tap away from the button it hit.
        captured=true;
        wrap.classList.add('vp-dragging');
        try{wrap.setPointerCapture(e.pointerId);}catch(err){}
      }
      const nudge=Math.max(-NUDGE_MAX,Math.min(NUDGE_MAX,dx*NUDGE_RATIO));
      wrap.style.transform=`translateX(${nudge}px)`;
    }
    if(Math.abs(dx)>THRESH)swiped=true;
  }
  function onUp(e){
    if(!tracking)return;
    tracking=false;
    if(captured){
      wrap.classList.remove('vp-dragging');
      wrap.style.transform='';
      try{wrap.releasePointerCapture(e.pointerId);}catch(err){}
      captured=false;
    }
    if(swiped){
      const dx=e.clientX-sx;
      swipeVaar(dx<0?1:-1); // swipe left = next day, swipe right = previous day
    }
  }
  function onCancel(e){
    tracking=false;
    if(captured){
      wrap.classList.remove('vp-dragging');wrap.style.transform='';
      try{wrap.releasePointerCapture(e.pointerId);}catch(err){}
      captured=false;
    }
  }
  wrap.addEventListener('pointerdown',onDown,{passive:true});
  wrap.addEventListener('pointermove',onMove,{passive:true});
  wrap.addEventListener('pointerup',onUp,{passive:true});
  wrap.addEventListener('pointercancel',onCancel,{passive:true});
}

// ═══════════════════════════════════════════════════════════════
// COMPUTE
// ═══════════════════════════════════════════════════════════════
function computeAll(){
  const now=new Date();
  const jd=dateToJD(now);
  const vaarStrip=getVaarStrip(now,LAT,LNG);
  const activeVaarIdx=getVedicVaarIdx(now,LAT,LNG);
  const activeVaar=vaarStrip[activeVaarIdx];
  // Compute tithi/nakshatra/yoga for NOW (always today's data)
  const tithiPeriods=getTithiPeriods(jd,10);
  const currentTithiIdx=tithiIdx(jd);
  const nakshatraPeriods=getNakshatraPeriods(jd,4);
  const yogaPeriods=getYogaPeriods(jd,4);
  const karanaPeriods=getKaranaPeriods(jd,6);
  const lunarMonthTithis=getLunarMonthTithis(jd);
  const hm=hinduMonth(jd);
  const am=adhikMaas(jd);
  const ga=gaurabda(now);
  const spVaarEnd=new Date(+activeVaar.sunrise+86400000-96*60*1000);
  const sp=specialYogas(activeVaarIdx,nakshatraPeriods[0]?.index??0,activeVaar.brahmaMuhurtaStart,spVaarEnd);
  return{now,jd,vaarStrip,activeVaarIdx,activeVaar,tithiPeriods,currentTithiIdx,
    nakshatraPeriods,yogaPeriods,karanaPeriods,lunarMonthTithis,hm,am,ga,sp};
}

// ═══════════════════════════════════════════════════════════════
// HELPERS — muhurta list builder (shared)
// ═══════════════════════════════════════════════════════════════
function buildAllMuhurtas(mdToday){
  const nextDayDate=new Date(+mdToday.sunrise+86400000);
  const nextBMStart=new Date(+SunCalc.getTimes(nextDayDate,LAT,LNG).sunrise-96*60*1000);
  const nextBMEnd=new Date(+nextBMStart+48*60*1000);
  const abhijitType=mdToday.wd===2?'warn':'good';
  return[
    {icon:'🌅',label:'Brahma Muhurta',s:mdToday.brahmaMuhurta.start,e:mdToday.brahmaMuhurta.end,type:'good'},
    {icon:'🏆',label:'Abhijit Muhurta',s:mdToday.abhijit.start,e:mdToday.abhijit.end,type:abhijitType},
    {icon:'⚔️',label:'Vijaya Muhurta',s:mdToday.vijaya.start,e:mdToday.vijaya.end,type:'good'},
    {icon:'🌄',label:'Godhuli Muhurta',s:mdToday.godhuli.start,e:mdToday.godhuli.end,type:'good'},
    {icon:'🌙',label:'Nishita Muhurta',s:mdToday.nishita.start,e:mdToday.nishita.end,type:'good'},
    ...(mdToday.amritaKala?[{icon:'✨',label:'Amrita Kala',s:mdToday.amritaKala.start,e:mdToday.amritaKala.end,type:'good'}]:[]),
    {icon:'☠️',label:'Rahu Kalam',s:mdToday.rahuKalam.start,e:mdToday.rahuKalam.end,type:'warn'},
    {icon:'⚰️',label:'Yamaganda',s:mdToday.yamaganda.start,e:mdToday.yamaganda.end,type:'warn'},
    {icon:'🐍',label:'Gulika (Mandi)',s:mdToday.gulika.start,e:mdToday.gulika.end,type:'warn'},
    ...(mdToday.varjyam?[{icon:'🚫',label:'Varjyam / Tyajya',s:mdToday.varjyam.start,e:mdToday.varjyam.end,type:'warn'}]:[]),
    ...mdToday.durMuhurtas.map((d,i)=>({icon:'⚠️',label:`Dur Muhurta ${i+1}`,s:d.start,e:d.end,type:'warn'})),
    {icon:'🌅',label:'Brahma Muhurta',s:nextBMStart,e:nextBMEnd,type:'good'},
  ];
}

// ═══════════════════════════════════════════════════════════════
// ANGA ROW CARDS — 4 angas in a single horizontal row
// each with a collapsible "upcoming" section beneath
// ═══════════════════════════════════════════════════════════════
function buildAngaRowCards(now,tithiPeriods,nakshatraPeriods,yogaPeriods,karanaPeriods,isSelected){
  // Current anga finders
  function curP(arr){return arr.find(p=>+jdToDate(p.startJD)<=+now&&+now<+jdToDate(p.endJD))||arr[0]}
  function nextP(arr,cur){return arr.filter(p=>+jdToDate(p.startJD)>+now).slice(0,3)}
  const timeLeftLabel=isSelected?'at sunrise':'left';

  function durLeft(endJD){
    const ed=jdToDate(endJD);
    if(+ed<=+now)return'';
    return dur(now,ed)+' '+timeLeftLabel;
  }

  const curTithi=curP(tithiPeriods);
  const curNak=curP(nakshatraPeriods);
  const curYoga=curP(yogaPeriods);
  const curKar=curP(karanaPeriods);
  const karFx=KARANA_FX_LOOKUP[curKar.name]||'Half-tithi unit — governs the quality of the lunar half';
  const karWarn=curKar.name==='Vishti';

  // Auspicious/inauspicious colour class per anga current
  const inauspiciousYoga=['Vishkambha','Atiganda','Shula','Ganda','Vajra','Vyatipata','Parigha','Vaidhriti'];
  const yogaWarn=inauspiciousYoga.includes(curYoga.name);

  function angaCard(label,cur,fx,periods,warn){
    const upcoming=periods.filter(p=>+jdToDate(p.startJD)>+now).slice(0,3);
    const endDate=jdToDate(cur.endJD);
    const id='vpc-'+label.toLowerCase().replace(/\s/g,'');
    const leftTxt=durLeft(cur.endJD);
    const upcomingHtml=upcoming.map(p=>{
      const ps=jdToDate(p.startJD),pe=jdToDate(p.endJD);
      return`<div class="vp-anga-upcoming-item">
        <div class="vp-anga-upcoming-dot"></div>
        <div>
          <div class="vp-anga-upcoming-name">${p.name}${p.paksha?' <span style="font-size:.5rem;color:var(--vp-ink-faint)">('+p.paksha+')</span>':''}</div>
          <div class="vp-anga-upcoming-time">${fmt12(ps)} – ${fmtEnd(pe,ps)}</div>
        </div>
      </div>`;
    }).join('');
    return`<div class="vp-anga-card ${warn?'warn':'good'}">
      <div class="vp-anga-card-label">${label} Now</div>
      <div class="vp-anga-card-name">${cur.name}</div>
      ${cur.paksha?`<div class="vp-anga-card-paksha">${cur.paksha} Paksha</div>`:''}
      <div class="vp-anga-card-fx">${fx}</div>
      <div class="vp-anga-card-time">ends ${fmtEnd(endDate,now)}</div>
      ${leftTxt?`<div class="vp-anga-card-left">${leftTxt}</div>`:''}
      ${upcoming.length?`
      <button class="vp-anga-card-toggle" id="btn-${id}" onclick="vpToggleAngaCard('${id}')">
        Next <span class="vp-chevron-sm">▾</span>
      </button>
      <div class="vp-anga-upcoming-wrap" id="${id}">
        ${upcomingHtml}
      </div>`:''}
    </div>`;
  }

  let html='';
  html+=angaCard('Tithi',curTithi,TITHI_FX[curTithi.index],tithiPeriods,false);
  html+=angaCard('Nakshatra',curNak,NAK_FX[curNak.index],nakshatraPeriods,false);
  html+=angaCard('Yoga',curYoga,YOGA_FX[curYoga.index],yogaPeriods,yogaWarn);
  html+=angaCard('Karana',curKar,karFx,karanaPeriods,karWarn);
  return html;
}

window.vpToggleAngaCard=function(id){
  const wrap=document.getElementById(id);
  const btn=document.getElementById('btn-'+id);
  if(!wrap)return;
  wrap.classList.toggle('open');
  if(btn)btn.classList.toggle('vp-anga-toggle-open');
};

// ═══════════════════════════════════════════════════════════════
// CURRENT MUHURTA BANNER — smart conflict resolution
// ═══════════════════════════════════════════════════════════════
function buildCurrentMuhurtaBanner(now,allM,isSelected){
  if(isSelected)return'';
  const active=allM.filter(m=>now>=m.s&&now<m.e);
  if(!active.length)return'';

  const goods=active.filter(m=>m.type==='good');
  const warns=active.filter(m=>m.type==='warn');

  function timeRemaining(m){
    const mins=Math.round((+m.e-+now)/60000);
    return mins<60?mins+'m left':Math.floor(mins/60)+'h '+(mins%60?mins%60+'m':'')+' left';
  }
  function timeRange(m){return`${fmt12(m.s)} – ${fmtEnd(m.e,m.s)}`}

  // Conflict: both good and warn active simultaneously
  if(goods.length&&warns.length){
    const g=goods[0];
    const w=warns[0];
    // Decision: inauspicious overrides for new starts; auspicious good for ongoing work
    const adviceGood='✅ Good for ongoing work & prayer';
    const adviceWarn='⛔ Avoid new starts & decisions';
    let html=`<div class="vp-current-banner conflict">
      <div class="vp-cb-dot"></div>
      <div class="vp-cb-body">
        <div class="vp-cb-eyebrow">⚖️ Mixed — Good &amp; Inauspicious Overlap</div>
        <div class="vp-cb-name">${g.icon||'🌅'} ${g.label} &amp; ${w.icon||'⚠️'} ${w.label}</div>
        <div class="vp-cb-desc">${MEFF[g.label]||''} — but ${(MEFF[w.label]||'inauspicious period').toLowerCase()} is also active.</div>
        <div class="vp-cb-advice">${adviceGood}</div>
        <div class="vp-cb-advice" style="margin-top:4px">${adviceWarn}</div>
        <div class="vp-cb-time">${g.label}: ${timeRange(g)} · ${timeRemaining(g)}</div>
        <div class="vp-cb-time">${w.label}: ${timeRange(w)} · ${timeRemaining(w)}</div>
      </div>
    </div>`;
    // Additional overlapping items
    const extras=[...goods.slice(1),...warns.slice(1)];
    if(extras.length){
      html=html.slice(0,-6)+'<div class="vp-cb-also">Also active: '+
        extras.map(e=>`<span class="vp-cb-also-item ${e.type==='good'?'good':''}">${e.icon||''} ${e.label}</span>`).join('')+
        '</div></div></div>';
    }
    return html;
  }

  // Only inauspicious
  if(warns.length&&!goods.length){
    const w=warns[0];
    const avoidText='⛔ Avoid new beginnings, auspicious rites & important decisions';
    let html=`<div class="vp-current-banner inaup">
      <div class="vp-cb-dot"></div>
      <div class="vp-cb-body">
        <div class="vp-cb-eyebrow">Inauspicious Active</div>
        <div class="vp-cb-name">${w.icon||'⚠️'} ${w.label}</div>
        <div class="vp-cb-desc">${MEFF[w.label]||''}</div>
        <div class="vp-cb-advice">${avoidText}</div>
        <div class="vp-cb-time">${timeRange(w)} · ${timeRemaining(w)}</div>
      </div>
    </div>`;
    if(warns.length>1){
      html=html.slice(0,-6)+'<div class="vp-cb-also">Also: '+
        warns.slice(1).map(e=>`<span class="vp-cb-also-item">${e.icon||''} ${e.label}</span>`).join('')+
        '</div></div></div>';
    }
    return html;
  }

  // Only auspicious
  if(goods.length){
    const g=goods[0];
    const doText='✅ Excellent — proceed with confidence';
    let html=`<div class="vp-current-banner ausp">
      <div class="vp-cb-dot"></div>
      <div class="vp-cb-body">
        <div class="vp-cb-eyebrow">Auspicious Active</div>
        <div class="vp-cb-name">${g.icon||'🌅'} ${g.label}</div>
        <div class="vp-cb-desc">${MEFF[g.label]||''}</div>
        <div class="vp-cb-advice">${doText}</div>
        <div class="vp-cb-time">${timeRange(g)} · ${timeRemaining(g)}</div>
      </div>
    </div>`;
    if(goods.length>1){
      html=html.slice(0,-6)+'<div class="vp-cb-also">Also active: '+
        goods.slice(1).map(e=>`<span class="vp-cb-also-item good">${e.icon||''} ${e.label}</span>`).join('')+
        '</div></div></div>';
    }
    return html;
  }
  return'';
}

// ═══════════════════════════════════════════════════════════════
// UPCOMING LIST — serial order, gold/violet color coded
// ═══════════════════════════════════════════════════════════════
function buildUpcomingList(now,allM,isSelected){
  const future=allM.filter(m=>m.s>now).sort((a,b)=>+a.s-+b.s).slice(0,8);
  if(!future.length)return'<div style="padding:12px;text-align:center;font-size:.76rem;color:var(--vp-ink-faint)">No upcoming periods today</div>';

  function soonStr(m){
    const mins=Math.round((+m.s-+now)/60000);
    if(mins<60)return`in ${mins}m`;
    return`in ${Math.floor(mins/60)}h${mins%60?' '+mins%60+'m':''}`;
  }

  return future.map((m,i)=>{
    const isAusp=m.type==='good';
    const cls=isAusp?'ausp':'inaup';
    return`<div class="vp-upcoming-row ${cls}">
      <div class="vp-upcoming-serial">${i+1}</div>
      <div class="vp-upcoming-icon">${m.icon||'⏰'}</div>
      <div class="vp-upcoming-body">
        <div class="vp-upcoming-label">${m.label}</div>
        <div class="vp-upcoming-desc">${MEFF[m.label]||''}</div>
        <div class="vp-upcoming-timeblock">${fmt12(m.s)} – ${fmtEnd(m.e,m.s)}</div>
        <div class="vp-upcoming-dur">${dur(m.s,m.e)} duration</div>
      </div>
      <div class="vp-upcoming-right">
        <span class="vp-in-pill">${soonStr(m)}</span>
      </div>
    </div>`;
  }).join('');
}

// Legacy stub — kept so any remaining callers don't break
function buildNowPanel(now,tithiPeriods,nakshatraPeriods,yogaPeriods,karanaPeriods,mdToday,isSelected){
  return'';
}

// ═══════════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════════
function renderAll(){
  if(!DATA)return;
  const{now,jd,vaarStrip,activeVaarIdx,activeVaar,tithiPeriods,currentTithiIdx,
    nakshatraPeriods,yogaPeriods,karanaPeriods,lunarMonthTithis,hm,am,ga,sp}=DATA;

  // Which vaar to DISPLAY (for muhurtas/day bounds)
  const displayVaarIdx=selectedVaarIdx!==null?selectedVaarIdx:activeVaarIdx;
  const displayVaar=vaarStrip[displayVaarIdx];
  const isActive=displayVaarIdx===activeVaarIdx;

  // Muhurta data for the DISPLAYED vaar
  const md=getMuhurtaData(displayVaar,LAT,LNG);
  const headerRef=isActive?now:displayVaar.sunrise;
  const headerJD=dateToJD(headerRef);
  const headerHM=hinduMonth(headerJD);
  const headerAM=adhikMaas(headerJD);
  const headerPaksha=tithiIdx(headerJD)<15?'Sukla':'Krishna';
  const headerWhen=isActive?'Today':(displayVaar.dayOffset===1?'Tomorrow':displayVaar.dayOffset===-1?'Yesterday':displayVaar.dayOffset>0?'+'+displayVaar.dayOffset+' days':displayVaar.dayOffset+' days');

  // Header follows selected Vaar so the month/date context is clear
  document.getElementById('vp-gaurabda').textContent='Gaurabda '+gaurabda(headerRef);
  document.getElementById('vp-vaar-name').textContent=displayVaar.name+' Vaar';
  document.getElementById('vp-month-line').innerHTML=
    (headerAM.isAdhik?`<span class="vp-adhik-badge">${headerAM.isPurushottam?'Purushottam':'Adhik'}</span>${headerAM.nextMonthName}`:headerHM.name)+
    ' &nbsp;·&nbsp; '+headerPaksha+' Paksha &nbsp;·&nbsp; '+headerWhen+' '+fmtDate(headerRef);
  document.getElementById('vp-vaishnav-line').textContent='Vaishnav Month of '+headerHM.vaishnavName;

  // ── SOLAR SYSTEM ORBIT DIAL ──────────────────────────────────
  // Sun always fixed at center, spinning continuously.
  // 6 planets orbit around it at radii proportional to their real
  // distance from the Sun. The orbit/self angles persist in
  // window._vpOrbit across re-renders so the animation NEVER resets
  // (renderAll() runs every 30s for data refresh — DOM/labels update
  // in place, the orbit loop itself is built only once).
  (function setupOrbitDial(){
    const orbitWrap = document.getElementById('vp-orbit-wrap');
    const centerEl2 = document.getElementById('vp-orbit-center');

    // Orbital speed (deg/s) — vary per planet, closer = faster (Kepler-ish).
    // Speeds are deliberately non-commensurate (no shared integer ratios)
    // so planets essentially never realign at the exact same angle twice —
    // any overlap is a passing moment, not a recurring collision.
    // Rabi(0)=Sun(Surya), Som(1)=Moon(Chandra) -> treated as Earth-orbit proxy,
    // Mangol(2)=Mars, Budh(3)=Mercury, Brihaspati(4)=Jupiter, Sukro(5)=Venus, Shani(6)=Saturn
    // Distance order (closest→farthest from Sun): Mercury, Venus, Moon, Mars, Jupiter, Saturn
    const PLANET_INFO = {
      3: { au: 0.39,  spd: 26.3, self: 38.7 },  // Mercury — closest, fastest
      5: { au: 0.72,  spd: 18.9, self: 23.6 },  // Venus
      1: { au: 1.00,  spd: 14.7, self: 21.3 },  // Moon (Earth proxy)
      2: { au: 1.52,  spd: 11.2, self: 19.4 },  // Mars
      4: { au: 5.20,  spd: 6.1,  self: 15.8 },  // Jupiter
      6: { au: 9.58,  spd: 3.9,  self: 12.2 },  // Saturn — farthest, slowest
    };

    // ── Radius assignment: distinct, clearly-separated rings ─────
    // Sort planets by real distance from Sun (preserving correct
    // astronomical ORDER), then space their orbit rings evenly across
    // the dial. With 6 bodies orbiting in a phone-sized circle, true
    // permanent non-overlap isn't geometrically possible at a tappable
    // node size — so instead: (1) rings are spaced as far apart as the
    // dial allows, (2) each planet runs at a different, non-aligning
    // speed so any overlap is brief, and (3) hover/today/selected nodes
    // get a z-index lift so the right one is always on top to tap.
    // Radii are computed from the dial's ACTUAL rendered size (it can
    // shrink to 92vw on narrow phones), so rings always stay proportional
    // and never spill outside the circle.
    const NODE_D = 34; // planet node diameter (px) — keep in sync with CSS
    const dialPx = orbitWrap.getBoundingClientRect().width || 344;
    const dialR  = dialPx / 2;
    const INNER_R = Math.max(36, dialR * 0.26); // clears the Sun's corona
    const MAX_R   = dialR - (NODE_D/2) - 12;     // stays inside the dial, room for label

    const orderedIdx = Object.keys(PLANET_INFO)
      .map(k=>parseInt(k))
      .sort((a,b)=>PLANET_INFO[a].au - PLANET_INFO[b].au); // closest first

    const step = (MAX_R - INNER_R) / (orderedIdx.length - 1);
    orderedIdx.forEach((vi, i)=>{
      PLANET_INFO[vi].r = INNER_R + i * step;
    });

    // Stable, spread starting angles (only used the FIRST time we build)
    const START_ANG = { 1:0, 2:52, 3:104, 4:156, 5:208, 6:260 };

    // Persistent state survives across renderAll() calls
    if(!window._vpOrbit){
      window._vpOrbit = {
        built:false,
        planets:{}, // vaarIdx -> {orbitAng, selfAng}
        sunAng:0,
        lastT:null,
        rafId:null,
      };
      Object.keys(PLANET_INFO).forEach(k=>{
        window._vpOrbit.planets[k] = { orbitAng: START_ANG[k]||0, selfAng:0 };
      });
    }
    const S = window._vpOrbit;

    // Build DOM ONLY ONCE — subsequent renderAll() calls just update
    // classes/labels on the existing nodes so the animation never resets.
    if(!S.built){
      orbitWrap.querySelectorAll('.vp-planet-arm,.vp-orbit-btn').forEach(b=>b.remove());

      Object.keys(PLANET_INFO).forEach(viStr=>{
        const vi = parseInt(viStr);
        const wrap = document.createElement('div');
        wrap.className = 'vp-planet-arm';
        wrap.setAttribute('data-vaar', vi);
        wrap.innerHTML = `<div class="vp-planet-node" data-vaar="${vi}"
            onclick="vpSelectVaar(${vi})">
            <img class="vp-planet-img" src="" alt="" draggable="false">
            <span class="vp-planet-day-label"></span>
          </div>`;
        centerEl2.insertAdjacentElement('beforebegin', wrap);
      });

      // Orbit ring guides — one per radius, drawn once
      const ringGuides = document.createElement('div');
      ringGuides.className = 'vp-orbit-ring-guides';
      ringGuides.innerHTML = Object.keys(PLANET_INFO).map(k=>{
        const r = PLANET_INFO[k].r;
        return `<div class="vp-orbit-guide" data-vaar="${k}" style="width:${r*2}px;height:${r*2}px"></div>`;
      }).join('');
      orbitWrap.insertBefore(ringGuides, orbitWrap.querySelector('.vp-orbit-ring'));

      S.built = true;
    }

    // ── Update per-planet DOM (classes, image src, label, radius) ──
    // Safe to run every renderAll() — does not touch angles.
    vaarStrip.forEach(v=>{
      if(v.index===0) return; // Sun stays in center
      const info = PLANET_INFO[v.index];
      if(!info) return;
      const armEl = orbitWrap.querySelector(`.vp-planet-arm[data-vaar="${v.index}"]`);
      if(!armEl) return;
      const node = armEl.querySelector('.vp-planet-node');
      const img  = armEl.querySelector('.vp-planet-img');
      const label= armEl.querySelector('.vp-planet-day-label');

      let nodeCls = 'vp-planet-node';
      if(v.isActive) nodeCls += ' today';
      if(selectedVaarIdx!==null && v.index===selectedVaarIdx) nodeCls += ' selected';
      node.className = nodeCls;
      node.setAttribute('data-vaar', v.index);
      node.title = `${v.name} Vaar`;

      const dayLabel = v.dayOffset===0?'Today':v.dayOffset===1?'Tmrw':v.dayOffset===-1?'Yest':
        v.dayOffset>0?'+'+v.dayOffset+'d':v.dayOffset+'d';
      label.textContent = dayLabel;
      node.setAttribute('aria-label', `${v.name} Vaar, ${dayLabel}`);

      const imgSrc = VAAR_PLANET_IMG[v.index]||'';
      if(imgSrc && img.getAttribute('src')!==imgSrc){
        img.setAttribute('src', imgSrc);
        img.setAttribute('alt', v.name);
      }

      armEl._vpRadius = info.r; // stash for the tick loop
      armEl._vpOrbitSpd = info.spd;
      armEl._vpSelfSpd = info.self;
    });

    // Sun in center — image set once, always spinning
    const centerIconEl = document.getElementById('vp-orbit-center-icon');
    if(!centerIconEl.querySelector('.vp-orbit-center-planet')){
      if(VAAR_PLANET_IMG[0]){
        centerIconEl.innerHTML = `<img class="vp-orbit-center-planet" src="${VAAR_PLANET_IMG[0]}" alt="Surya" draggable="false"/>`;
      } else {
        centerIconEl.textContent = '☀️';
      }
    }
    document.getElementById('vp-orbit-center-label').textContent = displayVaar.name;
    document.getElementById('vp-orbit-center-sub').textContent   = headerWhen;

    // ── Start the rAF loop EXACTLY ONCE (module-level, never restarted) ──
    if(!S.rafId && !document.hidden){
      S.lastT = null;
      S.rafId = requestAnimationFrame(vpOrbitTick);
    }

    function vpOrbitTick(ts){
      const wrap = document.getElementById('vp-orbit-wrap');
      if(!wrap){ S.rafId = null; return; } // dial unmounted — stop for good

      if(document.hidden){ S.rafId = requestAnimationFrame(vpOrbitTick); return; }

      const dt = S.lastT!==null ? Math.min((ts - S.lastT)/1000, 0.1) : 0.016;
      S.lastT = ts;

      // Sun spins continuously
      S.sunAng = (S.sunAng + 14*dt) % 360;
      const sunImg = wrap.querySelector('.vp-orbit-center-planet');
      if(sunImg) sunImg.style.transform = `rotate(${S.sunAng}deg)`;

      // Each planet
      wrap.querySelectorAll('.vp-planet-arm').forEach(armEl=>{
        const vi = parseInt(armEl.getAttribute('data-vaar'));
        const st = S.planets[vi];
        if(!st) return;
        const orbitSpd = armEl._vpOrbitSpd || 10;
        const selfSpd  = armEl._vpSelfSpd  || 20;
        const r        = armEl._vpRadius   || 90;

        st.orbitAng = (st.orbitAng + orbitSpd*dt) % 360;
        st.selfAng  = (st.selfAng  + selfSpd*dt)  % 360;

        const rad = st.orbitAng * Math.PI/180;
        const px = Math.cos(rad)*r;
        const py = Math.sin(rad)*r;

        const node = armEl.querySelector('.vp-planet-node');
        if(node){
          node.style.left = (px - 17) + 'px';
          node.style.top  = (py - 17) + 'px';
        }
        // Planet spins on its own axis — plain rotation, no squash.
        // The "tilted axis" feel comes from each planet's fixed CSS
        // border-radius/shadow + the orbit motion itself, so the
        // sprite never gets visually squashed or distorted.
        const img = armEl.querySelector('.vp-planet-img');
        if(img) img.style.transform = `rotate(${st.selfAng}deg)`;

        // Day label stays horizontal & upright — counter-rotate orbit only
        const label = armEl.querySelector('.vp-planet-day-label');
        if(label) label.style.transform = `translateX(-50%) rotate(${-st.orbitAng}deg)`;
      });

      S.rafId = requestAnimationFrame(vpOrbitTick);
    }

    // Expose a resume hook so vpStartClock() can restart the loop after
    // the user switches back from the B&C sub-tab (vpStopClock paused it).
    S.resume = function(){
      if(!S.rafId && document.getElementById('vp-orbit-wrap') && !document.hidden){
        S.lastT = null;
        S.rafId = requestAnimationFrame(vpOrbitTick);
      }
    };

    // Pause/resume on OS-level tab visibility change (perf) — wired once
    if(!window._vpOrbitVisWired){
      window._vpOrbitVisWired = true;
      document.addEventListener('visibilitychange', ()=>{
        if(document.hidden){
          if(S.rafId){ cancelAnimationFrame(S.rafId); S.rafId=null; }
        } else {
          S.resume && S.resume();
        }
      });
    }
  })();

  // Now panel — uses selected vaar if chosen, else current moment
  let panelRef, panelTithiP, panelNakP, panelYogaP, panelKarP, panelMd, panelLabel;
  if(!isActive){
    // Compute panchanga at the selected vaar's SUNRISE so all data is correct for that day
    const refTime=displayVaar.sunrise;
    const refJD=dateToJD(refTime);
    panelRef=refTime;
    panelTithiP=getTithiPeriods(refJD,6);
    panelNakP=getNakshatraPeriods(refJD,4);
    panelYogaP=getYogaPeriods(refJD,4);
    panelKarP=getKaranaPeriods(refJD,6);
    panelMd=md;
    const off=displayVaar.dayOffset;
    const when=off===1?'Tomorrow':off===-1?'Yesterday':off>0?'+'+off+' days':off+' days';
    panelLabel=displayVaar.name+' Vaar &nbsp;<span style="font-weight:400;opacity:.6">('+when+' &middot; '+fmtDate(displayVaar.sunrise)+')</span>';
  }else{
    panelRef=now;
    panelTithiP=tithiPeriods;
    panelNakP=nakshatraPeriods;
    panelYogaP=yogaPeriods;
    panelKarP=karanaPeriods;
    panelMd=md;
    panelLabel='Right Now &amp; Coming Soon';
  }
  document.getElementById('vp-now-panel-title').innerHTML=panelLabel;

  // ── 4 Anga cards in one row ──────────────────────────────────
  document.getElementById('vp-anga-row-cards').innerHTML=
    buildAngaRowCards(panelRef,panelTithiP,panelNakP,panelYogaP,panelKarP,!isActive);

  // ── Build unified muhurta list ────────────────────────────────
  const allM=buildAllMuhurtas(panelMd);

  // ── Current muhurta banner ────────────────────────────────────
  document.getElementById('vp-current-muhurta-wrap').innerHTML=
    buildCurrentMuhurtaBanner(panelRef,allM,!isActive);

  // ── Upcoming list — serial, gold/violet ───────────────────────
  const upcomingSection=document.getElementById('vp-upcoming-section');
  const upcomingList=document.getElementById('vp-upcoming-list');
  if(isActive){
    upcomingSection.style.display='block';
    upcomingList.innerHTML=buildUpcomingList(panelRef,allM,false);
  }else{
    // For selected vaar, show all muhurtas in order (from sunrise)
    upcomingSection.style.display='block';
    const allFromSR=allM.filter(m=>m.s>=panelRef).sort((a,b)=>+a.s-+b.s).slice(0,8);
    upcomingList.innerHTML=allFromSR.length?allFromSR.map((m,i)=>{
      const cls=m.type==='good'?'ausp':'inaup';
      return`<div class="vp-upcoming-row ${cls}">
        <div class="vp-upcoming-serial">${i+1}</div>
        <div class="vp-upcoming-icon">${m.icon||'⏰'}</div>
        <div class="vp-upcoming-body">
          <div class="vp-upcoming-label">${m.label}</div>
          <div class="vp-upcoming-desc">${MEFF[m.label]||''}</div>
          <div class="vp-upcoming-timeblock">${fmt12(m.s)} – ${fmtEnd(m.e,m.s)}</div>
          <div class="vp-upcoming-dur">${dur(m.s,m.e)} duration</div>
        </div>
      </div>`;
    }).join(''):'<div style="padding:12px;text-align:center;font-size:.76rem;color:var(--vp-ink-faint)">No upcoming periods</div>';
  }

  // Viewing bar
  const vb=document.getElementById('vp-viewing-bar');
  if(!isActive){
    vb.style.display='block';
    const off=displayVaar.dayOffset;
    const when=off===1?'Tomorrow':off===-1?'Yesterday':off>0?'+'+off+' days':off+' days';
    document.getElementById('vp-viewing-label').textContent=`${displayVaar.name} Vaar (${when})`;
  }else{vb.style.display='none';}

  // Lunar month grid
  const sukla=lunarMonthTithis.filter(t=>t.paksha==='Sukla');
  const krishna=lunarMonthTithis.filter(t=>t.paksha==='Krishna');
  document.getElementById('vp-month-grid').innerHTML=
    `<div class="vp-paksha-label s">Sukla Paksha — Waxing Moon</div>`+
    sukla.map((t,i)=>tCell(t,i+1,t.index===currentTithiIdx,'S')).join('')+
    `<div class="vp-paksha-label k">Krishna Paksha — Waning Moon</div>`+
    krishna.map((t,i)=>tCell(t,i+1,t.index===currentTithiIdx,'K')).join('');

  // Day boundaries — collapsible
  document.getElementById('vp-db-grid').innerHTML=[
    {icon:'🌄',label:'Brahma Muhurta',s:md.brahmaMuhurta.start,e:md.brahmaMuhurta.end},
    {icon:'☀️',label:'Sunrise',s:md.sunrise,e:null},
    {icon:'🌇',label:'SandhyaKal',s:md.sunrise,e:md.sandhyaEnd},
    {icon:'🌆',label:'Sunset',s:md.sunset,e:null},
    {icon:'🌇',label:'Sunset Sandhya',s:md.sunsetSandhyaStart,e:md.sunset},
    {icon:'🌕',label:'Moonrise',s:md.moonrise,e:null},
    {icon:'🌑',label:'Moonset',s:md.moonset,e:null},
    {icon:'🔆',label:'Solar Noon',s:md.noon,e:null},
  ].map(x=>`<div class="vp-db-card">
    <div class="vp-db-label">${x.icon} ${x.label}</div>
    <div class="vp-db-time">${fmtDT(x.s)}${x.e?`<span class="vp-sub"><br>– ${fmtEnd(x.e,x.s)}</span>`:''}</div>
  </div>`).join('');

  // Special yogas — recompute for displayVaar (may differ from activeVaar)
  let spDisplay=sp;
  if(!isActive){
    const dispNakIdx=Math.floor(moonLongSid(dateToJD(displayVaar.sunrise))/(360/27))%27;
    const dispVaarEnd=new Date(+displayVaar.sunrise+86400000-96*60*1000);
    spDisplay=specialYogas(displayVaar.index,dispNakIdx,displayVaar.brahmaMuhurtaStart,dispVaarEnd);
  }
  const sec=document.getElementById('vp-special-yoga-sec');
  if(spDisplay.length){
    sec.style.display='block';
    document.getElementById('vp-yoga-cards').innerHTML=spDisplay.map(y=>`
      <div class="vp-yoga-card">
        <div class="vp-yoga-icon">${y.symbol}</div>
        <div>
          <div class="vp-yoga-name">${y.name}</div>
          <div class="vp-yoga-desc">${y.desc}</div>
          ${y.start?`<div class="vp-yoga-time">${fmtDate(y.start)} ${fmt12(y.start)} – ${fmtEnd(y.end,y.start)}</div>`:''}
        </div>
      </div>`).join('');
  }else{sec.style.display='none';}
}

function tCell(t,num,isActive,prefix){
  const sd=jdToDate(t.startJD),ed=jdToDate(t.endJD);
  return`<div class="vp-tcell${isActive?' active':''}">
    <div class="vp-tcell-top">
      <span class="vp-tcell-num">${prefix}${num}</span>
      ${isActive?'<span class="vp-now-badge">Now</span>':''}
    </div>
    <div class="vp-tcell-name">${t.name}</div>
    <div class="vp-tcell-start">${fmtDate(sd)} ${fmt12(sd)}</div>
    <div class="vp-tcell-end">→ ${fmtEnd(ed,sd)}</div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
function showLoadError(msg){
  document.getElementById('vp-load-spinner').style.display='none';
  const el=document.getElementById('vp-load-error');
  el.style.display='block';
  if(msg) el.querySelector('.err-msg').innerHTML=msg;
}

function init(){
  // Guard: SunCalc must be loaded (CDN might be slow/offline)
  if(typeof SunCalc==='undefined'){
    showLoadError('SunCalc library not loaded.<br>Check your connection and retry.');
    return;
  }
  try{
    DATA=computeAll();
    document.getElementById('loading').style.display='none';
    document.getElementById('main').style.display='block';
    renderAll();
  }catch(e){
    console.error('Panchanga init error:',e);
    showLoadError('Calculation error: '+e.message+'<br><br>Please retry.');
  }
}

// refresh handled by vpStartRefresh/vpStopRefresh

// init handled by vpTryInit above

// ═══════════════════════════════════════════════════════════════
// CALENDAR DATE PICKER — pick any date (any year), see the FULL
// Panchanga horoscope for that day: Vaar + Previous/Current/Next
// Tithi, Nakshatra, Yoga and Karana, each with exact start/end times
// and duration — i.e. a proper Vedic astrology lookup engine, not
// just a single "now" snapshot.
// ═══════════════════════════════════════════════════════════════
// View state: which month-grid is showing, which date is picked,
// and whether the year-picker sub-view is open instead of the day grid.
let vpCalViewMonth = null;     // Date — first of the visible month
let vpCalSelectedDate = null;  // Date — the picked date, or null
let vpCalYearViewOpen = false; // toggled by tapping the month/year title
let vpCalYearPageStart = null; // first year shown in the 12-year picker grid

function vpCalOpen(){
  const overlay = document.getElementById('vp-cal-overlay');
  if(!overlay) return;
  const base = vpCalSelectedDate || new Date();
  vpCalViewMonth = new Date(base.getFullYear(), base.getMonth(), 1);
  vpCalYearViewOpen = false;
  vpCalRenderGrid();
  overlay.classList.add('open');
}
function vpCalClose(){
  const overlay = document.getElementById('vp-cal-overlay');
  if(overlay) overlay.classList.remove('open');
  vpCalYearViewOpen = false;
}
function vpCalCloseBackdrop(e){
  if(e.target && e.target.id === 'vp-cal-overlay') vpCalClose();
}
function vpCalChangeMonth(delta){
  if(!vpCalViewMonth) vpCalViewMonth = new Date();
  vpCalViewMonth = new Date(vpCalViewMonth.getFullYear(), vpCalViewMonth.getMonth()+delta, 1);
  vpCalRenderGrid();
}
function vpCalGoToday(){
  const t = new Date();
  vpCalSelectedDate = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  vpCalViewMonth = new Date(t.getFullYear(), t.getMonth(), 1);
  vpCalYearViewOpen = false;
  vpCalRenderGrid();
  vpRenderDateResult();
  vpCalClose();
}
function vpCalPickDay(y,m,d){
  vpCalSelectedDate = new Date(y,m,d);
  vpCalRenderGrid();
  vpRenderDateResult();
  vpCalClose();
}
function vpClearDateResult(){
  vpCalSelectedDate = null;
  const wrap = document.getElementById('vp-dateresult-wrap');
  if(wrap) wrap.style.display='none';
}

// ── Year picker ──────────────────────────────────────────────
// Tapping the "Month Year" title swaps the day-grid for a 12-year
// picker grid (3×4), paged 12 years at a time, so any year — past
// or future — is reachable in a couple of taps instead of holding
// the month arrow.
function vpCalToggleYearGrid(){
  vpCalYearViewOpen = !vpCalYearViewOpen;
  if(vpCalYearViewOpen){
    const baseYear = (vpCalViewMonth || new Date()).getFullYear();
    vpCalYearPageStart = baseYear - (baseYear % 12);
    vpCalRenderYearGrid();
  }
  vpCalSyncViewVisibility();
}
function vpCalChangeYearPage(delta){
  if(vpCalYearPageStart===null) vpCalYearPageStart = (vpCalViewMonth||new Date()).getFullYear();
  vpCalYearPageStart += delta*12;
  vpCalRenderYearGrid();
}
function vpCalPickYear(y){
  if(!vpCalViewMonth) vpCalViewMonth = new Date();
  vpCalViewMonth = new Date(y, vpCalViewMonth.getMonth(), 1);
  vpCalYearViewOpen = false;
  vpCalRenderGrid();
  vpCalSyncViewVisibility();
}
function vpCalSyncViewVisibility(){
  const dayView = document.getElementById('vp-cal-day-view');
  const yearView = document.getElementById('vp-cal-year-view');
  const prevBtn = document.getElementById('vp-cal-prev-btn');
  const nextBtn = document.getElementById('vp-cal-next-btn');
  if(dayView) dayView.style.display = vpCalYearViewOpen ? 'none' : 'block';
  if(yearView) yearView.style.display = vpCalYearViewOpen ? 'block' : 'none';
  // Prev/next month arrows page YEARS instead while the year grid is open
  if(prevBtn) prevBtn.setAttribute('onclick', vpCalYearViewOpen ? 'vpCalChangeYearPage(-1)' : 'vpCalChangeMonth(-1)');
  if(nextBtn) nextBtn.setAttribute('onclick', vpCalYearViewOpen ? 'vpCalChangeYearPage(1)' : 'vpCalChangeMonth(1)');
}
function vpCalRenderYearGrid(){
  if(vpCalYearPageStart===null) return;
  const startY = vpCalYearPageStart;
  const today = new Date();
  const curMonthYear = vpCalViewMonth ? vpCalViewMonth.getFullYear() : today.getFullYear();

  const rangeEl = document.getElementById('vp-cal-year-range');
  if(rangeEl) rangeEl.textContent = `${startY} – ${startY+11}`;

  let html = '';
  for(let i=0;i<12;i++){
    const y = startY + i;
    let cls = 'vp-cal-year-cell';
    if(y===today.getFullYear()) cls += ' vp-cal-year-current';
    if(y===curMonthYear) cls += ' vp-cal-year-selected';
    html += `<button class="${cls}" onclick="vpCalPickYear(${y})">${y}</button>`;
  }
  const grid = document.getElementById('vp-cal-year-grid');
  if(grid) grid.innerHTML = html;
}

function vpCalRenderGrid(){
  if(!vpCalViewMonth) return;
  const y = vpCalViewMonth.getFullYear(), m = vpCalViewMonth.getMonth();
  const monthLabel = vpCalViewMonth.toLocaleDateString('en-IN',{month:'long',year:'numeric'});
  const titleEl = document.getElementById('vp-cal-month-label');
  if(titleEl) titleEl.textContent = monthLabel;

  const firstDow = new Date(y,m,1).getDay(); // 0=Sun
  const daysInMonth = new Date(y,m+1,0).getDate();
  const today = new Date();
  const isCurMonth = today.getFullYear()===y && today.getMonth()===m;

  let html = '';
  for(let i=0;i<firstDow;i++) html += `<div class="vp-cal-day vp-cal-day-empty"></div>`;
  for(let d=1; d<=daysInMonth; d++){
    let cls = 'vp-cal-day';
    if(isCurMonth && d===today.getDate()) cls += ' vp-cal-day-today';
    if(vpCalSelectedDate && vpCalSelectedDate.getFullYear()===y &&
       vpCalSelectedDate.getMonth()===m && vpCalSelectedDate.getDate()===d){
      cls += ' vp-cal-day-selected';
    }
    html += `<button class="${cls}" onclick="vpCalPickDay(${y},${m},${d})">${d}</button>`;
  }
  const grid = document.getElementById('vp-cal-grid');
  if(grid) grid.innerHTML = html;
  vpCalSyncViewVisibility();
}

// ── Anga timeline helper ─────────────────────────────────────
// Given a period-fetcher function (getTithiPeriods / getNakshatraPeriods /
// getYogaPeriods / getKaranaPeriods), a target jd, and an FX lookup,
// returns {prev, current, next} — the full Previous → Current → Next
// picture for that anga around the target instant. The fetchers already
// search backward from jd to find the period in effect AT jd (that's
// `periods[0]`), then walk forward for `count` more — so current = [0],
// next = [1]. For previous, we ask again starting just before the
// current period's start, which makes the fetcher resolve THAT earlier
// instant's "current" period — i.e. our previous one.
function vpAngaTimeline(fetchFn, jd, fxLookup, nameKey){
  // Some fetchers (e.g. getTithiPeriods) begin their search a few hours
  // BEFORE jd to make sure the period currently in effect is included.
  // That means periods[0] is NOT guaranteed to be the period containing
  // jd — when jd falls in the first hours of a new tithi, periods[0]
  // is the PREVIOUS tithi (the one that just ended). Walk forward to
  // the first period whose endJD is strictly after jd — that is the
  // period actually in effect at the birth moment.
  const periods = fetchFn(jd, 4);
  let ci = periods.findIndex(p => p.endJD > jd);
  if(ci < 0) ci = 0;
  const current = periods[ci];
  const next = periods[ci + 1] || periods[periods.length - 1];
  // Step a hair before the current period's start, then apply the same
  // "first period whose endJD > reference" rule to pull the previous one
  const prevRef = current.startJD - 0.01;
  const prevPeriods = fetchFn(prevRef, 2);
  let pi = prevPeriods.findIndex(p => p.endJD > prevRef);
  if(pi < 0) pi = 0;
  const prev = prevPeriods[pi];


  function fx(p){
    if(typeof fxLookup === 'function') return fxLookup(p.name) || '';
    if(Array.isArray(fxLookup)) return fxLookup[p.index] || '';
    return '';
  }
  function decorate(p){
    return {
      ...p,
      fxText: fx(p),
      startDate: jdToDate(p.startJD),
      endDate: jdToDate(p.endJD),
      durText: dur(jdToDate(p.startJD), jdToDate(p.endJD)),
    };
  }
  return { prev: decorate(prev), current: decorate(current), next: decorate(next) };
}

// Renders one anga's full Previous/Current/Next timeline card
function vpAngaCardHTML(icon, label, tl, showPaksha){
  function row(tag, tagLabel, p){
    const pakshaHtml = showPaksha && p.paksha
      ? `<span class="vp-dr-tl-paksha">${p.paksha} Paksha</span>` : '';
    return `<div class="vp-dr-tl-row ${tag}">
      <div class="vp-dr-tl-marker"><span class="vp-dr-tl-dot"></span></div>
      <div class="vp-dr-tl-body">
        <span class="vp-dr-tl-tag">${tagLabel}</span>
        <span class="vp-dr-tl-name">${p.name}</span>${pakshaHtml}
        ${p.fxText ? `<div class="vp-dr-tl-fx">${p.fxText}</div>` : ''}
        <div class="vp-dr-tl-time">${fmtDT(p.startDate)} → ${fmtEnd(p.endDate, p.startDate)}</div>
        <span class="vp-dr-tl-dur">⏱ ${p.durText}</span>
      </div>
    </div>`;
  }
  return `<div class="vp-dr-anga-card">
    <div class="vp-dr-anga-head">
      <span class="vp-dr-anga-head-icon">${icon}</span>
      <span class="vp-dr-anga-head-label">${label}</span>
    </div>
    ${row('prev','Previous',tl.prev)}
    ${row('current','Current',tl.current)}
    ${row('next','Next',tl.next)}
  </div>`;
}

// Compute & render the FULL Panchanga horoscope (Vaar + all 4 angas with
// Previous/Current/Next + durations) for whichever date the user picked.
// Uses noon of the selected date as the reference instant — the same
// convention getVaarStrip() uses — so the result reflects "the panchanga
// in effect during that day," not a razor-thin midnight snapshot that
// could land in a different tithi/nakshatra than what's actually
// observed that day.
function vpRenderDateResult(){
  const wrap = document.getElementById('vp-dateresult-wrap');
  if(!wrap || !vpCalSelectedDate) return;

  const d = vpCalSelectedDate;
  const noon = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
  const jd = dateToJD(noon);

  // Vaar (weekday) — resolved via the proper sunrise-based Vedic day
  // boundary rather than plain JS getDay().
  const vaarIdx = getVedicVaarIdx(noon, LAT, LNG);
  const vaarName = VAAR[vaarIdx];

  // Header
  const dateLabel = d.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const dateEl = document.getElementById('vp-dateresult-date');
  if(dateEl) dateEl.textContent = dateLabel;
  const subEl = document.getElementById('vp-dateresult-sub');
  if(subEl){
    const today = new Date();
    const diffDays = Math.round((+new Date(d.getFullYear(),d.getMonth(),d.getDate()) - +new Date(today.getFullYear(),today.getMonth(),today.getDate()))/86400000);
    subEl.textContent = diffDays===0 ? 'Today' :
      diffDays>0 ? `${diffDays} day${diffDays===1?'':'s'} from today` :
      `${-diffDays} day${diffDays===-1?'':'s'} ago`;
  }

  // Vaar strip
  const planetImg = VAAR_PLANET_IMG[vaarIdx] || '';
  const planetTag = planetImg
    ? `<img class="vp-dr-vaar-planet" src="${planetImg}" alt="${vaarName}">`
    : `<span style="font-size:1.6rem">${VAAR_ICON[vaarIdx]}</span>`;
  const vaarStripEl = document.getElementById('vp-dr-vaar-strip');
  if(vaarStripEl){
    vaarStripEl.innerHTML = `
      ${planetTag}
      <div class="vp-dr-vaar-body">
        <div class="vp-dr-vaar-label">Vaar (Weekday)</div>
        <div class="vp-dr-vaar-name">${vaarName} Vaar</div>
      </div>`;
  }

  // Build full Previous/Current/Next timelines for all 4 angas
  const tithiTL = vpAngaTimeline(getTithiPeriods, jd, TITHI_FX, true);
  const nakTL   = vpAngaTimeline(getNakshatraPeriods, jd, NAK_FX, false);
  const yogaTL  = vpAngaTimeline(getYogaPeriods, jd, YOGA_FX, false);
  const karTL   = vpAngaTimeline(getKaranaPeriods, jd,
    (name)=>KARANA_FX_LOOKUP[name] || 'Half-tithi unit — governs the quality of the lunar half', false);

  const listEl = document.getElementById('vp-dr-anga-list');
  if(listEl){
    listEl.innerHTML =
      vpAngaCardHTML('🌙','Tithi', tithiTL, true) +
      vpAngaCardHTML('⭐','Nakshatra', nakTL, false) +
      vpAngaCardHTML('☯️','Yoga', yogaTL, false) +
      vpAngaCardHTML('◐','Karana', karTL, false);
  }

  wrap.style.display = 'block';
  requestAnimationFrame(()=>{
    wrap.scrollIntoView({behavior:'smooth', block:'start'});
  });
}



// ══════════════════════════════════════════════════════════════
// HOROSCOPE CALCULATOR
// Takes a birth date + time + place (lat/lng) and resolves the
// exact Tithi / Nakshatra / Yoga / Karana / Vaar in effect at that
// precise moment — reusing the same engine (getTithiPeriods,
// getNakshatraPeriods, getYogaPeriods, getKaranaPeriods,
// getVedicVaarIdx) and the same Previous/Current/Next card renderer
// (vpAngaTimeline / vpAngaCardHTML) that powers "Pick a Date" above.
//
// NOTE ON TIMEZONES: birth date/time is read via native <input
// type="date"/"time"> and turned into a JS Date the same way the
// rest of this file does (new Date(y,m,d,h,mi) interpreted in the
// device's current timezone) — so, exactly like the date-picker
// above, results are only accurate if the device's timezone matches
// the birth location's timezone at the time of birth. This is called
// out in the modal's helper text rather than silently assumed.
// ══════════════════════════════════════════════════════════════

function vpHoroOpen(){
  const overlay = document.getElementById('vp-horo-overlay');
  if(!overlay) return;
  const dateEl = document.getElementById('vp-horo-date');
  const timeEl = document.getElementById('vp-horo-time');
  const latEl = document.getElementById('vp-horo-lat');
  const lngEl = document.getElementById('vp-horo-lng');
  const now = new Date();
  if(dateEl && !dateEl.value){
    const pad=n=>String(n).padStart(2,'0');
    dateEl.value = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  }
  if(timeEl && !timeEl.value){
    const pad=n=>String(n).padStart(2,'0');
    timeEl.value = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }
  if(latEl && !latEl.value && typeof LAT==='number') latEl.value = LAT.toFixed(4);
  if(lngEl && !lngEl.value && typeof LNG==='number') lngEl.value = LNG.toFixed(4);
  overlay.classList.add('open');
}
function vpHoroClose(){
  const overlay = document.getElementById('vp-horo-overlay');
  if(overlay) overlay.classList.remove('open');
}
function vpHoroCloseBackdrop(e){
  if(e.target && e.target.id === 'vp-horo-overlay') vpHoroClose();
}
function vpHoroUseGPS(){
  const btn = document.getElementById('vp-horo-gps-btn');
  const lbl = document.getElementById('vp-horo-gps-btn-label');
  const latEl = document.getElementById('vp-horo-lat');
  const lngEl = document.getElementById('vp-horo-lng');
  if(!navigator.geolocation){
    if(lbl) lbl.textContent = 'Location not supported on this device';
    return;
  }
  if(btn) btn.disabled = true;
  if(lbl) lbl.textContent = 'Locating…';
  navigator.geolocation.getCurrentPosition(
    function(pos){
      if(latEl) latEl.value = pos.coords.latitude.toFixed(4);
      if(lngEl) lngEl.value = pos.coords.longitude.toFixed(4);
      if(btn) btn.disabled = false;
      if(lbl) lbl.textContent = 'Use My Current Location';
    },
    function(){
      if(btn) btn.disabled = false;
      if(lbl) lbl.textContent = 'Location unavailable — check permission';
    },
    { timeout: 10000, maximumAge: 60000 },
  );
}
function vpHoroClearResult(){
  const wrap = document.getElementById('vp-horo-result-wrap');
  if(wrap) wrap.style.display = 'none';
}

function vpHoroCalculate(){
  const dateEl = document.getElementById('vp-horo-date');
  const timeEl = document.getElementById('vp-horo-time');
  const latEl = document.getElementById('vp-horo-lat');
  const lngEl = document.getElementById('vp-horo-lng');

  const dateVal = dateEl && dateEl.value; // "YYYY-MM-DD"
  const timeVal = (timeEl && timeEl.value) || '12:00'; // "HH:MM"
  const lat = latEl && latEl.value !== '' ? parseFloat(latEl.value) : NaN;
  const lng = lngEl && lngEl.value !== '' ? parseFloat(lngEl.value) : NaN;

  if(!dateVal){ alert('Please enter a date of birth.'); return; }
  if(isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180){
    alert('Please enter a valid latitude (-90 to 90) and longitude (-180 to 180), or tap "Use My Current Location".');
    return;
  }

  const [y, mo, da] = dateVal.split('-').map(Number);
  const [hh, mi] = timeVal.split(':').map(Number);
  const birthDate = new Date(y, mo-1, da, hh, mi, 0);
  const jd = dateToJD(birthDate);

  const vaarIdx = getVedicVaarIdx(birthDate, lat, lng);
  const vaarName = VAAR[vaarIdx];

  // Header
  const dateLabel = birthDate.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})
    + ' · ' + fmt12(birthDate);
  const dateLabelEl = document.getElementById('vp-horo-result-date');
  if(dateLabelEl) dateLabelEl.textContent = dateLabel;
  const subEl = document.getElementById('vp-horo-result-sub');
  if(subEl) subEl.textContent = `${lat.toFixed(3)}°, ${lng.toFixed(3)}°`;

  // Vaar strip
  const planetImg = VAAR_PLANET_IMG[vaarIdx] || '';
  const planetTag = planetImg
    ? `<img class="vp-dr-vaar-planet" src="${planetImg}" alt="${vaarName}">`
    : `<span style="font-size:1.6rem">${VAAR_ICON[vaarIdx]}</span>`;
  const vaarStripEl = document.getElementById('vp-horo-vaar-strip');
  if(vaarStripEl){
    vaarStripEl.innerHTML = `
      ${planetTag}
      <div class="vp-dr-vaar-body">
        <div class="vp-dr-vaar-label">Vaar (Weekday)</div>
        <div class="vp-dr-vaar-name">${vaarName} Vaar</div>
      </div>`;
  }

  // Build full Previous/Current/Next timelines for all 4 angas,
  // anchored to the exact birth moment rather than noon
  const tithiTL = vpAngaTimeline(getTithiPeriods, jd, TITHI_FX, true);
  const nakTL   = vpAngaTimeline(getNakshatraPeriods, jd, NAK_FX, false);
  const yogaTL  = vpAngaTimeline(getYogaPeriods, jd, YOGA_FX, false);
  const karTL   = vpAngaTimeline(getKaranaPeriods, jd,
    (name)=>KARANA_FX_LOOKUP[name] || 'Half-tithi unit — governs the quality of the lunar half', false);

  // ── Janma Rashi (Moon sign), Nakshatra Pada, and prediction text ──
  const moonSid = moonLongSid(jd);          // sidereal moon longitude
  const rashiIdx = Math.floor(moonSid / 30) % 12;
  const nakIdx = Math.floor(moonSid / (360/27)) % 27;
  const padaIdx = Math.floor((moonSid % (360/27)) / ((360/27)/4)); // 0..3
  const tithiI = tithiIdx(jd);

  const horoData = {
    version: 1,
    savedAt: Date.now(),
    birthISO: birthDate.toISOString(),
    birthY:y, birthMo:mo, birthDa:da, birthH:hh, birthMi:mi,
    lat, lng,
    moonSid, rashiIdx, nakIdx, padaIdx, vaarIdx, tithiIdx: tithiI
  };
  window._vpLastHoroscope = horoData;

  // Render prediction card
  const predEl = document.getElementById('vp-horo-predictions');
  if(predEl) predEl.innerHTML = vpBuildPredictionsHTML(horoData);

  // Toggle save/forget buttons based on whether THIS chart is already saved
  vpRefreshHoroSaveButtons();

  const listEl = document.getElementById('vp-horo-anga-list');
  if(listEl){
    listEl.innerHTML =
      vpAngaCardHTML('🌙','Tithi', tithiTL, true) +
      vpAngaCardHTML('⭐','Nakshatra', nakTL, false) +
      vpAngaCardHTML('☯️','Yoga', yogaTL, false) +
      vpAngaCardHTML('◐','Karana', karTL, false);
  }

  vpHoroClose();
  const wrap = document.getElementById('vp-horo-result-wrap');
  if(wrap){
    wrap.style.display = 'block';
    requestAnimationFrame(()=>{
      wrap.scrollIntoView({behavior:'smooth', block:'start'});
    });
  }
}

window.vpSelectVaar = function(idx) { selectVaar(idx); };
window.vpClearSelectedVaar = function() { clearSelectedVaar(); };
window.vpSelectAnga = function(name) { selectedAnga = name; renderAll(); };
window.vpToggleGrid = function() {
  const w = document.getElementById('vp-month-grid-wrap');
  const b = document.getElementById('vp-tithi-toggle');
  if(w) w.classList.toggle('open');
  if(b) b.classList.toggle('open');
};

window.vpToggleDayBoundaries = function() {
  const w = document.getElementById('vp-db-wrap');
  const b = document.getElementById('vp-db-toggle');
  if(w) w.classList.toggle('open');
  if(b) b.classList.toggle('open');
};

// Calendar date-picker
// ── Public API ───────────────────────────────────────────────
window.vpHoroOpen = function(){ vpHoroOpen(); };
window.vpHoroClose = function(){ vpHoroClose(); };
window.vpHoroCloseBackdrop = function(e){ vpHoroCloseBackdrop(e); };
window.vpHoroUseGPS = function(){ vpHoroUseGPS(); };
window.vpHoroCalculate = function(){ vpHoroCalculate(); };
window.vpHoroClearResult = function(){ vpHoroClearResult(); };
window.vpOpenCalendar = function(){ vpCalOpen(); };
window.vpCloseCalendar = function(){ vpCalClose(); };
window.vpCloseCalendarBackdrop = function(e){ vpCalCloseBackdrop(e); };
window.vpCalChangeMonth = function(delta){ vpCalChangeMonth(delta); };
window.vpCalGoToday = function(){ vpCalGoToday(); };
window.vpCalPickDay = function(y,m,d){ vpCalPickDay(y,m,d); };
window.vpClearDateResult = function(){ vpClearDateResult(); };
window.vpCalToggleYearGrid = function(){ vpCalToggleYearGrid(); };
window.vpCalChangeYearPage = function(delta){ vpCalChangeYearPage(delta); };
window.vpCalPickYear = function(y){ vpCalPickYear(y); };

// ── GPS-based location for the Panchanga engine ──────────────────────
// Reads live globals first (freshest, set by the main app's GPS toggle),
// falling back to the same localStorage keys the GPS toggle persists to —
// this matters because this script block can run/refresh before the main
// app.js init has had a chance to seed window._appLat/_appLng on this page
// load.
function vpGetCachedCoords() {
  if (window._appLat && window._appLng) return { lat: window._appLat, lng: window._appLng };
  try {
    const la = parseFloat(localStorage.getItem('rjap_lastLat'));
    const ln = parseFloat(localStorage.getItem('rjap_lastLng'));
    if (!isNaN(la) && !isNaN(ln)) return { lat: la, lng: ln };
  } catch (e) {}
  return null;
}
function vpIsGpsEnabled() {
  try { return localStorage.getItem('rjap_gps_enabled') === '1'; } catch (e) { return false; }
}
window.vpUpdateLocLabel = function() {
  const el = document.getElementById('vp-loc-text');
  const c = vpGetCachedCoords();
  if (c) {
    LAT = c.lat; LNG = c.lng;
    window._appLat = c.lat; window._appLng = c.lng;
    if (el) el.textContent = c.lat.toFixed(3) + '°N ' + c.lng.toFixed(3) + '°E';
  } else if (el) {
    el.textContent = vpIsGpsEnabled() ? 'Detecting your location…' : 'Default location — enable GPS in Settings';
  }
};
window._vpGpsFetchInFlight = false;
window.vpEnsureGps = function() {
  // Only step in when the user has already granted GPS via the Settings
  // toggle but we don't yet have coordinates on this page load (e.g. this
  // script ran before app.js finished seeding window._appLat/_appLng, or
  // the previous fix attempt timed out). This never prompts for permission
  // on its own — the GPS toggle remains the sole source of consent.
  if (vpGetCachedCoords()) return;
  if (!vpIsGpsEnabled() || window._vpGpsFetchInFlight || !navigator.geolocation) return;
  window._vpGpsFetchInFlight = true;
  navigator.geolocation.getCurrentPosition(
    function(pos) {
      window._vpGpsFetchInFlight = false;
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      window._appLat = lat; window._appLng = lng;
      try {
        localStorage.setItem('rjap_lastLat', String(lat));
        localStorage.setItem('rjap_lastLng', String(lng));
      } catch (e) {}
      window.vpUpdateLocLabel();
      try { DATA = computeAll(); renderAll(); } catch (e) {}
    },
    function() {
      window._vpGpsFetchInFlight = false;
      const el = document.getElementById('vp-loc-text');
      if (el) el.textContent = 'Location unavailable — check GPS permission';
    },
    { timeout: 10000, maximumAge: 60000 },
  );
};

window.vpActivate = function() {
  window.vpUpdateLocLabel();
  window.vpEnsureGps();
  try { DATA = computeAll(); renderAll(); } catch(e) { console.error('VP render error:', e); }
};

window._vpClockInterval = null;
window.vpStartClock = function() {
  if(window._vpOrbit && window._vpOrbit.resume) window._vpOrbit.resume();
  if(window._vpClockInterval) return;
  window._vpClockInterval = setInterval(function() {
    const el = document.getElementById('vp-clock');
    if(el) el.textContent = new Date().toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit',second:'2-digit',hour12:true});
  }, 1000);
  const el = document.getElementById('vp-clock');
  if(el) el.textContent = new Date().toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit',second:'2-digit',hour12:true});
};
window.vpStopClock = function() {
  clearInterval(window._vpClockInterval);
  window._vpClockInterval = null;
  // Pause the orbit dial's rAF loop when leaving the Panchanga sub-tab
  // (saves battery/CPU); resumed automatically by vpStartClock.
  if(window._vpOrbit && window._vpOrbit.rafId){
    cancelAnimationFrame(window._vpOrbit.rafId);
    window._vpOrbit.rafId = null;
  }
};

window._vpRefreshInterval = null;
window.vpStartRefresh = function() {
  if(window._vpRefreshInterval) return;
  window._vpRefreshInterval = setInterval(function() {
    window.vpUpdateLocLabel();
    window.vpEnsureGps();
    try { DATA = computeAll(); renderAll(); } catch(e) {}
  }, 30000);
};
window.vpStopRefresh = function() {
  clearInterval(window._vpRefreshInterval);
  window._vpRefreshInterval = null;
};

// Initial load if SunCalc ready
function vpTryInit() {
  if(typeof SunCalc === 'undefined') { setTimeout(vpTryInit, 400); return; }
  window.vpUpdateLocLabel();
  window.vpEnsureGps();
  try { DATA = computeAll(); } catch(e) { console.error('VP init error:', e); }
}
vpTryInit();

// ══════════════════════════════════════════════════════════════
// MY HOROSCOPE — Rashi/Nakshatra predictions, persistence,
// and personalization of daily auspicious/inauspicious windows.
// (Janma Rashi = sidereal Moon sign at birth)
// ══════════════════════════════════════════════════════════════

const RASHI_NAMES = ['Mesha','Vrishabha','Mithuna','Karka','Simha','Kanya','Tula','Vrishchika','Dhanu','Makara','Kumbha','Meena'];
const RASHI_EN    = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
const RASHI_LORD  = ['Mangal (Mars)','Shukra (Venus)','Budh (Mercury)','Chandra (Moon)','Surya (Sun)','Budh (Mercury)','Shukra (Venus)','Mangal (Mars)','Guru (Jupiter)','Shani (Saturn)','Shani (Saturn)','Guru (Jupiter)'];
const RASHI_ELEM  = ['Fire','Earth','Air','Water','Fire','Earth','Air','Water','Fire','Earth','Air','Water'];
const RASHI_SYM   = ['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓'];

// Brief personality / career / health text per Janma Rashi
const RASHI_TRAITS = [
  { p:'Bold, energetic and pioneering. You start things others wouldn\'t dare touch, but patience can be your weak spot.',
    c:'Thrives in leadership, sports, defence, surgery, entrepreneurship — any field that rewards initiative and courage.',
    h:'Watch head, eyes and blood pressure. Channel restlessness through daily exercise and pranayama.' },
  { p:'Steady, sensual and dependable. You value comfort, beauty and loyalty; once committed, you do not let go.',
    c:'Excels in finance, agriculture, real estate, arts, food and luxury industries. Long-term builders.',
    h:'Throat, neck and weight need care. Avoid overeating; cultivate moderation.' },
  { p:'Curious, witty, quick-minded. You learn fast, speak well, and juggle many interests at once.',
    c:'Communication, writing, teaching, IT, trading, media — work that needs intellect and adaptability.',
    h:'Nervous system, lungs and shoulders. Sleep on time; cut down on screens before bed.' },
  { p:'Emotional, nurturing and intuitive. Family and roots matter deeply to you; moods shift like the Moon.',
    c:'Hospitality, healthcare, real estate, dairy, marine work, counselling — caregiving careers.',
    h:'Stomach, chest and emotional balance. Practice meditation; avoid bottling feelings.' },
  { p:'Generous, dignified, naturally regal. You crave recognition and shine when in charge.',
    c:'Government, administration, performing arts, gold/jewellery trade, politics, public speaking.',
    h:'Heart, spine and back. Avoid arrogance-driven stress; daily Surya Namaskar helps.' },
  { p:'Analytical, modest and detail-oriented. A perfectionist who serves others quietly and skilfully.',
    c:'Accounting, research, medicine, editing, data, teaching, healthcare — precision fields.',
    h:'Digestion and intestines. Eat clean, avoid over-worrying; routine is your medicine.' },
  { p:'Charming, diplomatic, fair-minded. You weigh every side and dislike conflict.',
    c:'Law, design, luxury goods, fashion, diplomacy, art, partnerships — anything aesthetic or relational.',
    h:'Kidneys, lower back, skin. Avoid indecision-stress; balance work with beauty and rest.' },
  { p:'Intense, secretive, magnetic. You feel everything deeply and never forget — for better or worse.',
    c:'Research, investigation, surgery, psychology, occult sciences, finance, transformation work.',
    h:'Reproductive system, eliminations. Channel intensity through yoga and seva, not resentment.' },
  { p:'Optimistic, philosophical, freedom-loving. A natural seeker — of truth, of horizons, of meaning.',
    c:'Teaching, law, religion, publishing, travel, sports coaching, advisory roles.',
    h:'Hips, thighs, liver. Avoid overindulgence; regular long walks suit you.' },
  { p:'Disciplined, ambitious, patient. You climb slowly but reach high; duty defines you.',
    c:'Engineering, administration, mining, government, long-term business, structured careers.',
    h:'Knees, joints, bones. Beware of overwork and pessimism; rest is not weakness.' },
  { p:'Original, humanitarian, future-facing. You think in ideas and serve the collective.',
    c:'Technology, social work, astrology, sciences, electrical/aero fields, large organisations.',
    h:'Ankles, circulation, nervous system. Avoid isolating yourself — community keeps you well.' },
  { p:'Compassionate, imaginative, devotional. You feel for everyone and dream beautifully.',
    c:'Arts, music, healing, spirituality, charity, behind-the-scenes creative work.',
    h:'Feet, lymphatic system. Avoid escapism; daily japa and creative discipline ground you.' }
];

// Nakshatra attributes — Gana, Nadi, Yoni, Varna (classical Vedic)
const NAK_GANA = ['Deva','Manushya','Rakshasa','Manushya','Deva','Manushya','Deva','Deva','Rakshasa','Rakshasa','Manushya','Manushya','Deva','Rakshasa','Deva','Rakshasa','Deva','Rakshasa','Rakshasa','Manushya','Manushya','Deva','Rakshasa','Rakshasa','Manushya','Manushya','Deva'];
const NAK_NADI = ['Adi','Madhya','Antya','Antya','Madhya','Adi','Adi','Madhya','Antya','Antya','Madhya','Adi','Adi','Madhya','Antya','Antya','Madhya','Adi','Adi','Madhya','Antya','Antya','Madhya','Adi','Adi','Madhya','Antya'];
const NAK_YONI = ['Horse','Elephant','Sheep','Serpent','Serpent','Dog','Cat','Sheep','Cat','Rat','Rat','Cow','Buffalo','Tiger','Buffalo','Tiger','Deer','Deer','Dog','Monkey','Mongoose','Monkey','Lion','Horse','Lion','Cow','Elephant'];
const NAK_VARNA = ['Vaishya','Mleccha','Shudra','Shudra','Kshatriya','Brahmin','Vaishya','Kshatriya','Mleccha','Shudra','Brahmin','Kshatriya','Vaishya','Kshatriya','Brahmin','Shudra','Shudra','Kshatriya','Kshatriya','Brahmin','Kshatriya','Mleccha','Brahmin','Kshatriya','Kshatriya','Kshatriya','Shudra'];
const NAK_DEITY = ['Ashwini Kumaras','Yama','Agni','Brahma','Soma','Rudra','Aditi','Brihaspati','Sarpas','Pitrs','Bhaga','Aryaman','Savitr','Vishvakarma','Vayu','Indra-Agni','Mitra','Indra','Nirriti','Apas','Vishvedevas','Vishnu','Vasus','Varuna','Aja Ekapada','Ahirbudhnya','Pushan'];
const NAK_LORD  = ['Ketu','Shukra','Surya','Chandra','Mangal','Rahu','Guru','Shani','Budh','Ketu','Shukra','Surya','Chandra','Mangal','Rahu','Guru','Shani','Budh','Ketu','Shukra','Surya','Chandra','Mangal','Rahu','Guru','Shani','Budh'];

const TARA_NAMES = ['Janma','Sampat','Vipat','Kshema','Pratyari','Sadhaka','Vadha','Mitra','Ati-Mitra'];
const TARA_GOOD  = [false, true, false, true, false, true, false, true, true]; // Vipat/Pratyari/Vadha/Janma cautious
const TARA_DESC  = [
  'Birth star — neutral, introspective; avoid bold new ventures, do japa.',
  'Wealth & gain — favorable for finances, purchases, new work.',
  'Danger — avoid travel, surgery, signing contracts, new starts.',
  'Well-being — health & peace flow, good for routine and family.',
  'Adversary — opposition arises; postpone confrontation and risky moves.',
  'Accomplisher — auspicious for new ventures and important tasks.',
  'Obstruction — avoid major decisions, vehicles, weapons, conflict.',
  'Friend — supportive day for relationships and collaboration.',
  'Best friend — highly favorable for almost everything you undertake.'
];

// Chandra Bala from Janma Rashi (1-indexed positions of today\'s Moon from birth Moon-sign)
// Classical: 1,3,6,7,10,11 good; 4,8,12 inauspicious; 2,5,9 mixed.
const CHANDRA_GOOD = { 1:true, 3:true, 6:true, 7:true, 10:true, 11:true };
const CHANDRA_BAD  = { 4:true, 8:true, 12:true };

function vpRashiOf(moonSidLong){ return Math.floor(norm(moonSidLong)/30) % 12; }

function vpTaraBala(birthNakIdx, todayNakIdx){
  // Tara number (1..9), classically (today - birth) mod 9 + 1
  const n = ((todayNakIdx - birthNakIdx) % 9 + 9) % 9; // 0..8
  return { idx:n, name:TARA_NAMES[n], good:TARA_GOOD[n], desc:TARA_DESC[n] };
}
function vpChandraBala(birthRashiIdx, todayRashiIdx){
  const pos = ((todayRashiIdx - birthRashiIdx) % 12 + 12) % 12 + 1; // 1..12
  const good = !!CHANDRA_GOOD[pos];
  const bad  = !!CHANDRA_BAD[pos];
  return { pos, good, bad,
    label: good ? 'Favorable' : (bad ? 'Inauspicious' : 'Mixed'),
    desc: good ? `Moon is in the ${pos}th house from your Janma Rashi — supportive for the day's activities.`
        : bad  ? `Moon is in the ${pos}th house from your Janma Rashi — keep the day light, avoid major commitments.`
        : `Moon is in the ${pos}th house from your Janma Rashi — neutral; proceed with awareness.`
  };
}

function vpBuildPredictionsHTML(h){
  const r = h.rashiIdx, n = h.nakIdx;
  const pad = ['1st','2nd','3rd','4th'][h.padaIdx];
  const t = RASHI_TRAITS[r];
  return `
    <div class="vp-horo-pred">
      <div class="vp-horo-pred-head">
        <div class="vp-horo-pred-sym">${RASHI_SYM[r]}</div>
        <div>
          <div class="vp-horo-pred-label">Janma Rashi (Moon Sign)</div>
          <div class="vp-horo-pred-rashi">${RASHI_NAMES[r]} <span class="vp-horo-pred-en">· ${RASHI_EN[r]}</span></div>
          <div class="vp-horo-pred-sub">Ruler: ${RASHI_LORD[r]} · Element: ${RASHI_ELEM[r]}</div>
        </div>
      </div>
      <div class="vp-horo-pred-grid">
        <div><span class="vp-horo-pred-k">Nakshatra</span><span class="vp-horo-pred-v">${NAKSHATRA[n]} (Pada ${pad})</span></div>
        <div><span class="vp-horo-pred-k">Nakshatra Lord</span><span class="vp-horo-pred-v">${NAK_LORD[n]}</span></div>
        <div><span class="vp-horo-pred-k">Deity</span><span class="vp-horo-pred-v">${NAK_DEITY[n]}</span></div>
        <div><span class="vp-horo-pred-k">Gana</span><span class="vp-horo-pred-v">${NAK_GANA[n]}</span></div>
        <div><span class="vp-horo-pred-k">Nadi</span><span class="vp-horo-pred-v">${NAK_NADI[n]}</span></div>
        <div><span class="vp-horo-pred-k">Yoni</span><span class="vp-horo-pred-v">${NAK_YONI[n]}</span></div>
        <div><span class="vp-horo-pred-k">Varna</span><span class="vp-horo-pred-v">${NAK_VARNA[n]}</span></div>
      </div>
      <div class="vp-horo-pred-para">
        <div class="vp-horo-pred-ph">Personality</div><p>${t.p}</p>
        <div class="vp-horo-pred-ph">Career</div><p>${t.c}</p>
        <div class="vp-horo-pred-ph">Health</div><p>${t.h}</p>
      </div>
    </div>`;
}

// ── Persistence (localStorage) ─────────────────────────────
const MY_HORO_KEY = 'rjap_my_horoscope';
function vpGetMyHoroscope(){
  try { const s = localStorage.getItem(MY_HORO_KEY); return s ? JSON.parse(s) : null; }
  catch(e){ return null; }
}
function vpSetMyHoroscope(h){
  try { localStorage.setItem(MY_HORO_KEY, JSON.stringify(h)); } catch(e){}
}
function vpClearMyHoroscope(){
  try { localStorage.removeItem(MY_HORO_KEY); } catch(e){}
}
function vpHoroSaveMine(){
  const h = window._vpLastHoroscope;
  if(!h){ return; }
  vpSetMyHoroscope(h);
  vpRefreshHoroSaveButtons();
  vpRenderMyDay();
  // Update the "My Horoscope" trigger label with a saved tick
  const lbl = document.getElementById('vp-horo-trigger-label');
  if(lbl) lbl.textContent = 'My Horoscope ✓';
}
function vpHoroForgetMine(){
  vpClearMyHoroscope();
  vpRefreshHoroSaveButtons();
  vpRenderMyDay();
  const lbl = document.getElementById('vp-horo-trigger-label');
  if(lbl) lbl.textContent = 'My Horoscope';
}
function vpHoroIsSameAsSaved(h){
  const s = vpGetMyHoroscope();
  if(!s || !h) return false;
  return s.birthISO === h.birthISO && s.lat === h.lat && s.lng === h.lng;
}
function vpRefreshHoroSaveButtons(){
  const h = window._vpLastHoroscope;
  const saved = vpGetMyHoroscope();
  const saveBtn = document.getElementById('vp-horo-save-btn');
  const forgetBtn = document.getElementById('vp-horo-forget-btn');
  const note = document.getElementById('vp-horo-save-note');
  if(!saveBtn || !forgetBtn || !note) return;
  if(saved && vpHoroIsSameAsSaved(h)){
    saveBtn.style.display = 'none';
    forgetBtn.style.display = '';
    note.textContent = 'This is your saved horoscope. Today\'s windows are personalized for you.';
  } else if(saved){
    saveBtn.style.display = '';
    saveBtn.textContent = '⭐ Replace My Saved Horoscope';
    forgetBtn.style.display = '';
    note.textContent = 'A different horoscope is currently saved. Save this one to replace it.';
  } else {
    saveBtn.style.display = '';
    saveBtn.textContent = '⭐ Save as My Horoscope';
    forgetBtn.style.display = 'none';
    note.textContent = 'Saving lets the app personalize today\'s auspicious/inauspicious windows for you (Tara Bala & Chandra Bala).';
  }
}

// ── "Your Day" personalized card on the Jap (main) view ────
function vpComputeMyDay(){
  const saved = vpGetMyHoroscope();
  if(!saved) return null;
  const now = new Date();
  const jdNow = dateToJD(now);
  const todayMoonSid = moonLongSid(jdNow);
  const todayRashi = vpRashiOf(todayMoonSid);
  const todayNak   = Math.floor(todayMoonSid / (360/27)) % 27;
  const tara = vpTaraBala(saved.nakIdx, todayNak);
  const chandra = vpChandraBala(saved.rashiIdx, todayRashi);
  // Overall verdict
  const score = (tara.good?1:-1) + (chandra.good?1:(chandra.bad?-1:0));
  let verdict, vColor;
  if(score >= 2)      { verdict = 'A favorable day for you'; vColor = 'good'; }
  else if(score <= -1){ verdict = 'A cautious day — keep it simple'; vColor = 'bad'; }
  else                { verdict = 'A mixed day — choose your moments'; vColor = 'mixed'; }
  return { saved, todayRashi, todayNak, tara, chandra, verdict, vColor };
}

function vpRenderMyDay(){
  // Render/refresh the personalized card above the Brahma Muhurta row in #vj
  const host = document.querySelector('#vj .rh');
  if(!host) return;
  let card = document.getElementById('vp-myday-card');
  const d = vpComputeMyDay();
  if(!d){
    // Not saved — remove card if previously injected
    if(card && card.parentNode) card.parentNode.removeChild(card);
    // Also clear personalization badges on the existing windows
    vpAnnotateWindowsForUser(null);
    return;
  }
  if(!card){
    card = document.createElement('div');
    card.id = 'vp-myday-card';
    host.parentNode.insertBefore(card, host);
  }
  const s = d.saved;
  card.className = 'vp-myday vp-myday-' + d.vColor;
  card.innerHTML = `
    <div class="vp-myday-hd">
      <span class="vp-myday-sym">${RASHI_SYM[s.rashiIdx]}</span>
      <div class="vp-myday-hd-text">
        <div class="vp-myday-title">Your Day · ${RASHI_NAMES[s.rashiIdx]} (${NAKSHATRA[s.nakIdx]})</div>
        <div class="vp-myday-sub">${d.verdict}</div>
      </div>
    </div>
    <div class="vp-myday-rows">
      <div class="vp-myday-row"><span class="vp-myday-k">Tara Bala</span>
        <span class="vp-myday-v ${d.tara.good?'good':'bad'}">${d.tara.name}</span>
        <span class="vp-myday-d">${d.tara.desc}</span></div>
      <div class="vp-myday-row"><span class="vp-myday-k">Chandra Bala</span>
        <span class="vp-myday-v ${d.chandra.good?'good':(d.chandra.bad?'bad':'mixed')}">${d.chandra.label} (${d.chandra.pos}th)</span>
        <span class="vp-myday-d">${d.chandra.desc}</span></div>
    </div>
    <div class="vp-myday-foot">Based on your saved birth chart · <a href="#" onclick="event.preventDefault();vpHoroOpen()">edit</a></div>
  `;
  vpAnnotateWindowsForUser(d);
}

function vpAnnotateWindowsForUser(d){
  // Brahma Muhurta is intrinsically auspicious; Sandhya Kal too.
  // Personalize by overlaying user's Tara+Chandra status as a badge.
  const targets = [
    { sel: '#vj .rh .rh-card:nth-child(1) .rh-card-title', kind: 'good' },   // Brahma Muhurta
    { sel: '#vj .rh .rh-card:nth-child(3) .rh-card-title', kind: 'good' }    // Sandhya Kal
  ];
  targets.forEach(t => {
    const titleEl = document.querySelector(t.sel);
    if(!titleEl) return;
    let badge = titleEl.querySelector('.vp-user-badge');
    if(!d){
      if(badge) badge.remove();
      return;
    }
    if(!badge){
      badge = document.createElement('span');
      badge.className = 'vp-user-badge';
      titleEl.appendChild(badge);
    }
    // Best-for-you when both Tara & Chandra are good; caution when either is bad
    let cls, txt;
    if(d.tara.good && d.chandra.good)      { cls='good';  txt='Best for you'; }
    else if(!d.tara.good && d.chandra.bad) { cls='bad';   txt='Use with care'; }
    else                                    { cls='mixed'; txt='OK for you'; }
    badge.className = 'vp-user-badge vp-user-badge-' + cls;
    badge.textContent = txt;
  });
}

// Refresh the Your Day card every 10 minutes and at view changes
setInterval(vpRenderMyDay, 10 * 60 * 1000);
// Initial render after a short delay so the Jap view DOM is ready
function _vpMyDayInitialRender(){
  if(typeof SunCalc === 'undefined' || !document.querySelector('#vj .rh')){
    setTimeout(_vpMyDayInitialRender, 600); return;
  }
  // Reflect saved-state on the trigger label
  if(vpGetMyHoroscope()){
    const lbl = document.getElementById('vp-horo-trigger-label');
    if(lbl) lbl.textContent = 'My Horoscope ✓';
  }
  vpRenderMyDay();
}
_vpMyDayInitialRender();

// Expose
window.vpHoroSaveMine    = vpHoroSaveMine;
window.vpHoroForgetMine  = vpHoroForgetMine;
window.vpRenderMyDay     = vpRenderMyDay;
window.vpGetMyHoroscope  = vpGetMyHoroscope;

})();

    /* === END ORIGINAL ENGINE === */
  }
})();

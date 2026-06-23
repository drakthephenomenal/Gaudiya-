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
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAAB4CAYAAAA5ZDbSAABPvklEQVR42u39ebSm2XXeh/32Oe/wzdOdq27N1dVVPQCNxkwABJoUKFKkRJhUtxJRUpZWYkmRuRRbluNETgw07URhIofyciTFsaMMFCmxm3JIiRYnkQAkDCTYQM9TVdd46873fvPwTufs/PEWRNKmlwWgG2hRfdbqP/p2f9/9vvu8++y9n733s+Gd885557xz3jnvnHfOO+ed885557xz3jm/58i/CV9SQdA/4Mv/gT99B+C3J4iqAp8ReFDgZYEHFZ7w/2MgluA/buCBe695WeFJ/TcB/Lc5oIjqU/azn/10oPq4/R/8H02MqhpVjVS1uqtaV9WKqhpMDJj/gfd/3Ko+ZVU/bd6x4G8jqKACT4vIE+73/bf+M21q6Qb5M+9y0jgrzp7G3bqiyd4K2XGs+AjNDBIglRNKEKXkaarkY4K11yTeuOn88HpUue8F5mxL74nR7//dnw4AL/Kkfwfgt+T6fdr8XlBVNcjzX3m/mT//PWTJB/AHj/js6FRoxoIsIJnA9AiqdSCH2RQmGcxSEIFWHfCQ5lCpQ6MFto6L1lTqq1uEnWdNWP8XtE59VsyPfw3Nvw60Kd3A//j1/w7A3yCwqmrgtz/g5y//iCZ3f8jq7hWiAWQTGG3h0gQ/yzxF4KV3FpFcUBX/+mvIzgCTAt6gdQsbDXQww7Rr6jVR1QIBwywxQSuAlS7Ul3Gsqu1eed61H/oF23zvz4p8+Nrvfr6n7NsdaHn7XsWftiJPFgA6+2cnsXs/5hZ7jzN+5X22eAWmh7hC1YcVj+YwXwhFS3TjvEh9HTm+g2w9h7t1gCyAseCHYEPBO9COJXA5OAPVAKkH6OV19ML96DDzPl2ozfYwk31rrIfTl3DBmYV0zv+G6Zz/+1T/+C+KnEu+7q9FnnbvAPyvBO5T9l9a7PhrKz5+48fJrv47Jn9xiYMXcPu3IQ8LrXUN/YFhmpDdztF9jwDhe5vIbIGZF2gF/GaX4uYU3cnxfQOJJ2qCXwAOrC1vbAmB1RD9voeQ00uwdBq/fwu5e0tlMlK5e+xNTMDpdTjzPoiXX6F64m/z/Cf/njz2WALw1FOP2yeeeHsBLW8fYMtoVeRJr7pbd+nv/EWyV/5d2xyfYvQG+dFtx/62yGxqWDsNs0PkzgD3WoY7VHwA4Yc3sAyRoxRsgNbA1yzpzQwF7NQj3sLQEaiH2FAcKoWH6MEqMkjwucf0wGxW4fIGJp/AOIP9BKxVDfB67qIED3/A0NqAmX3ZuclP/jetv/mzT4i48tp+3IuIvgPwH2C1ef4rn5Ls+n9is688xOQWubNOFkNjDvbE396F+9aQWODuHjKJ0WEB3RqEgpxaL81y2Edmc1QUN06R9SasVJH+HKYef0Mp7uRUrhh85tGRx0UW5gXFtqAOpAW+UGrf28N0K/g3hnCYwNgj7Ri9vOJ1+ZQGl69Y0rv4ov4v3NqH/sOo9r/+8n/3O/0bC3AZRCEi4jXZueLliz9hhp/9kxx9ieJoq9CwbWm1xdgM/eUbSLtAlwUZF9Cs4l7O0KlHvSXcUEy9wF1+CEaH2NEhWo/waYFUAmS1jqhFnQVnYXuGWoWWgWFK+uwMP1aCmiUZKbZjSW87mu+C6FRc/p7mMvndlOjgGLOmaAN8r+W129TAZNafeMSZc9//Uzvtv/rpkyLztwPIwXfyShYRD2hRfP4v+vlTP2kGv9Aurj7nSQ2ydCbg7HcBEcUv/SPkVkrw4RDp5/iRJb+W4W4W+ASSY0f7MoSnDP6513FWyWcGE+UEInCYoBsF8tAKxBGaJGg9QVoxGEV8SvRQRPJ8ivOOqGlZ3MqptYVgAK4okGqAIyU6E1DsA8eC9QYNCkPFk85DZ+5+3ho9/mvrZ/LHdPSVvyLygS89pU/Zx7+DV7Z8J69kvakVv/YLf8f4X/vzXP9V8hv7zreWbVDtwUEO2QJevY2OCuTBJpgUt+/Jni3IM0hTMEaQHJpXIFgHt15BLp9n8YUt4rZgWQBVzDJoFSSuIb02uuijhcGsXEaPbiOLEaoBbiTwRh8hQLdT8iHQCwkf7KHP7eIKsCuWdNsTtCHsCbgAubyJnj6lVBYubNuA9T+dufC+/zCofP/f+nqKd++B/sMNsKpaEXGLwS+fjYJrP23ktz9avP7rzt+aGp+qSNRBnxkT+Tn0BD00YKFwik892VAppuBzSGeCFkrroqF2WZAlixZCMTBEvQjzQAXNZ1BvotUN/HgKt95AI8GuVJF3/wV0eh29+zXYGSNpAe06xa8fISNFY4FTVWScoVKgiZKPDB4PmUCq1O4z2M0KxUGKF4N85H7k1Iq3K+8ydvnd+Hn0MyY7+ePSfWz4nbiyg+8EuNns5Q+G/NpTpP/kdH5wWHA4DSTM0dSiv7VLsBDcZgVC0FmGSzxehGQk2AbEG8L8plKrGZz3xD2DTD3ZrQJ35EmOwZ5d0Lm/Bt2TcOcGWvPYi/ehgz75nSGuX2DtMwT+FbR5EjnbRm5vodMx0Uda5F+eorMCtueYqqKnWhTDnCBfkM/BZ4rtWUxscHdz7KceQl8/wL/xOkG2a3ywqhos+aBlfsznW1dU7/wpkdNvqH42EHms+ENnwaoaiEiRJ9c+Jf4LP22P/najGEwLPdoJTDHBx3UoavDFIyQQqIfkr6a4Y8V2hDwHWxEkBHVKchtsF+KaUPQ9mgmLOagRaER0n2gTdicwVyQv60Z6O0H3wKuQJyCxEn24AR/5JLz0VeT6Hv7QIaermGVh/pWExfMF9YtgehU8BndjhnQtkjiCdog9GSNpjm40Me/ewI8F3b6FSAidk3DqcmFbGnj70G3T+u5PSfzYc99OS5ZvD7jlU1uk1/+0yEs/be7+pyYfzb0c7RsmR/jOGnZlGffZN3C3c/xCkYWiC9DzDQKbEviCbBfUKwbBpRbzUIDZSiARJttKcCKmeipETlYIllLM4QRNQAJBCShecOhCMcsgDYMsK3z0XZAtkC+8jjsSdAzFUGFDMC3L4lWHiFJZheCUgcAgD53H9+ck/2gHUyjRIxYTWeSxM3B7BxYeBdQCS22ks+7sWt365ncdu9r3/2jU+p7Pf7tANt8+cF9+3MpLP832T4krml7ajxjRBF26iFx8EP/iIcVzKdmhkt1VFIMIhFeWCR9p4p0iBVgruJGCVcJhjnpYDBUxkB9nzF6co8dj/M6M9IZFfYDPgYoiV0LyriWfKabhMXVFtu5gJgfQifBiOdoTklzwB0r+ekGoYObgjoXsdaV4zuF+7jr+mUOkYXAA+w62Utgfob01kmfmsJuh7TY0Wvit6zb5wrPO7P3yUmhf+sc6+AffK/LEPVLkX2ML/jq4mnz5Rym+9g84/PnAmQbSeUzcnZ/HJlP8dIgMjyl+bUaeG2TFEjQEHXnkyGMeCsA73G1Hviv4Qok3Q+RSi/QLfcTBtK8EFaFwgi+geR6qjxiyPYguCjbN0dQgzuDnQOYwAWihmBOCLldhYkh+Z8r4KoR1aJ4X8l1ldhNMCM2zhvGWRwuodcF5SBZATeieAFXBnIhQY0lzixmPCc6EBBsWVU96JyPY6Pj4+3/Q+PqVkXPnvi/q/NhX3mpLDt46cJ+yIo8VWf9LH3f5s/9A+j8XEj/gzdL7jN76BaR/G39jjp0P8ANwhRD0FNsDP/EU+w4RITjM8DNwQzAtIdwUGHvy54ckY0jGEDdBIqjGQr5QsiOlclQQnwvwSxXUhUjmcM+lSCrIhkGHHq1XcGmKOfkIamIC/yy9BxXJZsiioFoDUxXSPSVuKV7ACyxymEyERgtcqozvgAsEvZrQuBBT/XNXWPz6S+TXE7wpiN67SWQHuDeGJn/5JR+eP2wjV39e9SufEPnAjZITeGvqzMFbFFAZEXE6v3vKu1/7h9L/6dBVP+qlet7o6GvItc8jdycgAW6tDYMJwaMx899JsLdzsgVEFZA1wViDGyp4iM4KJvYcffXev3cgOh/AxJENYLjnwUDUEEwkUBTI2jl0vI9Mh8i5CotnUuK+ojNBOwHB3JE/9RVk02A2lxCZYh5eRrfHyNGCyArJEO6+qLR6hsnIY4EoBpcrYoThGMYjj1rBfiXlfOs5GqeFolGB91xG2x671MPPruKvv2zcUsvZ0RdP+UKeVv3PH4P+VFXlrSBDgjcf3PLa1+1/XPM88/Om+NX1Ig+dxomV9BU4+Crp3px4uYFsLOELIfudEf4oJd1XBEFU8YFQPWfwew67bojqiiYONy7JjfkQqmsQrgiuomQLoYaldsJjewrdEGmC2X4FPShwiUBs8E6Y3wXmCremFBkEHaFxNiD9xV0qTWCcYjYj3NWyEBGetCSHjmQAvaYwGyvNNvjYskghO3YUDiqxsj+A/LMFlz5oiWsO8+oesu7wyRR7fgUZDjCmYv3qo4W5+euP+kr7/2Y3/4s/p/qgLYn0t32Q9VkrIt43wv+Lqb70geLoblFMFlZqazDbAhMRf/fH0F4D98YO9PcJWmDGpWXUNyAwEHcVFh7bEMJPriOrBhJIDgRxEEYgBUiWEb6vQXghonkaKg8I8YfbmNN1pBKiM4XAwhyKoaPSEyI8bqKQwmIIyRCSawWLgTDdF/QoQ+cL5EKIhJBcLagCxdyDh3pT2N1SCgW1AgK2KgwnUI1gsYD95xzJNkx+dY/prx/i9wp4fgfmIXrrBXyWBK6yVJiD3/6zxfQn/nwZdD1u39YAf93v5uPf+pOmefCX/dZni+zqVwNqDyLxJpgIaZ8mfeUai+f3kG4VhinSs3gv2AKKgWKrgv1QF3MqRM5EyOEYmSi+L8hUCdtQP2UwJ0Lko5ex3RqtKxC9q0AerqOdOhwOYG+Gzwy0QugI4UqEmTns/XU6/94qlUsh7RMQG8VdK/AO0hH4hiDOYzpKcDqgccnQ6ionLwhBHWwIcyfsXHUkewXVrnDyjKAe1AndBsxzYW/bc3hXmO4HmELw1x28OMTfmsCX/ikqkfF+5jl+6W/q+G9eFnnavdlNfubNA/fTBh73s61Pb5po/+8w/rL64dgE57+PcHkD+v8cHdyi+No/IXt+m6y2AWunkcLjl5aY9Q3ZAhb7EJ62WDLwBmk3KL42we040r5gz1epXwioLCthN8Bs95GbR8i7PwTf8ymkvYw5cQrfqJI0NpHzp8CAjQV7x0G1QvDBZfTZKdEHu1TfXyUZwXQG8ZmY1rstQVdYfE0oboNGhspJqH3YUn3UICHMJjCbKdtDyCNh1Ff82PPQBwOaSyWNOs+Uo6My2s73C/JbBeke5Mcg/Rwyg770rPGLhVpz1HPF8L/Sz3464OkH5etu7m2VJn093Hfzp37eVA9+1N/+Z06DJSsrH4LbP4vuvYCfzJAFFHs58l2fJDi6ij24SfKSIXnZ4S0Ey0J1Q7BNj0Tgdw3F6goqwOt9goer5M9M8AmIUeyFgOBEgK42MRfvR1oR/pkvwun3ksVn8L/yTwj9DJkJxWse1iJsBfR6RppAvGnYe9WTJhDFwszB+gmwM5CeofWRCE+GLAvFluKPAyYvpsyadfaPPTsvLzi9Lmw0lWhJkAiGfSGdetpdYT5WogJW7xPSGeQLpdKF8LQh6Hq0AuZd5wr7wccCt9j8q8HyT/zUm9kCFLyZ4OrsF/4E4Rs/6o5vOqK69dkEk44pXn8WmY+xK138bI7EYN74DSTL0YkhwqErYDYFe6WOHE3RZhut1THZHkFPyF8cEaY5+mqOBJClgtSFSqb4kWArffT6V+HdH0UHKYQvkL3wWxRf82SBIIlHEPy1DFMRoiWL7nr8Qql1hHRXmc2V8VzY3YcTJ6C68Bz+9IKV+4RwBdLMkO05ihFUqp6TTRjYMv9udkrCxUawfp+h/wqIQqNlmA08pm2IazC747EZ+F2P/XpAeSa3dus5b+3+f6zJ//G/hb9+7c1KncybkBIJvKzb21orplf/T9x5WjUTkfkOUjsD45u4vSE+rOGGQ6gKLMeoExY3DV4hT8BUwTzcgobFP3geNhq4JMU3Atzn9wgWCXIxwnuYDYR8pkg9xFxeIpsuyIYGWT2Bhi3k4gUYTamkSv1CgITglZL9Wg0IahZ35LAx+ECIlw3dDqROyHKl1xbGY7i+C6/sC6+/LFz/gjB5xVEcOsapYfv5BbPXF9QrwnymOKP0zkHjPQE2c6ysC/MRTMbgK5Yv/DPP1Vc9/bEwn4FLhIPnIN0GkxTi94fKy1/s5DefffLN7NJ8E3zw00bkSb8W/eSfDYpfu+K2XvPsv2x0uIupWuTWP8NkIHVDMfH4WYZUhKOvOGZ3BVYr0AsJrsSYS2fxtSqcehjdH8GtY/Idh10yaGjwJypkWDBK8HCT6g+fhJUGcn6T8ENnkWoMt76G6VisxAQOim2Hn0JcFzQFsYb5yJMlIF6x1ZDgdI1KBZaaUK2WVoUDEWXhlPFCUacEsRBW4MR5y9mPRGgkhCjnTyg1Aa0F2ECwIdiK0mxAs6Z0W57Mw40tZefQM5lDkQrjoXJ4F9IXjtCjI+PHc2+yo0+l0//gUXhS9alvPaoOvnXrxQ+Hv9Kj/zP/EZPn1e9lIoefQ+57F2b0HO7518iDs4RLJwhnv02xA5p6mpdDAs0hLgjPgtYDtPEQdvn96Cv/GFksCM438NZDJUS+NEF3UyrvbxDXa7Bk4OYdzKVHCD/+/TB8Fb35FdRYNGggqyE2dYSHBeM7QhEp7Q4M7mQIgq0KSao0co8eZOQeqjXYCOHwSDEGMieEAgdjZTITFjlUrLKa5TROG5bvN/jrytoZQ9BSJrkhXoAmAilYKckQRQiA0IIYSGfK9kxpdIUCGFxTllbHEr77AW+XmhXdv/3vywV+TPUB/Q5b8NNGRLQye/XftuH1U25/6NlOjNEQiWqw/RzqA4LVVQJXgdseril65KjeFxC8ew0ft3CnzqNrHaR1Fq0uYZsec6ENFxrI+Rac62FOK9YW2MMxtlXHnH0U89B7MSsVdOez+N1XcLNjdPMHodWjUJjNYqIPVWmfK0uJi6IMK2ttmC2E/WNhtlOwuJNSRIbtkTBNIIiFSghZAceZsCjgIIMXj+BL20J/Lhxf99SX4eKjhmzsMR/sMu8LO7+RkfWV6b4SCEShEFcMNhICCxUL9dWYhTccDJVKXZlNlOIQiIxxw5EaP/gR7f8f3lV2mH5raVPwLVmviB/cfLYTyH/zV9i7ptwpxBSKjhQWB3gNMO86SeX6c+j1DHdHIBXC9QpQQ+77PvTF38B31jHLFyBsoBzhz/0wku2hRYqpxPgvfR43Bpkr/q5iZ9uYqqDNEKI1yI4hVFg6i8Q1/K2vIS4gfWZO/KhQ2TTUh0rhlLApHO4r4wmkHqI+BGFpnTd2y+/2nocsi72CjYYyzJXUC52KYeHh7tjjAsEEyuymx5aMKPlLQ9buF+YiDG4reQGNJWEyVuLc8973BbzyKvT3PSu5p1GD1Fj6Q0+vC8UxMDoWraizoa34xav/K+B//p2z4M99xgpoc+XOp6y5dsJfP1IRa3wCWhg0CPD9EfriLnojx9sYaVnkXAUrBWKbuO3XSJ/fQvs3kc4ymt2CdA+sRSvnYfXj+Lsv4V6Zkl0Vsi1POoZ8P4GXb8CNW+jRNv7aG/hRgtQsevv/g/EZppnS+TgwSnEzTxxCY1NorAuhhSBSklyZZbBIlCiGc0tKJ4RbrzoWKcQBXFkSwgC2Jp5Z4tiswayvzFNh5xi+8ir0p8Lgy47k9YLGEuQeBonw8nXlcKgENYFMWY6U3AtHezlhCGEgTCYw2vZIvY5fPoVOnXG3DtTM7zyhh3/18rdqxd+8D/7EZ5zqZ6w7/k9/nFtfUPVWNQwoxgX2g6cx0wX6woRiB6Qt6MLBxBOccrgbKRLvoYs+5vKj+INd0s/9E6L6GIkUlQTtXsBWYrh7m2Tf4icOG4ETiN7Txi3m2GmOvn4Vkxv87du4akhwsYFWBF+rYDYWSFzBNpV4lhFeMPh9R3tN8IdQaVqGA0+rCXEMtg3VQMmcEHUtO3c900SJrLBShbqBjUpZl757UBb0J4WwfQw0DX5fqXYMtZ5nf14249cbQlAxxA1LI3ZEsTLxwmKgDEcF9QgkhvbVBY2r16CG5HsjZ2PT8LXz/wvgr8Er8m21YH3qcSsimi/+4Qdl9LVH/dZdJIothxkSCsxH6Evb5LcE50E/vI45FSA9hVmCDSyyNyHsbBCsnsY9t4v7p6+izxzATMA0kObDyPFN2BPs2JPlBreA4HSEec8GbifHEeE6vdIl9C1ys8B9YYzcdZiwjmgVqYVIOyB8IIZWgCwJ8WrJZ2vuMQb2d0G8EFYMtQiaFVjqQr0Cy23hVBuWQjizBPU6xN2A1ZWAgHL0ZX/kmSyU/YFy7RVPVBX6c4hqhlrXcO1Fx9HVjAxhY8UQoeQZzLwwziFTGBx50t8eoG+MsSsdoX+genjzU3r4k02Rp51+k6TUN2fBKw8IgBRv/IhZvCHFnMJPksAWii0Utg6Q3GCninlPjKkUEOaY8xa96/B9BwPBPrBD8dxrVJzgQkVCi9Q8rH4UOfGX0Fd/CR0oJhBiq9iOofIDy/jndvE7CnGOzZXiruLnSpEKmjiq9ZSguo/77Rw9t4p9qI1OtUwuc0/y4g3CiuH1W55JBs2KcGPLscggc3D6JCx7z0ZLiduCGCEZeEwAt3aF0VBp15S7Eygs9OJyGqK7IgwnSmiUUz2YzGG07xk5MCOYzT29nqEVC626oR54Fs4Shcpo4Tm+Y1gxHttKjDtTd5bJBZfe/gHgKfRxwzfBbplvPLhC5LEnC9Xtms72PsXwDj6KDL0QLwYVsI0Qv10CY3sGc9jH5h5/y5G9qviZIidjpBERRBVsqNgrDeR9F5HeWbS9gbvzf8XvjSn2yuGwqKrED4aYwwHB1hAVi97I0JfnpCND/zXPfNeT5YIbG/KvlLyzOd9Bb95Br70BV2+gt3cwTYNGZRpkbGkY/USYA94IyycM43FZhIoshB1LbcWSzeDkEpxue2riWekKg7yMzJeWYPUEnH8gwKvh7AZkiccrzArlxqGSeHBOaVShP/Wc6AnrbWGpbcgK4ejYMxsKcriAwsBgW+XwtSdK6/3mUqZv4op+3ADk81990C5un3ezmRJXDTZCxx7pGbTv4UDxCeidFGZKcVOZfU1Z7AnmVIRcruN9BhWFAHzm8Vu76HwBboTZfQqdOZJdwaUQdsGOUuQwwTQMxURJx0I+FtxYyKaGfCEsjmD8lRx3x1McF/gXbqBXU+gLMlHsccJsKhzdUVZbQjWAtIBchaWmoV0zaA7FpAyCpkcwveuIGkqtBktnhM2zwrkzhhhIvLBwMBgrg10l3qwTnGhQrQvLa4bJAhIHwwKGORzOhOOJUq9DWIF67BlNHCc3ArJUGOwpi13FZt5wMBOODx9D/8qqyJNeP/2NB1vfBMDl9Wzc8feYaCI6x7M9Q0YLJFcwQvqGJ0uEwkF+pLibihtDOhXUCH6UI+M+hDW8CXEJcLjA3TrGeQvhCoQnoAt2XQiaIA0gNlAIZBD3ysKELyDvl2nJdKyk87LNRlVg6jBHir8l6DGQATWwKFmhzAulVRE6MVQjpRVDkCt2PeDEY5YgUFIVwopQjT3tC5bKpTpOQSpw9qTwcE+5sKqsnihr1If/fIReH3O0A+tLQmDLro8gEKYZ7I49+xNo1IVKAOlCiULIswIRIU0U7wyaePFqnUmSHjujP1IGtp/7dgD8pAOQbOeHmRxiBmA8iAiaQXHXkR2W3K/GoAtwc7A9S9AS4ooinSq6tIT2E5hmFNagqtiTbTQfoskcX72ASk7lXJnSULfoUoSfCK4PQQfik2CMQQul0oKoabBeCZ1iHBgH/sBjBNLrSrGv5aB3Ae0OzArhKIVuA1YqkMw8zYZSaVskFPK5YINyosIsWXzVcPu/nZJlQupheRm++wHl0cc7nHq0Sv8IbhwJgzEYrxzvOXIF75WzHTjbEtZqQuahf+CpqBIE0Gob6g1DGCi9nhCdqVDkQFoo8zF+Mv4eAA5X9S0NslRLHFU/Wynu/ter5ngPN3ZiWlE5grkQigKKDMK64nNhOhGW1yG5odhciVcUuxpgwrDMkaMqUjfY5QhMhrl+HWl/CRxorwfDMRSKWsF4D0aY3fIEdcHUFZd5autQCQRdKM6E1B6NyF+eM9sSiszTPglpApIbhl+A4R2lWhEePiekOTTwBPeHGO85esmReYtu54RtZWPZIAEUoWV8NSeogIugmAuy8LSWDSYQrv92wf4Y0gDeOIIrG0LiYJoqnVgIXdmduTMFLeDU2ZjuijJa5MwX5Y2CVxYTofJGSrsboc3AEKToZO/Rez1bb3WQ9el7ofrRFZkcnnG7Q5WqNZpBctWRDsAlZclMPBiUak1xe57FHU+0LgRnLBLO8K/skW8F5M+k+O0Cr4IJDBJWka1X4eAqJsmwpgJqoG7wr+S4GwVhC3zh0boS/8gp6o8ENE95Wg8FtFZB9jNElMJ7qveHpIXgFIZveEYvFrRbSihKd7kEKZ0LLle8V9pnLeMvTKheqND4n9xH1DEYgYPP51RrwvJa6ZOzmae2ZChGyuDXBmxdz6m3YakBiYdrfWj1hPvvt5w/KbSqytqygEIYw8FuxmRY0O4Is4lnPAMPjGfKZNdTjB1St+IrATrav8j4z1z63caKtwzgBwUgG9992KZHgWbe02ui2xm+D2IhXoYoUsJlQ+VKQBgowxsQN4VIFCcBPqjjjw2LXY+fKSAUr6SkX5ojFYE3cphX4XYOL05hWdAgILmtpGNwBchqjHlXi2C5AU3FbAb4Y8XfynF3cia7kM0AHKaqNFaFIi+7Na0vI+Rk37EYw2gBOy8WHG0pqUCtBRIX2GyfxX7Bzg3YP1A8Sr0F6x1oiHL8hmM8geajIbUlw+EA5jn0WoYgNrjEc/67Kmw+GHLfKcF6Za0OcSAcTZTtbcWGQlSV8r2rhnrHskiFxV6OsYX46dAFZt4oZvlDJQbfGOnxDQH8uc/97fLNp/sfYrKHXzmLd00kVyonhOoymHNVTFuwdbANISuE0ZGQDoBcCS7VkDjGek/j4YC8IeSHit72FFmAP/YULxTkv3SMJOAvnYWPnKR4ZY7LwdcNvlD8qQ7BRgX97KvIRCGHYujxdaAFUjXE91mOnys1Wo72lfaqobFuCCtCkpb0YbMNo2lZF+42IZ47grbBJQkshPTyRYaHniIwHFxX8iOlGoMVobVmCARG1z3LLTDWkOUQhtCpQ5oJw6sptbhstA8U3vfBKpu9ki4dTGGRKu3lAOPBOVAM1bpFE/BjhZP3QaOC+uRyCcLBWwfwJz7xCQ8gbnIWdZDlsHuEO9OBUwHSAuIYUyv9ZX6zIFoSqlUhDBR9fxM/TdD9EeoV3w4JPtAlzyBTwa5bimsZtmOwhSF7KYVP/iC+8jDy0BrhBxpE4slzIf3NffxvHiCJ4LcUf9cTXRTCM0KmhvpFZel7oLUppMcw7wu7NzwoHB1D/7hsfFpfUS6dUi5sKO1KWQHK54bJFxU3aOOb7dJ/e6G+bHAnK2XxYRl6vbLD8vrXHPWu4cIJ5ex9Ab31gMVIiWoGP3RI4UGEdhv8eEHoPO0YokDLro/AU68YskwZDwoWiS/5+KMF4lRpNwldeH8JwjcWaNlvLMD6vB791o+1KvXsM2Z0s+1u7SCDQlxqkCSDmZC/vEBSJVg1uKxMY2SsVO+PsPfXYBaR19vMPjdGckdYJNipgBECXNk9OVdGtz3WCPHJG7C1hU4KGKfMbztqjzaxFUcYKckNSHchnyj+UHGbDYL3rWDTMUwEu69MjqBVL/3f3m3F2JJiLDxoDlYhDGA4AKwwGpdWHYxGTF7aZW8Cs0SpRdBaNoj3jA+VwwPln7+hzI0Q9z31lqF3ISA9dMznUKkLrQsROIebQbWmBAquMCxSJbBl814UQ2fdMjhWvAEbQONkSFQHdKxGElMEa+4nHv+xvyfn/o5TkCff/Cj60wJP6tKpzU7u7qyqA50gOhZkMse0hOm2kveFWlPxiWIKmNxRJBLUFCx+5ZiwbbAtoViAmUBY8/hMqPbKT6O5kI6VxUIIKlB/vo9kHjkuP0XYtcyendJ7r6HoG6aHHueEEGE6hE57TjWbI50Af8sjGcRVyJwS1qC9JBSB4ca2J7Rwrqt0VwyVLiycpz9QFq4cSx31hWShjBNlkkPPgZllLKZloX5nLIwLsA62VegGML9TcHNL2ZvCqcJTbRdMU2V6LKzfb4ltyeTVI6G7UQrthS3Dou+o1ctLsbVicJOMbM8Tn2kZRgrr0UneM24BffRfvV3yG86DM13qURSRTzMCU6Ym3oNLIR9BnilaNUjFMj9UwtgQdSHdVUZbhvRIyW85qmsG3y+t1D4SYi4H2C6YqmHeFxaZcHQMi9tw+BVDlhnyzLI4VrIjyG4oyS0FL0xncOOmZ38IOlPsxGMjIXrQYk+UwdV4Isy84dYxvLLtmXkhRxjmhhduwGyu1FqwdFLoNCAWJZ95akuWkyctbSM0I0gXZclRrFAUymqsdEKlKJR66EkGnuUeLLVgdwLbNxzVumGUCDu3HPF5Q+dhS9WW3SFrpwXy0qc3mwarUDtjiZqCxaDjKbpYILV2RPv94b379K3Ig8vozcRx12aF+CxXsxAR4wlWBT9UbEXIPcz6MDl0uIVQW1YaPeXwDWE2FdoCi22l9fGQiniKoxyDQ1KPvRjT/7JhOpgzd1CplZOD+/vQ8bB+WaAjjEdlYKOFYGOlXhMcgrHK7Rdh/axhvaewEWIbBfUVIQkEDLSXDc3MI4UyncPRTGg1oBgrjfeEcKTM9gviWIgr0FgRVlZhxcO8UG7cgqpVqpEQ1oXJYcmANU15za9fCtGxp2mUr86UWQ6CZ2XNUFu1uJGnfdpQ6xjSNxyLbc/8QGifEUxNiTy0TluKXU8xK7CXTqLTXdRnAcQlwJ/5jPyrovwNWPDj915hq+IzfF7g5h7fDZF2SDEH50qio3/oyx5gB6qlhQchNJYg7gnhZohLheLY4eeC33FIrLDImW+ljPOyTcZWhelUqJ8POTqGyZan2VLaS6AKi0yRTohGUoqjWGHhhWLqkbUq3lXwe4pm0KjCbKC0jKcdQaOm1Jsl49YIPM5DOnDcfM5xdyTMFkpcFfaez7GJI4ghSyFFuDUx3B6V5EpoyxaeonTxmJbF9ITJQrm0Dg+dLm+V1Q3oXja4hZL3HbbtkRXDdCJUY6g2DfVLNbrLFsnAmDJOIDYQF6ifWzClQX7mrSwXysxgFEyAemCpgp9n5AmMB0p478kXyhGUsGbwzlNpQ+R9ySN3DIvXM9zUYytC/YxBA5h8yRFj8EZp1YXYKEd7QjQusAZGhxAWHitC1BQyK6gVJlNlkglFAK1Iqb2ryvBqxt1fnXD+w4IxcHjLM5oK1YrSbgvVhmAsGC2DJ2kJd1707A9L/1qZw2pHiaowPwY/V+o12O7D7kxZrgqTY0UVzp4wLNWVZOpxry5onDBcvmJYHBd4ykIJePzQI4HBJx6fKFIz+BiiwONnBbJqsRNBMsUsVaCR4Q930JZBXS7Qsm8hVfk0AC5NNIirqLUQgozmZYc3Qq0p5IXSWAlIh46obZkcFyxVIaxBMVL8QjDiyGdKlsB4D06fM3DDM70Di8wzy2C4gMApoYFkBitdwQCHBxBXlGglwIRCmjgqDQMTz2IBFVEmO4obOaRmGN1VNFemqRDEwlIHok5AOnclby1K5oX5HIbDsndaHSy8MBhBZJRiUSoI3DiEQpWqhdm9MuEkUZYK5XAAvgHnTwnzHY8NlLBn0NQThuCtQFPwc4ffAHoWs6107xfSA+B9a/hkinziPrTWRK7fhJ0EkQayXAfnDOksfMsL/taYHI0Ro9CEIFF8oUikhFVBFyXJUBx7ZOYwWraPiilHMfM5WFWOB1DkpV+c3/H4sScIytefW4HtY/CuHOiaJEJtIaS5MprBxUsB/WOPz5TFAhShWoP5WMmsMLmecPKsQbqwuwXWCLmBWkXoT2GlptQqME3KvqvZWEkm0GoJ8yPFeXBG2HcwHilnesI8U7pNQxQJL9x1VANlnJaJ5u1DT82WfX8JQnUViqhC/F0r6HM7pDuOuFOOvRYfO4OhT/riBAJDUFGiwiAywZ6o4iWHV19HjhdlLlwI2AoSVAWxbyHAT9+L32QlQW+UucGpLnJriEkgXjLk8/KpXhwVzBKlHSpRHcRB8O4W2ZcXHL6U096EwUxQpyx3hPQQQmuwoWI8pFM41RUyV1KEEwfNRBnNPakRnBju7nusg24dTjwUE80yBgPF59CKYTHxFB4GU6FSE2ptYTDQkgsee05uQsvfyzYSmHsYj0vgfQFbQ8+gKLs9ZgdKNYBWq2yo8yooSj0sOzMtsNI2tKqwvwVLG0L7RIHe3IdYiT9Qww0Ubs2RB2Oyr6Vkd4VwFTyCCUrFIG0WyPE2eichT0PCMxYJDaaxiZfTOf7C9K0rNjxedhSEtc1xkaqa2Ij2Wio1xQQQVgRBqTQsUSDEcQmQGJgflUS6ebBOlgOBMM0htyV/u9fXsmDeL5md/b7irLLUK2u3aw1lb64EkRAbuHYtJ8nK4K3VFNo2pxh7Nh5pUKuVoyRYiy/KCs4sL61fvSewIKEizhNs1shXasQhdOvCck/otct5X2cEAoNH6NQNYoWdY4/xylpV6YawUYO2wv0nAk4tWw6GyuEYtm7B/hs5yWHKvO+Z3Uzhg5v4y0vIs1cJNSeqCZW6Umk6zOkIubyGJgukE5E6SzIG6QWwchKqG6hd8vPKqewbDbK+8XpwvTPBmMJUahiTQbUcCdGhp94QjCgu9VRCT61X/mGKGkyeH6M3xtiucOum4oCjiUcVCl9aFrasnZ7cFJpN0FwJI2G6UPopTDKlVRJDWFMWyovEM9kqCCLh+Pkph7seQmE88SxyoV6Do6lydacs3jcbSrNSluwYJVRNQXtT6K5AtyvglTiEdg3qRjldV6ootRAeOWNoxRBL+Y9mcGldON2Do4OCesMQVcChpKmQJYb5SEiPPe7WFuZjG0gnJIyU+kZZH3cXzsC7TiBuhI5z3HRGFhjEFVABqbdgcoyxbV9j5u+lSfoW+ODPKDwJuLmIT6XWCTU9QldqyJ05shQSFgV+x7MwhiJTokCobhgyL4xeURpL4ES4fQj1WjlpkHjomlI9p9YWxjOhdy6g3vQMXnfkhTD3pa/0vhwFubIZcDzyWO8RgeOxIOopKiGNE8pk5EhmSqVlqBnlwZNKYoWgEdLRgrhw5AV0lzzaMph1y+C1gvERhJFwIoRODssxxEbo1KWsvU89WVHeTJ2W0K6Wwmzb2wWDBFqBZ7UBQWyIYqGYFeCE44Fh8TsFa/svEX3yNDov0EGK+Cn29BraayKDAfTq+CwlulRDTgi62kKTkWK8aLM7ZvC5+VsYZH2dG0vGXjmy9V5D+wfKSkP0QdBOC3l5n6BfDm3ZSBjccuQIUausE1MzqFfCsByQ7lYEUZiklF0OW6WaXfFawcgqoDRiYS6QF0q3KlgD44GjsxxwfKRUjDBdeJoVYdwvaCwLJ09bXv2tgmKitHpQX4daVXGJo5iWLqVwMDsE9gqCrpBhyLxic4gbhoqBNPXsTpRG27LfL5hlQurKZr16CpUAXtv2dBqCRnBzWEbgUUUxMZxpQu2MYXpNufmso+EgujtHK4KeP4se3cH0X4VwDWprSJggoyMqJ1aRzUfRw1fQ8VBZWkFs+wbtf2t8b6Lkzb+iy04OFZE/OvMa3SBWTC1WnUzhbAddLNC5xyHUl4VkrkwdTHdheFUhFKwq1Tr0KlANIVkoSx3h/rNCOyqtWlGOh8phXxEviPcEhdK4J2HofSm/7xaeRmwYz5RFUdKOna5hcFcZ3HCcPGGphNDtQMsoeqyEeUFtHcIeVDtCMlJmfSgKQzoqr3yMkMwUnynNsOzMmPYLFmlZCMh9qc2RAXMHEhm8KYmNWQGFFfJMGYwdjVXDpA93t5TDHI4GgvvqEbx0hLz0ErrfR6Mu1FdQb8kPB4gPcFODSogGFTSsQqWOxHKr5FKeNvINcJXfoA9+wgDYSmefQMpxucLjZwk6zlAEqhCcC6j2hFZDGE6VRQqBlNFxuy1sdpR2IFSrcNz3RF5Z6ho8MJt5MgfHMyExFoktC1e2p/YLuJtQVncmpVyg03Kud5zAzlEpZZQshDvbnrVuyZHjDLZuCFpgH6phL4YEbaVSN0Q1mG47bAG5L/19bGEwgEYbNpeVM124uAZNo/RqQi2AZlXInXK6V/ptLZ8NJguwBZyqC4OXPNGRJ0JoxFCrQx6UNfJsP4dlS3G8h7txE7oXCXrLqFOk1sIfvobULiHGQrQMmtwu68Evv3X1YD53r6PSBlvUlqDIMVGALGb4gww3FYIVg615WqtaRtURdNuCNUqYKv7YIR7OdpXLy9CNBBOBqcPOMQx8WS5TrwycIIGQK0ydkHvBCLQrhsxDuvCoU4wogYFaVAqhzabKwRhev63cvqUkWKRhIYDieoJZtfgm2CUwcaldNM2UPFc2l2FtWTm9Bp2qEkTK6klYrkEjgDNdoW4higQBjvqOozkcppA6OJiXvVXMtFz4oVCnfBA6LaATYE7HuInHA8XE4Xb2kKMXkdXT2Ms/hK0HBKt/Ag2u4LM+ROdRc/Llsh78oL51RMe9N/ey/CUT9iCsiJ8eQhCVOxMEisyDFVwAi0JYXoHpSPEFFHnJXvUnQq+jtGuCFYhqMJsotaowTuFoAdUYhgc5UhUkgDwXqkbZ7AhZogzn0IiVegStUKkEkAcwnpfzuNWwTM02T0Cc5UjD4sXgBwXGGeyDVeI7CSYwKEqeC40l6F0smwZXzkDohOJY2d0taf7VnlDknrOrZcrU7Qknlwx3Xldmriw2qIOVnnLitEAAd64pXiEdeYpcqOUF/m4Z9Rcv5hTGUjkhUFg0XkbHW0jzPD4fIdLEtN9l0FPOL9zNb8PoyssKEET+VT8r5nbtUi3bOla7ekaCekIxfAPvLNGSoBMpC9ZyT/eqDmkiBKGyulbOzdY7ECQwmZZrj1KgHQtFrjQjIQyVSGAtACNKz0ItKDnnRqj0QqhFpZJNNYaDaXknpbkyScFWIGoK0X1Q1MqmuuBUheIgIXwwJvjIKibaJ16D2i7YFsjpEHPksA82yF6a4/cLgppw0IdaoLS7YEXZWBUOZ0K6gByohKXvfeCUsDDCs68pK3Vlem8cJvTK9BhaHdCspEcLB3kGMlDsR0+hhy/D8BZ+NYDZi5j1H/LB5vcal7lr4c5nn7/nJv1bBvC/FAVp/fvX/PzfuxMEx5ft2cuqxoi4CcEJkIWjODaYCNbPC9ObDitgraHVLCfnfQGVGOZTZTGiHI5WZaMJ44kSN8rp+0lWWk4UCUuh0qkJWMV6aMZw6jQ0KrAYwNSV+XFghEWuLLVK7vqFq/DeS4IpFHoBnGsRugg5dR5WupjTH0Nu/wtqE4PDUexnmLOC1iLUTxhnhjAsOz+2+9CYQbsOg0L48k3l7CrYe5/poU04twy/8gIsN4SKhUGihFI2JE76yrRuqZ6M6L+e0OiBnzjMIxXk9udRG6LrD0I6QrCorSk4dLH1jDz0ZPbNrAX4JmaTnrIioqZy6TfxFglFpbMBLDBnq8j5BuEmhKeF6iaEGAxSslQVQ6GG7T24vQ3JRMgzQbzStMqSVSq2LL5nRQniRrck+A9mykwgiqC7LJx+0JYjJxmkAi/cVXIpqcPjDI4TqMVw6orFNyxFIriBx90dkN8pSF9bwDRA7vsr6AOfQB9so6Oc0VND/PEC//wRJlNGh8KdO0q4YqEbMM/BRMJwqDx0UigyuLJiuL9b5s23txVvS58+WyjeC5OstPLFAqQmzGalok8UKNX7LZVN4MDBsQIxfnIMPkPDFlTOItHaF+8FQeYtvqJ/9/gw/iWTn/zLmrwqsvl94D1694uYRhUTGthJMG1HtA7JLQELg5EnEmitCIf7YNVTiSAKIB3DJCnzUxVwCKpgCujFytZU+J07yqMnhMunBFN4opopI1hVnAjHcyUy5UzR4RxqFi7HnnwLwqogNSUfwfxzcyyvE85uElamqHp0ex/zyoDGhZCwF8COg5Gj1lS6745J9gounIuJUmV+19GoGpqxMhwr/YmyEiu7RzAvhKaBTghGy2Y276FQCKogqhxvZUggxKcEDZX81YL4ShWZF+jeC5Av0M3v0qDas86dy6xu/+Y9gP23AeDHPUAw6X/VxRcHdvlu15uuZ+lRw/HryM3bYGMEgx9nRKcMxbGiXjAVqJ4MiGPlcKTME6FSga0D6NaVjROGeKzkCF/eKa/t8dzTrsJmXZnlwu7IsxR4Nk9KWRCn7IK4vAY7faESg46V1Z6wUheOb5eCZFkI9Z7F5waJhfiMwW428L/9ZVhaxu8qTIV4w5K/keNvFmR9WPtwjaPXcrZeKKjcLDhx3nDYFxKn7B6URXnNlUlSFukbgbLRVCSwhMYzn8JyV2hVFLHC4ZHSH3nqdSEUxdkA6QTo7Qw920SWz5YM3fJDKpWaaOK/yt/+z2/cm2x46wEWEb3nCw7c4ud/QzrBn+Tomhq3wG9+L5L8HLw6hWmBdgVZMbTbEe7zCxr3CVGh5MfK+qZweEOIrOIC4dYIzraVSlcwM2GlK2RpWfhf2zA0J56KlpYQWYiB6QCi9y8zvzUjurXg0nmYz4Ruw9CpCXsHnlpPUC8ke2Abntb3VqiMCwLrkb05GjXgt44wE6EohPRqipVy2jATiO7Mye96Gl1BQ+G5F7VUoq8Y5lIWR8apEsYQ3cuQ0kK4Ola6EZytl/43iA3DVNjb97SqQppBtqfYasHidYeJHfEPXIKz70ISj1/seHRixK38sjz5+UI/87kA+IaXeXyz2g9lPpzHP4tuIm4k2n8NDVbRximkZwCLLMDMHY1aTvNsTPXKMrIomI0FO3FUolJk++wGnFqGW7dh/1CZF56H1pT7V0vO9+hYqcZCp1qS/P1RqRcZh4pPUoKzNcxHlzGXmlRXDIORcG3bY2PIpjA+9lQqntaaxX95jtn1yEjxVzP0IMf3YXGgLIae6Ujoj4Sw4okiJehA47ylXQGfl/Tp3MHhtCxKHM88uQgLXyrNrq+WOfr5ZtkYcDhXZomnP/UMRo7BoiRFOl1BTkek0zK6902BxV04egE3n1HsP2d1nmK93LueP/FNqd59cwB//ar46jO/7ObZTdNcN7o49hy9gHQfQSMHSwbpBphMkGpEfCbEXxth65bOWSG0ytqKYlSZDT2VAC4+aMm17Fg06rk9El7Yh9Apx2NYPx0wzsug5foeeAvu1QmHv3QMowwVKVfxxDAuyhlqsUK9ZrDA/OWM9Lbj6C4c3r4nX/iVlKISkEeW+TEc7cF4V/Fxncqjq0goaGQYjxV3jzLFKZPEsz30hIFQ1hSEZgNaXWFRCDUDy7HSq5cK8XmqNCtlZI1XXKIcvVKQLYB1S3Spiu8f4hYR6f5rvtLqSp7a3+Hqi1/5Zq/nbzrIEtB7+pSJ6/+Nf0Sn+9d0+UPK9V/Bn/1u5ORFxO6ge2PkcoS/ldFYjxjvO2avKZ2Tns6jNfJDh72REnYtk33HSkORk4JXYTb2vLqvNALoGtibKb2ZY1qUJL8DXrsJzViIG+CfG8NJITgT0bydsXE+YnpYcDAuJ/cqXghNaXWbp4VJWk44LIawXHFUm4bKg4ZoAuZQqd1fR3pVZv8/x9GWI5EyBYsDoWY9EwNn2ob1Ojy7W46zrHXg9a1SdV4E5kU5/B0B952wbB17ulXo1Q1Oy1agTJXOuSoS5vhFBQpHrEdK78NYG/+0vO/P56o739T1/C0KoZWkh4k6f5/ByAc6MbJYgEtg7QF8lJAeKslLKX7kyG8sqKxakoUyuutxt1LmWzmjKbQ2DNWm4fCaY7LvONr1HPWVR1ahFypf24VbM3h2rxRNmeZwnCpqYfWDLWZiWSAERpi+knE8EIYHBbME+uMyoCssHCUlbz0YePJU2b3rOZ4qo9tKPvTIsmHpuwzdi0L6xQPyL97mlTtC1C6llI6mwnBRljkjMZxuGPYPPaeq8IGLltBRKgZkyvZEOVqULuXihsGHwvFMKbwyTpVGz6AOKk2I6oLJBVOpI7NdH3aXjNOze7Z9+R/eK/B/06Kk33Sa9Lv6TX/pBeb/8S8xeOlP6HTu2L9u/TzCpwnZ2FJc90Rd8DOoLhWsnjHcecExHjimOUxnQvFMzvKGcHRYlq2OJ8owgV5VOdUSYoHUeXItFWnGDrpxqRo3fGnCynLA3ZuOuK/0F8JhAYc7ZfdFu244uRxy62aOd8JaUxlNy7ndzAu9jjAYQp541toFybYhOoDZXAjFUCg8e9uzKMDrvaqWFZJc+cpdV042eNDrjs1l4e4x1OKy8cEEpW9+/RgqI1eyerFhadkwnXligegEaM3jbhfYjQypdpTl+41ED/09kUcPv9WtLN+alOHTr5SLJOobf8MHm45my+jOTYwbERFivZKPQY+V/FBJdz1+5lk/K0RdYZpCItDPhEUuZCqMphArRFYZzUt/9dAqfORhw7s3hSpK7mGSwfYctg89RhQNDDsDYbYo+ez9hTDzgmaees9y7tEqZy8Zlk8aavd45W6t5KwlU6L7mshH3kOyL0zn4APDG7eV45kyyqDQUnJBubciHigo8+44UpY75bWMhYWDblPoNEr/XKhiBZa7hvsfrTMcKelM6awp4Qe76LkzsBmh3Z5SjYwrThya6P6/WwqDv/wt6VV+SwDLE6UEvdT/8m9pfeWXgrWK6CBzMk7BNKhXod4GYxTvlP62ctxX8qAUx241hKVmmcb0j5XIKItCqUYQUr7uYKzsDhTJlE5NefQ+4d3rZbN4rjDxwtadgnqlBB6UjZpypuGpGyWKBL+9IN5b0KuUuaoKzFKhP1UGA09vCfzWjMnnbmIaQnhSAE+W3xtS07JSlRXQTz2HaclMdSrCUlU4WQWzAF0oSxVlqVJqbZ3aMCzVhMjCLFPaMSR3pnRCx6mzSuuxNtKKcUdDNM5BD7xZuyw0H/lbUv/QXXjqW9aM/tYFwZ8uR1rs0tJ/4uedP27r++LujNWeaAp1Q3XTkx2UKUaaltRi81T5pBsD06kSAIuF0msJSwqLqVINhSQpZ213FpDeUs6chCxVzqwZDgeC88psAf0FNIFqxZCknlCUE0uW2HoWE2U8Lwv/6cjz8l3FWSHNlHoFViM4nMDBSKndHlKvCdWqsnrGUusKx7ccYsst75vVUtluawbtSqkasLks9I8cuSi9JlxaD+kfe6x6rm15zq4bru06wqisoEWiVB+tEZ2J8MMUHU1I+x6zHPr44T9iXPXfumOLk3/360q+3yo83zLApRU/bkX+7lfdze/5f9pz+/928WzfIWrJFLoGP1OijodcSQcwP1SaXWF+y1OrlCLc+b2p+04IpgKdAEZpOcN7dtWwcdKSDcta8mzi2egZJqnQbSpJCuMxbB15JChf2+mUCuudZRjuKj73zAthrobcl1ILTatMxpAAKTAXwzSFyhREHZNUOLEEG0a4ua+cOB+yGDiaNUcnhuOZ0qwKtV7pd6OacDR3HA+UpU5Z/B8uPPUKnFwTmk1PUQi2F5K+NCOKC8yZkCgtCD7wqLL2EcOx/C1Z/tjg65tav+MA3zNjVUWY3/ekH+//SLA66OavLzxzMT71LA4hasJKWNJzi4FiK1CtQhQrFOVkQZpCgFKrlgKhtVjYGgOREh97dg+FVuzLafhEue+9QppCdqTUAyEQSHJltWuQfo492yUfJBSLBfFGSDDzrFV9mfIg1CvCygmh6spm91cO4fqBZ2mpjIajSjlTlaWe91wJaJ0PuftMwdme0O+XTQEVgbkVtqbC9tjTqRpsUAZx960J89TTq0KvBkUgVM7GLL44QkIILwgMCsLTHW9Obxp3sP+aNS/912Xw+uYsk35Ttq6I4Hn6cSP1/3Jba8tP2kvrJuqhtiYEHYsUwngb3EJptErhscNjiGLD+sOW1UvQqytpohzMSp+3l5Rc88U1IbDCi3eUUVYuzkrU8OwuXH1BMakla8VMk3KSzwYQhQp1kMMZ42sJswTSXEiTMn+uRRCop90Wet2SKQtj5WxLWakJ9Uho1kvVO9uy2KDsxZrcTTAog2OlWhdO3GdpnrZ4A8mizH8XTrEhbCwJldCz3BXWlkupp+AMLDLHaAauURY/pBHAxbZHlkXDh/83svL3JvCgvFmy/m/e5rPHn/blYqfu/52r6RPmzOSj7njmgs3ANkfANbBtIRuVrVxrSxBZj49CGu+32FpB9LJnnpd9VmvLQqWidCvK/kA4msByFWqh0qzCUSbsDpQgBprCaAIaW8KWYaefUQuF+ixDI8OdDI5eyFivCV7KzSeBwPyGp1Yo7SVDojCbeu5bLScLMwXTDtjeLvAFLPqeNBUevACb74swGcz3HVniEacstWCRCeNE6VTKxgSsUFsRgrZiz4cEj/bwv3pYCrh1BFkFvX/T2fd8T4D+kf932Hr8F9/sZZVv2t6k8ol7QEX+H3m2cunf8adOpXZFyW8WinhqK9A8J/TOlZ0RkYVmC+zY4Y8KKu82uI4QRcLqZUtdlU4dwrZw4qQSBTApYJQIhcKFFZhh+I3XPa9fTVldLpdZbe8W7AxhdwCjueHmMdycCHMr7OZK6koqrtkQwhrcGAg3D5Q7u8rhtNSrXLnfMM9hpIajqTKcluFOBU+zJsQLj7uToUOHQam3hdmitPLIQqVWLvqIWxCfCKlsGqL7W2gSEYjSfH9M5bRSnNj09soD1ueXXqPo/LuqnzZ85uU3dX/hm7plqyQ/Hrdx7//7gjZb/5F576q1PXVaKRvecBAtCcvrpTrNfArJoWfxVY+/4+i+x5J6YbbnaVXLTohKXShmcOaUsDsp8+bMCdNJWQeOQ6VWEfDQNB6/cGQOtufK60MlKZRWRWne+/1OYJKWdOj5+0JSLXUkUwPLm8KJH27RuBIz6cPeywlVubeoI1Xue39E93xEdq2g3YPlBy3NbilB3Lo3nZ/kZfdktan4XCm2M6QWou0limd2CE5aKj1PtL6q9kxXffxI7iqX/qL0PjmCB0WefHO3kL4l+4M/+9mPB4899vnCvf7Qz5ubV380u5MVxTUTBE2DXY8ovpSic8d0Vk4JJIni7rXcLi8L+aAc7RjcdphAaC4bkqFj60DYPvTszYVqVLapqlNaVtiollOLgRX2Z8r2rBTsbsWlLlUzNmjh71WASgHwlXrZL+gVslxZXxOyXIgST70Nr9801Fcsa6ct/ZcTTr7LUl/xSC74KZhly/6XC4ozddLDlPlxTuek0Fo2bL3k6K3AyhWwjy1TJKUYqjm7jjqLLPnCnP944IMf/Akb/8Cn36o9wm/JetnPfe7zXhUzGjX+QmO0eSEy249YVzh/w1sfZDj1uFwotFSYCwJheACjWSmX365A0RLqD4bs/naOd45AhJpRrpw02ANllAriy1kmZ5SkEFYawmBaTkCMipKdnxWlbP9o5njPScNSS1meQW3TMBsq27c9NoBaXdjZAZd6Ntfg8LBkq2q5Q3dyltcEkzn0fWfRusP/+jb5awXqwR/ndE55VntCPoOD645qQ1g6p7AEfjRD9hbIu66gtQ4SJ4U5eyXw5uP/1ETf/xPlJvAn3pL9wW/JivcnnywT9E7nt/r20od+1NdPbdvV0NpTgfeHDq+l3P1sopgKrF8QWnXotJTBSBlOlcn1nP7zOZWqsLtbyg35HIZjz3oV/siDhk99JOQjlyOsNYzyciCt14Y4Kj/HpChlJETK1tWFGhqrllMXDfVIiZ1y4YJl/ayFUNgdlvn59pFhPBeaVaUiHvVl4GcuWdTO8f0heVuY50rcAJPmtBoeUyi184bVE4ZOq1xarTkULy3QRQCDPWDizJkPBD764edM5eSfLdOhl/XNXIb1llvw11OnkgD52RvZ85/805yt/Ios3qjGufUSFGZ+Bzr3GXShqHrqrZIK7NSFeqsMwJJJyfti4O5xOeFXrwrHE9jadaw6YbevxKFwecPQqjiywFAUEN7rqIi0bLGde+H57XKVXatSXt+5NUzHSnPDUl2G9lgZ39OtWusobgpsxhhXYCYOv+tJ8wMWd6A4LBdgsVBWHgBbC6k8HEBFMJM5rgnaA7tkYeyx6yHm0kMF9/9A4PngG+kk+uFa77v6b+X277fMB/++LszPfjyQxz5f5Dd/6FPB3Vee1tduBNlAfLalRlYsOoMgcST7Qn9biWpCs1s2w6cTGB1Anpe89DwpAV/ci4bnCSRaTig2YsOJhrJIoNIURAyDY0ezopxdg+fvGhY5XGx4xgkkRtielQGXBVZrnrV7YqKnz5Xamk4CtGIRX+Ctkhx6wovC9FUlPSoJmep31ah8sA2Z4tIKfq7Y3X3Mmsc1A6QA4y3+7OXCPvTHAm8/fsPMzPdL+xPX3iq/+20F+PeCrLf/2BP+9vM/w93tIAsbnn5q0tdzjDP4gTDbVxxKqwX1+wJk4Vnc8Bz2oRkrg6mwP1GqBtCya2OcQoEwy8sixcXlUs4hMqX/abUgGypHE2GeQFgocQWuD2A/KZvtmxXlfafKJRz1JaF9xaDGEMYW91qCdzD35ahopa7oyQpaVYLIYDfruGemEBaYsz38PMVuRPh6gXZOYfo7yPLFwpy+GPjKR14z9vIfl+pjb3w7wP22AVz2U388EPl8kb/2fd9vJm/8jJns9ubbmXPbWL8Nkio6K+nBcFmwpyLkZkr/VeX63RLgbhPu9mG5VY6R3t4pVfS8gUosDOfK+pLFGiW2njASBhOlf6ic6AnNKhz3Ic/LZoHDtBwc22jBSg/CFsznZbO9ceXExPJFYXYA+VRp9sBnEH4kRNSjC4u7k+MSCP5n3w3ZIcHBHbTu4MoP4kwHk7xRBGcfCvAnvkDSelzWfnzv2wXutxXg32vJ05uPPxLv/s4vBv27p9O9omDPBHY5gpHD5AXSDGBXKXYdg7vKPCsL7AHgvBDVYP10GXwdDco0a7lnWSTK4bQcRCsyT6smzFPBoYQorZrQiMt+MDFKs2nIJ57Cwu6BkPtyRDQIyzQqNsK5h5UiN1TeVcXWBJM7pFHgdsHtFEhdyJcjzPkmdniI6daQix/Fr3/Six8QtCLjszO/ZA43/4xc+OTo2wnutx3g3wvy8IWPnm+Hw59lfvhB/9Kxz4eBhKfrIrGDrSl63ZPtKsUUsrkySylnUA3sHYAPYWXVkGdKkgr7/XJg26FkGZzpwoMXDa9cVw7nsPDKSsPQjMuChkVptQQ1EIpysFc23iemnI6ohbDehdUlIV621K8EpZxdHTQw6LHH93NYdXCijVIgYYic+W7oXCqCgIB4jcKv/p+DX47/ujzxhHurA6q3BcBwb7HWE087vfOfVb39jf/MzG//L/nabYq+c/ZS17I3gu0FDKEYgz9VJdua4yaloMtwKMwVqk1hduyJwlIpfZaWYiq1AKYTpVuFmYNMyh0Lei8vzHLFiHDyJCwvwaKvWCsc95XBTGi1SvEX1VLmsLcmRHgkhvBj7fI77M0xpwP0xCr+/MfAzYDYKxnRyrrBvGunKM785bD1A79YdmYoIqLf7r/1dwTg0idjRMp8udj93j8lo/2fMlt3N/zRzFNv4rdyI5M5MnW4czWcK3Cv5eS54MZl83kcCNuvK5NpOUqaJdBoQKcFToV5DrOhIraUSVrk5QiNCGW1aKLEEWxcEWwE4y0YjMrtZkFcslztTYMVJe8rpmuIPtZGxwlmuYf2OnDiDD6IVaK2C4qbAbULYN/zc/j7/rfS/aM3v05ivFV57tsW4HsgC09j5Anc7OrHNyvh/G+Yw70/w61DikrVeSfir4+NOyrQbkCAlpqWB2VJTvvKfEcYHJWF/cpS2QaLCpqXI6tSKZXykmm5kSeKQApFUkUu1vAi2FszwoqwSO7J+fbK+rWtgWmUgZWJhHBd8LHBX3gYOXUfOrymkh94e+qSZeUyFMvXXHD5fxfEf/qp8vt9e/3t2w7g3wX6cSv31rbl17/3hyRL/vd2fPABkrss7i5c8rIRScTEK4Jtgr/jYVshVCSHbCGYEGoXIJ8LHmF4E6aHnvXzkCzARpBnwvxYEVHiAFoPVlELQZagAslUEWuIQgjXBF0NkJYFn6KRwY3BVENkY0klHfsgspYrH4bOR+dEJ/4LZks/KZ0fGqiqgc/w7fa3b1uA/6U1l+uX/DP/5V8IH/5j4z9lF/t/3Y6vXeHlXabXnQ/aorYVGHfNi5l7bFXRAtwxUIPwoiHdgfRQSwFRD6FVirwUZDOhkEyE5orS7NxT/mkI9mPLyHBGeDgnG8HiyFB71CCbES6MsC1D8tpESXNfOQ1Bq2LZfDe+8b6hWX7330+nzb9TWf6fvvp2sdq3JcD/3QAM4JlnPl17ZPOVPyfHW3/J7O+9m8kRTKbkc7zfQY1BbCTGaYi51EJnU1wC+Y0UGZSFCKFsMhCvVE8ItieYipIegsSCRB5HWcMlFVwjhrpiOgU+jFR6Lc/omCDJrZw/AZ3z+PCRPToP/L9M68J/JfJHb34d2O+kr/3XBmBKkkrQx83Xr+3PfvbTwUdPPfN9Jh/+WZ0uvsfqZJXBARynuIXiE3VSFfUzZ3zNCibEvz6XoA7kSjIo9bjiNti6ojFgDNpUWKpjGs1yelwydelC3XRBuFYnCLFUKlA/ha9fmtE8+wUNln/O2vf/krS++/B3gX1Z3w7X8b82AP/+a/t3gS5/9jNdjn/zMT+5/ceYTj5uSC6iM5iOQT0Mx7jjjGKAL3J80Co1QhiC5EA3RkMtI6dViy63BGIbhE2YjqBag5XTUOni0sqh1Da/qvUH/rFtPvrLIu+59buf4ynLZ17WN7tA/28UwL/Pop8qt55+/fou/8gvRRz/1CNucfgRa/QDPllc0mRyn85mjcDOBb8AEjAWfFxWJppxqW9MXC4yWnicX0ba56dYs0N98ypx61Uj7c9hTnxVmj+8/3tTO3hK4HH/nchp/9AC/AdZNU//frAB9NOfNrP/IFwLdbIcDW/fT2hPurSooiaSSquKy2MWEyWqpVpZWVjykZv7gV156DVqH7u7s/PG6OTJPzH//e+J4TOfNoB/u17Df6gA/u/n0Y+br6+TkG9iQ/YfFOSx8oCUmmD/+ljqH0qA/2DrVuAzUm6J+T1r4D73CfjEKyVYnzsQPvGJez//HHziE75U0xXeblHwO+ed885557xz3jnvnHfOO+ed885557xz3jnvnHfOO+ed82/G+f8DcFZw3gpp1OsAAAAASUVORK5CYII=',
  'data:image/png;base64,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',
  'data:image/png;base64,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',
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAAB4CAYAAAA5ZDbSAABXNUlEQVR42u39d9BlaXbWif5es93x53w2fWV5107dEi3EUN2ABBKBcJOFBzEIJAHDxcWFYDSTlVyIuMydQUBgYjRcBIEbKhkEAgmEYLpLSO1tdfmqrDRffv54s+1r7h/7VEkw995pU91dgnojKiKz4svMc/baa73LPM+z4J3zznnnvHPeOe+cd847553zznnnfGVH/Of2hbz3Ap4S13lMbH30eQHwoQ895q9fv87zVx71cA24ylPAdV4QWx99VACcnr7gn7/yqH+Kp7wQwr/zarxNztWrV6X3Tyvvn1ZX/VX51rwkiKefvqKe9lfU1atvzd/5jgd/hUb90IeQH/rQNSsE/5G3Hcw/t9VsTwYvvv7a/TqRF02R9tJi1S9MuVGUWauyhTKV87Yq01DJiY6iofdyXObVnUfvvfzq1rmHxmfF95z+x/8ekg89Ifnoh9y1a9fcOwb+uoXe6xKe90L8wkN+Ze8j50vufnCen7x7VY3fP8sW3+qF21SBE7kxLPIZVWWYL5fMVzkCUEoihKMdRyRBiBSSsnBUOR4XjKTSn2nE0Wc3+5tfSKLNj/+G9/3w/i829mOPXRFXrlx3/+nL9Y6BvwbDCvGkfeP/3Tz8+D2T8uXvHs/3v3eaTT+Yy0VvvDphtVyQ5QVZVeGc80LgvMeHQhKjRVEJJqsVxldY5/ASj3MolAiUFEmsZbsZYx0slyWhapDI1qSRJD+30ev91OMX3/3TH3z4j91843M8/fQV9XY39NvWwFf9VfkUj4k3DPvKK690ZOfGr0/L4988XN757mF+p3U8PqHMDQJre+1NznQ6DJcncrJcisp6lJbgDGEYsZqnZHnFySQlqwxVVWG8Jc8NztfePFvmNBqhHzRjt0grVmlJoLVqNBs04iadsLPa6nX/zU6v/xO/4lvf9S8v9f7wBOBpf0U9/9Sj/u0YvsXb3WNHoy9dGFcv/97Rav/35UwfOF3ss390SDNs2e1OD1tlcqfTFJfOnOdgfJej+QnWefCCwsDJaMJoseRklmErR56VtBsNzvabCAzzqmSZZ1wYdAh1wEs3h3QTTRSEHAxTZkvjc+8dQiC8UI0opt/usNlpvH5hp/N37zu/+Xd+zfv+l/03PPrJJ687ePt4tHh7Gfdp9YZhJ9lLl48Wn/pDs2z0/fPqZPPO0R0Wi4WtKkuitdzqN8XpZEysPVvdHjdPThktFjSiCO89sZJY6zie5ByczFmmBd4DQhAo6DRC2s2Q0hnmWY6UsNtpcO/ZAZcGG2RpyvF0SVHC51+dMJzl2ArvXW1sJ1DnL/Q4u9U8unBx60e/7ZH7/va3nf/LewBXnr6irj953b5j4P+kdhXimvND37lhfvKPH86f+xNzebd35/CQqpB2s7UhIokUomBRpOyd3EJKjXQBt45HHE5Sisqw2Q1oxyGmdEgPwkus9YzHKb1WTGksma2IQ4WVjlCDEAohAOeQCO7d2uaxy7scDE9xznE8zHh1b0kSKtLcEkhNr9tyr+9P/SjN1eX7e9y7PTi5uL35l37ge/78Xxfi8fLtcj+Lt5PX3tz/6d88LF7/iwt595FX777EfJHae7bvl2cHAzFbDFlmc5yveP3ohOPRhM1OE4tlbzjlYJShpWR3q4HCIJwkFiG9JGS5WGGcoxUoOg1Nah0eT1F5DiZzJsuSdOXxDhQgpKcTB2x1EsIo4PR4xSK39DsJg37M3aMl270G53d7HI8L/7kXj63SUl+6MGBnq/PJy5cu/Hc/+F3/8N+/Hbz5m2rgj3zkqv7wh6+Z5cnJmTv5v/tL4+rW77k5vsHtoxMbSCXv3e2LzW6L1+7c4eB0iPeCtMhJiwopFEqCMZZWo8U9Zzc4O+iTV3PmqwnOwHxZUmSWThRwcadLUVZYV9JrRxyPcpAVxlpe25sgCHj9zozJoiTPHUIKpBQEWlJZW/9eCDY6IVGsqSpHnla0wgAhAk7Hla+8d1FDqe2Nlnvg/t2/9sEHH7324ff91enVq0/oa9eeMf/FGPjq1avyqaeueSHw0+mXvuv12af+xoy9+1+6fcNNpjn3nTknL+82OJoc8OkXbzBf5PRaDYq8oDCOPDdsdhIubg6498wZtgYtkrhPVXmOJs8znE1oxCECy3xZkGcVw/Gc0jocnmYjot1oUZiMqjLkhaUTaMajJQjJCzfm7J/mCCnZ3goZdAOU1nzxpQmrzNBIAgIh6TQ0ZWXJVg5XCaJEE7dChzCiP2iIi7tbz733wXt/6MkP//2fq6uC+jv/Z23gp59+Wj355JMWJLeO/vUP35p98dpRcUdOppndbvbVYxcvkVcLPvvaZ9k7PWXQbbHVbhNISUjAVq/PcDZHSc1oMkZIgxAll3a2WKQrsnLByWTJKlsxaMfsdLfY6G6wXC0ojeW5vbu8eHgCUlKWkGee1cLSCzTf9f7zmLLk5z97wks3l4jQcelCwrkzMe95pMvBqeWLL05phhqbC17bm9NsSMrCkxceHMRxQNzQ4L1BoC9f3Cm+5T33/Nk/8Ov+6V954+X+RpZT4ptx33o/6X3h9k/8rb30hd9+Mj32O8mO3+j0pBQlR9ND7k6O6TYiLm72UVIRhQHz1YzbR0MOTiZU3lFWJVoJurFks9eg31I0whilYpytKKsMgWare55QKoS3KK344o0XefHkmKy0LHLPYlbiDEgjaSsY9AMaYcy5rQ0++8IBh7MJO1sJ919oYbHEQcBoWHHvhS6f+OIRr9xYEscBk5EhTw3ddki3E3MyzNGBcP1+JM9f6LKztfl3fvj3/bUfEuLx8htpZPGNu28/oj/84Q8bn00uf2H8z59+4fSzH7CVMbvtLTWdT8WL+68yaCV0Ww2kEPSbCc44VKCYLIa8tnfAy3dOsF4gAkWnFXC236Ifa3pxRJFnKOW5sLPJRqtPUZYs8pSiLDG+IAkCtEoAh1YRk8Wcz75+m5NphTCak5OU9zy4STOBRW6QSC7s9ikyR7+tiCPLRz+9x0ZXo6OIyTij29a0Ggk4y6c+l5KvHMfHKdbAffc1ubm3oNOJ/IMP9Z0RqFbc/Zkf/G+/98p94s/OvlFGFt9I4x4fv/ze/fKTP/Glo09f0FKZbiPRr+zd4u7ogEtbA1pJyOsHR5zb6NJtxOSVxYmc28enZGVVe5v3nNnscH6jQyRhpxeDqzgZ14lSI4o4Ol0gRJMoCrA244OPfTt5PuR4eoe0StkdnKUdRcxWY14/WPHK7RM2eg06DY3BECcJ01XB4cmMjXYDrCcUDhFIposMJSxRHBBrgfeOV28smYxheGpoNRSzmeXC2QAp4YUbK7a3E+57oGvuHmR6a7Pzifecv+83/uHf++Mn3l+Vv7iv/kvSwN57JYSwo9Gr3/767KP/7GO3Prrb6w5sP06U94aqKoiUJA4t/8fnn0MFkofPbpAWKYvKcHcyYZou2Wl1efzCORKtGCQtlAzxfslzr91kno5BSrJcMJpkBFpiXc4iK+kmXb7jkffy8KVdpvmYO4ev04ib3HP2Mr3WgPnsmGF6isSTxH1KLAfDE559bcjzN0YUuSEQcO+5NpfPNnnulSlH0xWBFuSFxRqJVprRfgnOIyUI52m3FDubASdjz/FpyT2XG3Taodk/TvU9F/qfuXzf1vf+8O/5D4dXrlxR169//coo8Y1IqG7ffvb9R+XHf+rT+z+73W9u2t1eQ6VlTqRCYg3Hw0Pm2YKX7x6zOUgItOPuyYLSGLb6Lba6XZIwoBlGxErQbzVwxnAyOeHffvIlxouCMJBY77i43aTbSLhzOuXCZgthPPunJ+z04D333s+gv8X+aIJSCYejJXsnpxjv2RzEvOeBc+ydzJguF7SjHpFqMBrNmK4WhKEgFIJOq0FuLMZabtyeMplZ8sIzGuUoBGXh8cYRSsHWpmYx9UyXnjS3PPpImzQzxnihH3lw97Pf8tjD3/v9v+l/O7h6FXntGu6XlIG991II4YYHzz16u/zkT3/27s+dP9M5Zx++uKuev/Us49mUc5tb/PxzL3D3dEgzDOj1EtpxSCSbrIolUoOtHHeHY7yu2B5EKCHxpUdgGc2nVFbhKkmkFVoJbOVoBTHzLON9D3SZzys+8+qIs1shl7Z7jBc5aWXIS0tRQGnAmIpOR1EZQ5YZgijkoXNdhI3otCIWsxVBqCmtBWdZLuFjnx7yyMNNGi3Fcmk5Ps15/XaOdJ5QS3pNyXJRkYSapBFyOqwoS8f5e0Jev52bdjfU73744qf+m9/x3b/2fZevTb9ed7L6+hj3qhTyw26xeHbnpdnP/auXhp+5f6uzbe87P1DP3XqeV4/2aSURH3/2RV66e0IShpztt7m026ObdHjw7IPcPrrNC3cOefH1E7Iqp5kIPA7tHTuDGCfhdFLgPDRihdCSNLOkJbSSmMIU3DhZ8dytMWiBDzw3T+csrcMKzSp1IBRHpynzheXCZocytTxwZpuT4xVhqJCq4uc+e5fxquDoJCXPHDdvLwhCTZrCs89NKQvH3b2czY0Y6STf+R3bzGYVZeXwxjGaVnjn2d2J2d2NaDQ9/UEos9SYRZpfuPHa0WN/63/6H/7pK6/8af/MM2+9LdRbb1wEfEg89cRH1Wf8P/unR/lr3x7LwHaaUj1781VevLtHU4e0ojav7R3Q6yRsNGMCWfeCTyZjPv7cF7k5GlFWhk4zYKcX4UzdW95uN7mzv+KFl4ccnRaMpxVKQjsJaEcJnUbC8WhBECoCDZ1WhMOTlYZmO0BrRbsRkOcOayHLK7ISXn19yuFRzmRi+NUfOMMXXjnlbD/h8fu7WO+5dVjx2o0Ft27lvPzynLPbCc7BzZspRek4Os7w1nNyknF6UjAeV4QRCCmwBu4elswXFXnmaLYVZ881pRDSZGXxyOsHL3f/0n9/919fvfqEfuaZ2+5tHaLfqHU/8erf+6tzbv6x2XJsKpfqk8mIg5MFG92IZhiTFwW3Tw8pygpTONpJiBYwnuXsH6/QIXjliSPJuU1NmUMr1NzZn2GEp9uUOOfoNGL6rQZRJHj08iZ5adk7nRKFmpPRkuNxxnBcsLEVoyT0eg1u3J5ivUBWgiz3KCWZTivK1BBKxeXdmGmW88ClDvdfaPDplyZ85kspArCFpSo8rvJIL7BWIvF0OgFaw+FxRiAVSkESC3Qo6XQUSkuOTwzSO6QS3Hs5QQeag7uFPXOhrS6evfCH//L//Zm/tR452relB79h3Odu/pvfuQru/o/H0wN7PBvr8XJGHAQ0E8VsseD26JTZakael1TWM1/m5Llhtii5s7+g20iQTtGMNZv9kMWq4NsfukBZlYRNwXJhKErD7qDBr/6We3jPQ+cIIs8sz7k7GTNc5hycrIi04vA4Z7myNBMNThApQVFKRpP6ThRC44xHIFhmhnYnYv+4QCjFKrd86tkJq9SD0rRaIXlZ0RtEbGw2KEsLTlBkljyzRIFEC4lxDgFkBXQ7IZ1uA60sUni0loRacnyUEyrP4WEmRtPU69D/mie/7wM/80e/71/evXIF9cILb01LU7zVSdXe3vMP7LuPf/K10y/0jocjlNbivRcu8/zeF3jx+ACTO7RQLNOMqjRkhcF7gZYQKImrPM1A0o4lQeDJjSVMJJNVSmYMWoCwGu0877q8waXdLsuiIHUFy6JkuEzJMsfRSc5WO2Y2qZBSsruZsH+akhaGsvCM5wbvQAiJKR1aK4rSYIxHKYUUniq3KBngKoOONK1WwHyR4YBuM+T4IEdYQZU5lIBmS4L3LJYOZwW9QUSVGx57pMtknqOV5+iooN0IKHNHEjlKB4fHlWv1lXzk/rOvvv+Rd31wfvf69KmneEv61m+ZBz/21GPy6aee5vb05//BafnSu24eHLhFOpff9fiv4GQ45FM3v0CsA37VYw/hSseLN49JM0NVOIJA0e5ostLSbSt6bcEyKzke5XQ7CUhP5R3NKKTbDFFKcW7Qot8OcUpzOl2yKnO89GSl4/AgZzqqcLbuDyuhuXWwIisdQgtQnmYSUlUOLDjncQZM5VCBJIo0g26MFJ5QKUanJUoIZrOcQCuWK8NiVhJoRba0JLEiCAXLlUFICCPJcuUpcktZecajnKywrOYWDByfFgRSsL0Zs7UZYrwUaWZNkVdbTriNv/IXDn/ihceuqBeuv+DfFh78RmjeP/ncHzjxn/7bz772Wbs3OlVhYNmKYm6c7JPEEbu9FlJ4fv65O4znOd0opqoKLGCcYVWUJIlEWMeFnSaRAu8ClJY8fG6DSbri7nDMdGm4/0yXVigpK8fpYk6joYmTkHmWEqiAIpfcuj3GeliljihQNFsS5z15ZdFKUCw9EoVCkq4c41nOqrIIIdjsJ8ymBdnCkKfQSDStjiKIBHle5w1F7plPDOfPNymyOlI0O4LFomI5g9XcEWhJu6kpiooiczjrMMajtaDbDdjcDCiMoMi9X+XGXrrU0w89/uCv/St/8mf+7ZUrqOvX+ZruY/3WoDFwC7/Y2T/6mb9w5+QldzAeCidKBs0m4+UCkGgkd05n3D4eMU1LBt0Y5QU61KS5YT4vERIirbj3Ypd+S9JPOpwsC44mc17cP+R0nhNqz/agSScJSALwlPQ7Ef12k0YUkgQRd05GaCVpdhRSSO45F1NYg9IeDRQ5WCtYCMNiWnD+zIDnXxrTaoRsNRWns4LFMiMtHFoJkhAmJwXeBkjl6G+EiFByuippNAOOTzM8nlZT0VcagSAIHEkiyVNLVQiMlTg8ZemxFryHNIPDQ0tRWpwXIm5IeTyc07i19yP/89N/4gPz53+kWDuh/6aF6Meeekw9Lh533/9Hnvifj8sXPvSpF5+1uS3Uey6cJy1L9qcTLBXD6Yrj8QKlJM46BI6sMlgsxhnObSRc3GnSCjTNRGMrwaWdTW6Ox+yNZqS2pNUMaCcRzkg+8OA5ttoNLuzcQzvR7PRaSBVSFDlZ4bESwljQbigeON8nCgLywlFZR6RDyswxm2bkpef4ZEWQKIaTgmxlWC4NUgkakWI+N+AFae5wzpPmhiKD44OSsqiffqAV3rPOxD1hqCgLV8+JvUdpQRBIFvMKj0BJ8A6sgyx1OOspCofziEALKwO3Y4vh+Ef+/NHHrjz9tYVq8TUnVgh/OP7ko3uzz37m46//XDiazMWvfNcj4u7JMZ+68TJB4Jgv6zus2wzYP5qzKiqSQCOEJ0kEoZacGwRsNltIpXnuxjGddoQKBFZbus0IjCIJY6S0xEHIw7td+o0Nmskm88UEFSYgKl65eRuhNC8cvorB0m9GKAGzNGeVOkwhqQp48dURSgnObUQcjXIy48lTyFPPpd0mpS2YzQ1pKgkCmMwNUniEgPnY4QwkiabMLbZ0NJsBeW4wlUMKQRTLGhlSl/cY6zAlZEtHq6mII0FVeaIooCgd1tZgzEZLuSgW4vJ9g7tP/LJve9ef/YHrc64i+CpbmV+TBz/1FOKaeMY/+YPf8ZdHxc1veWXvtvuW+x6Uo+mUT77yPKGWzOYleV7QigRFXjBeZOSFJdSSKBBsNhXnNhMacUi/12DveIZUis1Bg1YrYbzMALg42OTRcw8QaI1UjvmiZLs3YL4acjSbMJ5N63FjW1IUKVmVYyrDRi/kZJpxNE3JckcnbnDPZpdzvRaDbki3Kbh8vs3+MKPdDTi/E/PA+QDvK7wXRJEiLSqiRKIDT68XkjQCEIJ0WWKrGqKbpxZnwNnaO9PUUlUeazxlUZdh0kO7IQFBkgiKytJpK5oNSbqySCAKpKhK74yxPeez6Zc+efpzV7aRX23ZJL56761HXZ968emHptz4zJ3hq82bB4d84IGHxbOvP894PifPC0zlWWUruk3Nqig5GedopdnuxkSR59FLLcrKkSEYLwree995YqUpjWFVlRzNV5wddNntdpE25NzGFg6BdBYpMm7c3aPTbmJ9yWy25OW9E3pdTRAGfO6lY5amQAWKC1td+o2I+bxieJrTTpr4ynD7ZMrlsw3yyrIqSqrSky4NUaS5dSunrDx159tjDchAkq4M3khCD4uZocwdWtQeaW09UfK+vji99TgL1ji8hUE3oNVSiECA8ExnJY1Y4a1iubB0OhrnvCutE488trX3y97z0Puu/al/O8EDX0XZ9FUnWdd5TAD4sPwhrUxrkS5skkiVllO0NGx3m6ShJssKVgtH4EAZeOjCgNm85P6zTRAVYQDdZouTWcpjF3a5tLlLUVRYIem6ku1en93uFr3GBvN0wul8iPCaJFKMpifkXuBXSxCWvcmQ4SLl9mHFux7Y4V2X7uWVg0POn2sy6Abc3l8wmhYY4Xn+1jHNIEAozc9+fki7HdT1aWZZrCAOHAKNKS0yhLihyCvPYlFRlB5hLa2Wpis0i7nFVZ5QCIrCrT3Hr3MNiRRQWfAWTscVeWGJYkkYSaRUpLnHO0vSUJSVQyqk87jRJL24Nzr57cDfvHL9irrOV97hUl+t9z4u/qh75gs/fVk3Tv/Gyex2fDA6EtaVYjafEmpoJRF3jsYMZwtaSUCvFYDUGGOZZxVQcc/5BmVp2Ow1iJshsU5oxxs460miGC0DBs0NznZ2Gc2HfO7WK4yXY+bVgjvjEyosgRJoLSl9xXC2pNnQtJMGl7Z7fPDh8zx4dot7z5yhWBWUuaW0nsNhTpFbLBAowaAbY0yd3SopmU0r5rOK7UFCEir2D1McnrgpyEsLvm5PZiuHdZ4wEMwXBi0Fna5CKkFROXACJQVSgKlAImg1FYuFJc09ztfl0sYgqD3eO5JYUJQerYX33iGFOPPd/80H/96P/YGfMF9NxNVfi/fq8O5vq9RwcDQ6tSCUtYaNdpvD0zG3l0P2hzOkVjS15vbJksLUdaEQgn47hsqz020S6oDX7qx4/4OX2Gq3uHM6ZbqYEUYdWk3H5+98lpsH+xzPDY2mJiwFxjkWpqCjoR0EeGcQWhEKwaXtNnmZ8erhIRbNqiyItGJ7o0nS0BwfV1y81GG1zKmMp98NOLfd5ubegr27c7xTxEnE7YMVWjqElkxnFhlAq61YGE+ZecrU0evGrBYlUtaJ1DJ1eCFACIT0OO/w1qM0VKVgPq+bIUJ4vPekK0MSSHY2Q8bjCuktWkqyzEqthV+usvedvHr7VwH/+qupi/VX4b7iSSHcRz7ykdjoz/22g5M9byojnIcLgy20h7snY7wHJetMOYggESHpdMW95zsUmaXbDIlDQRRr4ijkAw9s0G9JXtl/mbRYggoIohYv3XmJWVYwXTqSMEK6illq8EpQrQyPPfAYq/mUUXFMIw5YzQvG4wVxEjBLc5x1PHt7zMkyBy8IgG43Yu9uymY35vbBmBf3KpQSFLnl4vk2caC5e7ii2Q+JI4FalqyyesifKEW7JVmWnqSr0UogpSeOJa2mIk0LpJSE0rHRCRiPHPOlQyhHoKHydRImhUAriTOO0+MSV4Gpaq+OY8B5ity5srBqsUp/G/CvH330G3AHP811+STY9vnjJ07K6XuG0zlKK5nIkAfP3MNPf+oT9DoJ+4cLnPHEUqBcSCQN957vcHYzJFCKSFiCICbQIZNFhvcVx7MTtOzyvsvfxcdf/PdMxZDZqmCRGTLj2WoGtMMWF1tdlvmIx87eR1N5Pnl8m8NpznKeo71E9hPStKLX9wS67nNPxyVOCKrS4cqM+czxysGEdjfAeI8OoNvQzPKKo2mOlYKqcpiVIwxkXccuPauZRSHweOImrFYlQUtiCtChoKkk3oAMJYK6JMpyj3WSyjqCUFCWHikErGlqUsBwWBJFkqLwlAUoDab0cjLMiGP9637fn/7W3WvXPn30lTY+vmIDX+F5D5AyeTLzC9GMYgteSSwf/dKzHC2m9JoRSsNj92zSTSKSRHM6WyBDR5rnnN9oc//O4yRhgzvHX0JrT1aVeO+wzLlx+HkG/YQ74wnD1QrnBV47jhdzfKtFv9mk3+9z+/Q2n71xg5NpjkLTDOqe8P7RkiQJGC5KjkcZ1lriACZLy3JpUQEEDQGlIoo0993T4ehowdmdgNf2SqwEhMcVntXC0YoVrQg24oCycjgPUTeiKgyNhqQsPam1LFNHIAXdOCDAc3RaYa3FOoeUAqXXTR4BYVSnP1XhUFrgDZSVRwrIc4fWoDSiUMItl8XOeDr+XuBHr1xBfiVhWn+FjQ0hhHAf+9i/GSyrL37XaDJh0GqK/dMhmVnx8v4BuxsNOpGg2gi5dLbDVqfF5165Q2EN6bKgNCUPnT1HpxUxnJ/gtCLPM1phE49jmmYMZ6+iwpjn9oZsDGL6vYQoFSgn6LcU82zMc7dHjNKMo9OC2crQiuHihQ63bs8II8HC5OSFxVtPoCG0hl5LIYREKUmzqVkuDNsbMW3tqHoBaWpQAgpbQ4W8gTP9iOWsZL6suLQZczRzLCtHkkC6MHgpEM4RKYHwniiUTOYGk1uiUGMqR1WBFA6tFM6BlAJrHFXl8E4QBAKlwDuPUDVFxhqHlKCk9KtFRbrIfwvwo9efxn0lqdZXKDByXQK0dk6/PavG56uq8PN0KdNyiakqRACNhkJoT6MVYoXk+Tv7ZKYgjiCQ8O7LZ9nutsmzFIVDeM80NVirKCuF9xHjqWXveM7lnR79ZoPj8YpVYdjoNclzQ2k9jThBmoBzvQ7vuXSGflRPf/JScDqvULGmO4iIG5o0FSxWoARs9TXdpmYxLylLx3xecjjOMKVhNXMc3y0ZHpfkqaWZKMqyZLkqKSzsnVZcutig19WUxqMVeOtQSrLRDei2A8rcIvBYL5guDKvMkiQKY1iTzevwXFX10EHImuaKqI3r8YShQEcSJzzUOgSUlfng7/zD77uEwF+9+uXb7atSkEnd+Dsn+QndVttVZcZGu8nByYQ0LUiLAiM9zlsCrbA4BhshnXbIw/dvoZXntTvHNOJNWo1NZqsVlavIXMHt4ZgXbx+Tl5ZBI+TSICRREmEV/UaToqwnPUJIwgCytGKW5jxyscvlc10Oh0u2dkO2t2KCSJFWBhVqbuxnPHRmm0udAaPTismwoFwJTAH5qqRYeoqlYz4xPHq5SYRAWk9VlZRYopZAhZ7tSxEihjAC5z1F6fGmbj+uVgZTWLyV6DAA6vs/jOvGs3Ce2l41rkkKgVw3pb0TKKXweITwOBxRJAlDidCIRitwUvlu4fJfDfDRjz7xdTCwACGftE8//XRY+uqXr9IVwkvhcWRFweFwgZaKQChWs4Ktdp9uEtJMAhAOrzyFKZmuUobpihf3vsQr+69QWk+31aLTjGk06ppwaxCipGA8S1mtSjCes70m48kKrTVpVjKZpmxvxlg8z3zxFpNZQafTQIf1hKoZRZgSwlixuRXhKcmLnEBoROVphRB6MLlnOCmZzgzL1HJ8sqSbKAatmFgGhIGi0VBYIIw0J1PL/nGOKR1JookCyeYgJtABi3kNxxHeEScapWtucmU8YaLrCb4XSCXqbpetu2MIgRAeAWitEF5QGUsQSnQgENK7ylTe2vxdANt/ZNu/5Qa+6q5KPHzbtz14Li/NY2VlmaxmwgrHcDEjiQMCJL5y3Ls54MGdDYbjEXleIawkQLPZ6rI5aOBw3J1NuDuasbuxxc3DBZ+5uUeroekkIZEWnOkmhET4ytJQguFkQWEq0qogL3KSRsjFnT4XNts8cs8291/skRYlq8IQBJJsVZKEIZNpjZn+/K05t0c5xdIgvcTklnODiEhL4lizKBxnLzRJK0F3oDh/NuLxB3vEStNthpzZaZNnjsWsYmOQsLsboaTEVLXSy2xSYBF4JVkVdfitKlt7paybGGEoCCOJEHXWLlVtAQdY54lihRAeZK0EZG39d+SZkVluhIdfJoRkzTcWb6mBn1o3N5bxrXfNq1HDe+eVtKIsKw5PZqwWObay+MrSa4Tc2j9kbzjnZLgiyyxnex3O9/so4dHSEAnB/btbTGcZubG8eHNCXhl2ui0ubA3YHrTZ6YdUhaURKHzpuLy1QTfSRA3FKksZzsd4WSJ0zo3DA4wSjJcld08X3DxcUDpYpoJFWuIQZCVUXjKZedJMcTIpGS0MubXISBIncP/9LYJQcThMeemVCfmqosgMsXDkeUkcC/LMEIWW3R1J3ITpPKM5EPQ2JTqwJI2A6cRSlQLhJUoLur2AIBY0WoLOQBM1BI22ZLClCcK6LAq0J4rqsknrtZc7QZFbkS4NlbGP/uCf+zUXAK5+mQb+srPoj7IlACLZeJdxOa0ksd1GpG8cTMhWJYGShFoRBhJPxelsybIsCCMNUhBqxTRd8frdMec322x3GniRczQc8csfvMBmErPRaFOYgqXzvH5UcPdgyv0XthF4kkiShB6nFIsChvMUJyEMFbNRhhSSUEKsNPOswnnAwrkzA9KsQgmQKFqxYrDlODrOGRcetGSZVWgt2T8qkM7jrUDhWS4cNrekgWCuK9qdEFM5FlOLFILNTcf9D2n6nS6r1LK3nxJoxXwi1lHEoYSnsUaAdruKLLNvDiOaHYlznkFD46xjNXckST1L9t4ThhLrQQopjHGuLMuul7PHgb0Xnr4iePL6W2ngDzmARXHyyCpfEAgtuo0OVe65uN3h4HhBWdaQFOsMBotuSC5st4i0RirJyXhCHAasUoNtGCaLjM1OgyKfs9sPkEimq5LJYkmoQpqtCCUNg5bES89smXI8z1imBa1mk5tHM1otBcYRKoGzhkB4lBMUhWdVWAqzIGoECAHtZsR0sqRJhzO9NsfZKVEUkZ86NroJ+cpyfLKi0wiQvgbSyVCihKDXDYhDODMIaTZiDg4X3HNhm2434YUXJ3Q7mjhWWFvjsDa2FSaTOAM68JjKUxWOOJB1Ha7rsJ3nUBYOLT1SCeYLSxRKtJS0WzX+S0pBFAVea8FqMdv+unSyrgnhBIo8X963XM7Y7W2JxSJH4NBSkhclgdYUlaNyDnAYU5E0QgZRQmUDxosl/a4mXznCICAvp5TWUBWSWZWzf3IXQsm5jTYXNprM44J2M8B6x2ySMl1WnExW6KBGUmkR0m+3eOXGmECvh+t44liDDEFJrIRGs27mV9aQWcN9GwktQhZ3x5zZUJzb6DGaVBSiRCpJWVlwDmsgCgS9jkLgmMw9eZHTboV0eyFaCQ73p0wnGa/eKGg1FXnu8F4RxpJIC7xzNBLJdGwoMsts6RhsKHRQG7bVVqyWNZRHa0EUSqQSWO/wthaFwQukA185xieL9wN/j+vX3zoDe48QAn/y4lH7S8WPbedlSZqvxGQ+ZZGljEeruusmHIui5GSy4PxWk0WZMx7PEZ2S/cMjOm0Ai5eW0SxluijZ3uiRhIK921PKCvAG4eHOyYyNbkwYee4czElCSaepuH3kWCwMk2nJ0iniMEeiSBoaLTzb/S6zRcpj9zSpLNwYrtCBwBnLcl7RbyTcmhyxGubsbnVwlWNzU+OkpMJysR1zepQhhSdRijLN8VJRVA4dKCrvuXuY4rzg5t6C2bwgiiXbGyGTUUm7FbA5aFCUlluvpWSrikuXIuJYki4MtnRkaZ2YKSVptSVaO4pMkiSSqqgHEmGgsNZhHQQOqtIxm5Zo5e4D+HL70l9mkuUFwLz/4uVFMTuXZgWHo1OsdKzynNxUeOHIbUkhHO1mwr1bPUIhibXk5sGEKPKc22zgK0Ez0RwOF+wflYSB52A0ZZEZGqGi34ipDKhAogLNsiiIY0lhS/ZPZrQbCcs5ZKWiyBz7JxlJUxGGAiElqyxnsyfY7Vdc6Je860ICRQUl3LPbR1uHcpJ2t83JaYq1sEormrFjsJ3QaAv6OxGd7RgigWoECAWdToTwDlNZpJQIAXlqEVZhraTd0gSBJgwUp8c5z31hzvC4pKpgPrcMTw1RI6DVDWg2JM2GIlIKV8B0aCnzunEipcc7j5ICT923LkqHCqQoS4+z8v7f/ae+s7lmI4q3KERfFwBhFG6UvoyKsvRShqIqKvKqREewKi1BoKiMZTI39C93wAwJgwhMwaAVYTPLxc1znC5O2dgwtHtd7g6XHI4zHJ5eJyaOJKfzlE0V8tqtIUEiue9Mk5dfXzDLPJG2WDw6lESBZJFVjOcVYQphotjYTGjGhvEsZbr0jEaWiIhmL6ZMS0bjgkYzJIks8ZZiNE3J8oDCweHMYK2n2QqQ0hNGAhkErDLDYpSjhafKHdYJytKyXBjO7jZZLCompzXk5vgkp1w5MPWA/+xuwM6uBm/Qus6cy8xhSsdo7AglWAvOOxQ15ktJKAtLqCRaskaJeGGMx4X+TL816wOrNVbLv3XDhqpoeCxeODdbZcrYgihS5IVDiDrrc9ZxcDplNB8wnZcslnWSsH+44NJOh0GrIlYhXkjyKkOFcOFcG+cNi2VJmXvSomI4cdx3toP1gldem5CECeOq4KW9BQWSybLE+boD5IxAR4pBM0Aaz89/esY9uwGHpxWjOcSR4Zx0jEYVo9MSoQU6VDRCyX/14CZlAZ99cUo6t7S6mkirGv1pLK6q8JWvH3Tp2B6EeC+4u5ejAsH+3RVVAR5BlRu8BVd68swx2Ih497ubTKcFCE+a1fSV+dzhjCfUgqKwBFLRbimctazSeuCAdzViO5Dk6RodogVe+rDRS/S6VOLaWzlsMD6NhKi1qdK0QkhLqxWzXFV0mhGLVUUcSja7CYcnY4rSgjSESlAaw3CWkhcFmxttAicx3jPYiCmKAusFw4WlMoZACWIt2T9cMpoUlM7j7QKtArqDJvunKe1WRJpalIZeQ6GVoqoEhycp04nl85OKTiek2ZJEScRsUbGYF/Q2GwjliCNBEkucdHzsCxO2+iH378acTA3TRU6312CVW4pVTZdJtCIIFKNpSRJrHnq4z2yas7efrrlNNTuiSOtuVqOlOHch5KVXU8bTOjLgBdnKgqsnUHiPlHWULVJHUXisAykhiiR5AbJ0FLmgKgXNRBKGUhW5/fr0ost82Ta2oChK+u0ELUMWaY3ieOB8rYgzaGkQhtRU9NoBRWHJiopuq0EzjFhkls+/fEoYNmhGMXlqiMMGWmrStGSz1cFksFpZDk9zhtOKqhIMF46DWcGyqIibkvc+3OK+SzEXt1ts9htI75iNcsrcY3OHMBIh6poyUpLl3JG0Q5ptSW+jxenI8cUvzfnSyyush9t7GdXSoAoQVjI8WGFTQ7sZgZdM54Zuv8HZcy0+9KFzqADyIqfTVuAEcShpJxItBVoJglBwcpqzWBmShiCKBM7WfWfwRJGk3wuQ1GC91crhLLg1SM8YDwJKUyMzs9TihQOMPD4cqbe8TAJYmXGjMilSKLrNBuNZyrKsSLqa1SqnmYS0WoJFnnMyXrLVjohCBc7SCDRVZem1YqwLQMCgnVCYCB3EzGzJb/iW9yFszqfTgtsHBdNFAVIxWeRYFChFqOHMIKnV7qSn39HgYF56MJLlsmLQjJkuS3xRA8rHLmO1rAgSjQodxmTMhiVlpRmNLM54ihKqrPY062TdWgw0VBZRgS0Fh3eX7GxHvPLKjEEvYjyMyJY5cSRothTZwjLYCFktK3A1ia0sDVorcLXhklgihGXQi5kMS0zpCbQiUHUINwbCUOA8eF/LKwoFQoApLaWWRF8vREeRpwhRg7WzIsd5i1aKyTyjEXmcMcyWjvmiwHvPxe0Qu8hpxhHHwxUqVGxLxT1nWqyWC+ZlSRB5fDplOMu4b7Pg9t6Q0lmEcMShZp5alFRIJJN5xT1nWyTNgJden9FpBpxmdYNFekFoJenK020GnA5zjg7qf7MoPKawFJkjbCgKaVlOSnbOtCkLw2JhSJeeMxsa6wWTmaXRCslTw2LqKHKH9B5fKqaTBVKvODuIyXLDYulJYslqWWGcIFtUVIXn/MWIvKrppc752iOdx0mP9JKjg4zVwlPkHmK3/pk6MXMWRFBDeJQCrSVBKGrKi4WvxMJfkYFFIAvnPBu9NofHY4w3OOeR3jKdGhbzCiEVy6Wj09ZYa+i2E8702uz2+9w4GHL+bAfjKpK4xcn+CdOspN+J0Trk+dt3ubA9gOGcRlOwyGG2rPiV7z3LdJ5TlBmb3SbT6Yr33NMjEJ6sqJguCvb3CpYLi6kEr96cEzYUrTheN/M9hYXKOsJYkmUO4RXjoxSlJWkmUFIShJpsXtLuhuSpxViBVqBjSaOh0KEnWyhWS8d+kSM8xA1JkDjiliJfOQIpSRe8iZEWQuCr9cPWAu9htXDgJWHgqQqL0oIqrZmOiJrtKIWqZ8ey7klHsaSqPB6JUuLrA9nZ7m0uXj4JCAJJFEfIMiPEM51UNLVm0NAc70/rWSaS5dLQbiqeu3VCI0zY7DU5GI5pJjXhzHlPlntORzNG04wzGzEbnTbdVohWEh1AVnriyNNoODZ7is98fp/L5zs0lWW+NFhTcb4b4dKAT9ydEgXQ20zIS0NeVKhAEcWS3kBTGod3NaYKIMsdkQZbOJJWwO1bGXEiSZQlDBWx8NhAsr3Z4O6dJVpphHTs7jY4OsjQgSdIJFFUNy0UHmcFxntmcwvKYSqP0RKEIFs5TFF7cyOBfA3XKTKLqeo7VwqBAMrSonVtVBV4hBSY0qK08F83A3ejc6tWo8Pt0xs464iDAFtVZKuKZVGQRIos8zQjTSAFXkhOxykGy8dffJ33PLhNWq7IraDbbNGREXlpyaWimcTgJPunCwKtaCWCTlMx6DYpyhwRQtKU6KViPi+xpeF4VLLZC+k2Y2bZgu1zTcrSEEeS5XHNTpCBRGlHFHpCJIEMMJkH65FIltMKbz3jrBYfDQLwTpJlljgCpRX7B0sqA8uZJUs9vsoRAqJIISWUlWCzG3G8yMhzR9IQBJFmMa05WaYCZx2BVoTaY62jLGqjWitqjFYiKTLHOqmmKgFRw3aSKKAsLBJBEEgbotzXxcBO6kzLgLLyspFo8tyTZQ4p6xbeclWhhGS+qLh4JsJZiwOK3NEaBNy4O0RoCEJFr+2IQ8VGp0ESBYwmGWd6TZIwwOPpdBs4DHsnU3JTogJBK/aEuy3y3HJ4khEmAc1Oi2f3lqQCmj1BZAJsZWm2Jd5BXhgu7UQ0YsNwAbOlYTk36wG+pNUOmQ5zokTRbGucE2QLixOCk5OSMARjwBmBLSzCS4qipqKEMVRGYJTg9t6yLu86ijhwZAtbZ8wOmk1FlkFROJT0xA1JkVvwdTiO4nra5J2AOh+rh/9qffdWNVMx7gQI4W1pjH2Ly6QrHuBkNpzmVW4QUiC8d0Bl6pfpwk6LNK3pkllpmOeWysBoXDJdOqaTEqEUk5nl5dfn7J8sWaQl87RitigACAJFr9lksbR0GgmdpMl777/ITqfJbF4yXVQE63BnpWJ7u01mPASCVl9ReYcIHSIAj8P7mvj92us5q4VHGc/o2GCq+qtb72i2JdsXGmyeiwliCBuSvHAspznSS7RUSF97fBQpwFMUFqkFMoBBX7K7E9LuKC5djFCqBuQJ4RFOYErPamHIlo4yrUN5urI4C1LVGB5TecocxBrNKaRD6frX3nuK3GFLSEKFd24xOSkzgGvX/q/70V+mB9cxf7nv7gSBPEqi6PxyXnglEEoL0rxEbzaQSpCVFVGiWGUVs4Vdg9cCVpnn7sGSVWHJC8feYcqF9w6Yr3IOx7WBl/mU8/2KM1td5suUvdGEQGqcqIv+yki++MqUZqxodmJKZwkiTVAp4iRAaMVkkmFN3TbNK1vPd51AOI2yEOJYTAukllgcuawTw3zm0VLgTYX3EoRCOI8rBd5IrHEoUVNRwqgeDCgpaLUk6bJkufSEwnJ2M+bktKTIPZ2Wp6wE81ntzVXlyFKPqdz6JQMhBGVV47V0WGfNeIiiOpt260mPMd5Zb5SQ+rVHf+y10ZeLj/6yPFis74Vf/sEnR5GOhr1Wi/m8luE1pcV6z2yR0xvEsMYb9TtdJmODrQRUniqD1aKmVQoR0G42qBw8fO8mm/2EVW45HGeUCm4fzxnOc6Zzw+dunHL7dEarFXL5nhZb2wkr6/HSkRvLdFGyf7BgOFpSVZaislQeZChotgOShiKOFV96YcWLr2Skc4Ot6nJDCVn3pRNNHAuEhrARID01TrnwpEuLKT0CSVlaHB4vIM0txghOTxxHh4YqhZdezPn851NGx472mkiWLuvUuKwcQkJV1okYCEzl60Uh3iNVDad1HnQgCGOQSuBs/TNCSqSS6FDvXQN35cqXZ7sv9w72a0y0z8rq1WYzea+p8EooHtjZ4OR0yXxVUBUQhfWCi9OTZZ0ZWs/J0jLoaro9TWTgZGqIJSzSjKyo0KFl90zEoJFwPKz3I6jjGmbbThL2jxb0ejHjaUnlDT4Q7I9TdjcbeFdLCbZbEownAISWeDxZ5alKg5Q1O7DI64G7wxMG0O4oKuMxdo2AlIp0UZO4tapDuLV1GFUapFY469jsRwghGI9L0rmjLB1Yi8RjnGBlHKtlganAVuCMA183LKxzBFoj1iNA72qwnfN1HdxqCqJEUuSOyvxCmRRE61JO6U99JXnTl92q/ChPKYCN5oUXBZJGU/v5KkUpwaUzPSrvWOQFxtTI/WVeIIR4E6IikYxGFSdHJee2m0yWOVVlqRAkrZCdXsL2RkwUCQIlKCrDaFLyvvt2ubDdJIkkrWaAkJI4FOxutahyRzrPiUNFuTTIEpRVpLMKW1r6g4CkFSJUHVYR4IQnSgRxJMA6fOnwpcfknmJuoPAoIXG+bj5AzV6MI0EjEbQ6Eh3WESRqChqdOhGSgSCIFYEW2MpTVWBKh/e/0Hb0vmYw5pklT009dlxLOmgJUVh7dp5BltagOy8EUtcoEKUkg0H71a+LgT/EYx6gGW686owibmoZhCG3J3NUILG2pmZIL5kODUopuu2I5cKSFZ6beymjuaPZCuk1Bc0o4MatBWXhOTwsCYVmdJqSpiWrecV4VGCc45//29fQWtNINO12wPmtmPc/usUHHtygF8u6HCss02HO0cGC1TQnXRq8UHjncGVFlltWWYUMBGEs2NzUPHi5hS0EWeZoxJJYStKpwRYOrCcOArSUBBKEo4b/WlDCkxclztXjvyyzOOfrcmjdMwZwZu35CoJQoMM3bk1R35xC1GNA5dGhwLm1MEsqyLJfqImlgCCS3oHSWhfCcQvg+ls78Ien1pykzejyp6Vtlo1GKPsbLZ8byzwrqUqHROIqwWJqGJ4WNFsBYRgwXxjCSGGdoTSGo2HOZGrZO8y4fWfGwcGKjWaErCS39pb0GwENFXB8VDApKj75+RHeSk5PC16/s2C5zHj15mn9djuHK+r9R0pCIxa8++E+kfKMhiXZytDvhgx6ijPbmofvDXnocki362n3asr8fGZYTCvwtZE8YI1F63poEEUCicRWUOWebluzuxPhK48r62Qozw3Zqs6cnPN4UXtfUdYRDV/fpd7VHi3WuU0YyZqJqSFOJN7Xcg9K1Vl1EOqa0ikgidWtJ979xEs1huotNvA18ZQHENV33NZR9FIYxmz02t4jCMIAiSKUmu3NJlLVomBp7jl3oQ1aculyExVD5gyL0vPK7SWrlcdUlnvPNqnKkm995Az37fQ4HaVcOpvQamjCUJCVhi88O+ZkP2V26vjZjw5p6gaxCGiEAe97tEc3FvSaitWy5NEHBrz34U1aDUkUQb8t2BkEBNIzmxkmE8vN/aJOCJXAAVFDE0ZizbwXRE1BmLDW5pCMRvmabiKxlcI7iXCSKnd4Uz9rqWpOMOv/mm3J1o6m21f1hKhaDw+EwK8TK61BB9Df0Oh1RiSlRymBd/WLYUrvGrH2geaTP/ADP1qt7fbWGhiEf9pfUZcvi7wbNj8WyJAkinwchQRS1ILczqO0p90OCRuKvcMlR8MVOlHIRJG0QoIoYLqsqKpaxCJPK6wzfOnGhP/9Iy9z34U2D94/4NnbMzZ2Yy7stug3Q6SoGyYbgeTdFwbcfGlBSznObcT4smB3O+Cx+1s8crnH55875MEH29x7KeH8TkSeO27tFQzHhrKUSCFoJQFaCbY3AzotTaslkUHdW1YBtJqSTqf+tcfR6QZs7zQolp7DPcP+rYqT/YpiBWXmEK5mJ1hbc5OkBus9zY4iKx1Z6WsAXc1dwSOIE0kY17PjonCkaZ1UKSXeLKGqyiGlEHGihQrCTwA88cSXb7evqJN1hSvAdTZb3Z8+mDR/cJnPRDOJiaVl2kyxoWOxLGl1NGlWf5XcGAYbMc+/NqMRCh6+t8/B0ZJZUVDmjuXCMp8VqFAQNxSffPWE3c0GGzsNFIJLZxIasWQ8zKmkY3iQcabXIBxEvPzyhF5XM104trYDpvOUX/+rH+P144wvvLBP0hS0my2qFbSaEfmqpNtWrPKKKFRUVqGx9FoBr72SIYRA6Vr+N0pqT97dlURBzN6dnDSrr5ookgyPilqXI6z/TNLULBeOdifCGl8vzsode3cKqry+T906TEv5hmvVpZIQNSdY+DpsC7lmGtbLuXycKBUEctGOwp8B+NCHcF+utvRXpPnwRqn07I1/tPPs/kefvXn0+naRG7/d8+LZF47JK8NwUjGfFyyXFUlDk8SCi/c0ODopuHVrRr8dstEPyQtPkRkaoWRzEDJZVVTe0umFjGcldl2LtiONUtDrhYjSMj0pcZVjq6dZ5BbvLaUVOOHpbGkunm3znb/iIfaGY6aLFYtFRSNQDHpdlPc88/E9lllBXsBkanCVQzmYTSGOBYu5oSgFFy8HqEBy+XKLg33LJz8xpJHUrUctfgGd0e0oGi3JaunwVuIrwdFhRhCBox7yV7movVqCNXXZ80aElapOpJQSuPVosdlUeCcwlSVqBra3EajtneRnfvbHT75rrSz41nOT1iHDX/VX5bvv+53Hm83+zy7Two9mK9eIQvqdEGMsSnnStNbiyBclthDMpxbpQKMw1pMVFlPVOlLL1PPiSymLqWO58Bzvl1ApmiogQJCmFcfHOVlebyiLIoGQgmVm0arGFoehpCjXcNplxkc/8RrPfemUnU5MLBRl6Tgdzrm9N6bwgsOR4XhakpYWoSWVF7R7ikZT8Jt+zQNEMuTWrYz5yvDKa0tefX1K0lHEDUWQSIJY0uoqGh2FV57lyhDGgm4v5PiwDl2mqnFUgarVAaSQ6wjh123IWiy8ZviLdXJWKwI0W7quv4VEKyl0KEmayb/03vPlNji+avroGxylbrP7Tzc7A3H3YC6815zbbNGIFb2OJlSCUNQToukkZzGv0GFdx5ZVvV5OybqTlKcOawXpEuYTW/ezK4819agtCGoa5WiYkxWOVWnJc8tkbMhSR28QY6wnSVTdnKg8SSgZdBLKzHJ6siBfWUbjnBt7S2azikYj4sLZJt/+gS0eeWCTQCt6g4Az5xJGixmDgWAwiCkLT7sZrsNcjbZsN0NarYgoluhQ0GkHbG1FhIFiPEwJolowTcnacNZ6/Jrhv75+15LFNfRW1q11lBC0mjWbcD4xOCcQQnhjnYzjYD5otX/yKymPvgaVnScdwDmz9TOD1satII7uuXWwco9f6stLq4qsWOJKx6s3VrWEkJZUHhIJzZ6kLxKyvCJoRFRVhZA1IavX1Yymrm41GkOxrB+q9XVGmTRC4iTkaLIgzwzndgPObEYcnhTMipJ2J2BnW7PRUfTbknM7XW7cntBshOS5ZZ4Z2l1Nu6MJQ0VRVpzdCSlyhxAtvLHEScDhwZJ7HgiJEom1tW7mbFywXHnms7IWQ0PgjQEB08Kz0Q+ZDEvSucU7/+YdXuZgTd0ssc79wq3o6/vWubosFrJO7sCzXNqaG6XBelzUVLLZCJ/5R3/rS6/D/zVM9ms2cJ3hX5VC/MHxj3/yT//4g/ed/xM3b+37i9shi8xzz7kN0uKYw1NJmjmCWLBalCTNhLip6YcJSnk+9+KYWEt8IFnmBhE4WgOFWDgKY4kiSZpa4khhjKOrJRfvaXH/Qy1sJZlNFoDh4c0ep8OCk9kKoTydTojQgmma0mgF7Gw2wTpOZhl7x0sOjyuK1BIkilU6Jw4E7VbAauWYzipu36xQ2nDfvU3SrOD5F0bMZjXcxpRQGY/yNbRVeMGqcNiiqNXsbC294JygzNcwHVsvz0LU20ytq8nfNbsfVCDQWlCW9fAfJ954B0gaUvYHgYii6O8CfKX6HF+T0h1AQ2/8w93O4A8fhcfhIjPeYsUkzYji+p4KvKTKaqD6yWFGM5GMzJwkVmu11TrB8FKgIkVlIIo0CXDrdk4Y1itqnPMIEXBzb0FlLWfPNnFRwI1bK9pxxSBp8D3/1cPk+QwZOLQOOB6tEEKzd5jSb0VYI5mPDcpLGrFgkVXsDtpc2N3kox+/zWJeMug36PVDZtOK45Oc+aJiOnIsl3VdqyS4yhE3VK1AO7d1gydW5CtDtqo1OpypeU1K1oiMN5gQ3oG3Aic9jaYgbsialFbWEyOlanlDvEAp4TZ3I5E0ghc7vQv/Fl7n+vWvXJD0q1K6u3btGe+9F/ed/RWHL/+hf/eB0Wr48HS+cnlaSSVrNTfpBSfHBVLX8JNmM6pFToDZtCQKNHlac3WEFLjK8tB9PY5uldx/oUG/q7C5oywM/UHIfFGwWDgKs55Iybrfe3e/RHjJZLbiv3r/GR64Z6NWWZ+WTOYlh8cFL72+IA5bNJKE1aoiyyviWPHwfU2ODgs+9bkp05llMioZDwvmc0O6MDUJu/QIC3Eo6LUVmxuaJFYIBKZw2NJTZI4irZkkzvk3vVWs71fnxZuywkJAqyVptuvM2ntBVdTXkFKSoqg7X52+9jvnExlF0bWf/LEv/fx6j8M3xsAAjz32gnr8+pPuzzz1W4/2j05/z8HpUOCcmE0qeq2AbkOzO2iRrkqytZSQlpJIyTfnqvnCEEhNlVvK0jM8WJEvHcNhRrslOL8d0mlKTk4rokiSFZAuPLNJRZE7klCTLgXKStLK84XnTxiNU56/MeG1W0sODzPmC8tiarDG04jrYfpwUiCFJK0Knn9tSrOta51I56mKmpWQ5Y5saSmzWmQliiDUMJ94QqWZDivylaMqwZT1zNnZuoWhgzotqyknAiEEUgviRNDuSISkllK0Yo2DriuDsrRIJVEhbudcLDvd4IVm0vlvX/78qPpq1Wa/agNfv/6Cv+qvyt/d++FbN09+9oMHxycPBsrb1bKQy2VOEErO7jZoNjXDaU6aW6qipmy4ylMW9TisyCzWeOJA0WoGOGdBwnhaMZ4YTFkPzdNCsFhYysLSamhcJTk9yMgXjvG4ZLWsB/XPvzzn5KQkyzwnpyWTYcGgFyOUYP8gJS8tnXbEaFjRaNeGixJFVTjyrDZIvxO/KXVUz3ItQkC/G+Cs5PbrGWXm8RbK3K2rUoFUEIR1ZlxDYGuPFaouiQIFWvuawWBFjcfyEmvrPx/EAUoLGq3Ab2yFot2Or/6rH3v9q/ber1pl500vvv6CEEL4x+6/7/9xprdphpNc7J5p0ExCxsuSg8mS0hv6/ZidjSZUgvFpAQ6qCpSuQ1ezpdFh/TCSpgYhEVKySD13jirSvIbJKOEZ9BVxAPs3l8xGjiJzaF037CfTErysU1PnuOdcg8fu7zM6ylmOCyIt6LYlZ88ILj+gWKYlRenIU1jMHVVRMwxOTlLKvGYROl/zroJQMBqX4EtazfqzvqEsK2XdW661NSAMa8SHNesyT9eUfucgSz1VAVVRjyGlrKNZnNSLvKTChZEQee5e39m88A8A8dXcvV+zB7/hxU8/fUX92l/xV+983x/5jncdTSaPz6a5/ZXfcl6uMsfROEXo+gvMx5YPvf88L78y56FHW0QNzXRa1hpSri4nZgsLwmPXJUSzGVJUNY/o2791u5ZiUK5m/ukA4WoeUBjXTf44qqE13jkaAWgExdIynThGU4MznkAJTocl5ze7uEpw9zBnMbVUpSRbGUxR46iEp/69qcuYoqi9WAqBKSVKaspiPRq0niAQtFqiVqFNoUzrsI33lJWj2w0II0m6rCkqYg39MWYd0kWdPQvhfRhL2Rs0/txP/J0XP/a1eO/XnEXXqfujHhAPXbr/v7+5f/LrPnX8SvO516f+3Q9sC3kbDk4W9FshRd9x53DB+97T53i2oNnWxC1V92LXyyqQ1Ngra4lCVau9OcF0bnjtxoR7zjVYrizLZcnhssS4eqxmTS1/4Fzd8ksXDoVgMi2Zji3tZs3eOxmWDCeGonSQNzDecOeGIVCsERaeSGuyvKJcQ2UQHiME7ZZmox8xGVakhafKyzr0WrEexkO6dPVIsQTv60G+qTxJS2GMx2Wu5v26N7heFrWOPjiPcd4FIbLdij77+777e//fH3vPj8rrX+NW0rdkrc4b69j+9k9+/5/7+Atf/Iu390/tRitRD1xqkWcF80VFpy349BdGNaT23gbHo5w40CymhtmsRHjIsxrYJvA1o7CyCC/W8kKC8+citndiAuVYpobnXiwIQs9yaRDUskRSQKOhsWXdEcuW9V2vg1qmKE4UaWZZrCxagpaSMq8bFFBDVL2DIJAoCUIJnPHsbiecjuq73lT1ZEj4Neu/cjX8xgj8moOk1j1mL6CxRmoK6s9nXR3iaxkl8UZ27RHObW0l4ty5wXd+5Mfv/B9cQfE1rtV5SxZjXX/6Ba4+dVX+yQd+6JMv3v3UrxsvZ+eH46U7PcnF7iBksSxIS4vzhqPTikanfqPLwvPI/V2KHExRIRHkmePxR/pMTjPSZZ2QCS/QQnB0WNJsCGQguedizN2DnI2BqrePCvFmPZllBo8gXwPjPNBIAjY2GozHeY3AWCPMbeVot2Js6TFrWcI3XhQVCLRUWCOYTUvSVf3CYev7VPg6U/aGNxMt3njRlHhzmOBFrVhr3tjpsBZDqwXQIIoFQgqXNJTqDxp/++M/dfTXrlxBvfA1GvdrTrJ+URzwdcL1YPGB9z7yRy6f3cm9d36eln4yNzSbul434AXvfrxNJCWBhuPjlFdvzIkjTVUJwkjR7mpKU/I9v3aT8+c0ZQmr1JKXFh0KXr+54vXXFjz/wpJmImutqR1NfyOi1dV16zNW9Vo6IYjWENeishwdrXCeWh5Y1TAbuV7z49dtOvdGH1HW/KKytHgcaVYv3aiKGojnTD3iM0VN77Rr4yEEOliHXSFq3cngjb5zbdQarVHDcpKGIoqkQ3jV6Sa37r/Y/+8A8dVoQ3/dPPgXJ1y/4Yn/5e7v/AMf1Cuz/FXTWWZN6eWZzQaNln5T6fzBy21cJQlVwOlxwXCU0e+HOKiH7d2A+++LePBBxcamJtCaZelwb4REA5NZtYbFSpJYcXBQ1RJFQrG9FZItLY0kYDGvUFoQx5pyvQXFGEcUShpNRZquDWY9USRod+ot3mI9/fHeIbzD+zorRggCLfDW0WhIeoOQqoJA1oJnxvo3XUfpdch2NVvBWQgCgVC13mYUCjpd7dPM0u3G9uz53pM/9Y9uPnflCupv/s23ZiP4W7p99Pr1F3j66Svq+37LD/2Hz73yhQ/mVfbA6TizYRDIbjOi1w0IpWK+qI3hveRXffAiy6Xh5sGMbi/AOEdeWsoSjk4MO7sB3/GtfZ59PsMrsQaN+5qZ4CDNYXhSUWaeZWYZtEOqvGK5chhj630J606SNbaGoa5hOpWrWX7eQhR4ds8ozp3RFLl/k4yt1lMgb2ur6UDULdRYEjc0Yk3NqT+TJ0wgaXiSZt1jFusg+QbZpL5vBUlD0m4r8szauBmo7TOdP/fz/2L/7z/xBPqnfoq353rZWt7nBfHhD/89+wf/+Ic/upxnv3WVZf39g9Rt9Joizx2e+mEs5iVSKe7cnfCdv/ISDs/rBwuUrtXrlkvDcuU4GjmyzBKEiunc1DpSUpBnlir367WuilAJ8pXh9KSkqhxxVHsnCjY2A4Ko7iU3m4rBpiJKxFqDCrCeZkOwuxMxn0mGJ5ZGUssPOwdlXi/VcNQ0znZHoULNfOZqFZzM4nxtvKRVIzGEYL1HSbAePBFGtZfHiaTV1qxWzupQ6a2dxj/+9L8+/lPXXrimbr+Fxv26GPiZZ+pp03su/8jsd/+h7/hMXmVPTuZ5ePdgxUY7FpNRXtd/HpJIMlvlvHxryHseGyCVYjLPCWS9srUsHEXqMbZeJGVsLeEbBZKdjZgggDgQbG9o+r2Ibiskzwzee86ciWi0FJOJwRiHdfWyDGPqdmSZOYypjftGgjQaOk4OK5RUTIcVRV4nW2EokbLOqqO4Du155nC2RkFCLWIWN+petC0FphSUZW3cetwpiWJBlGjCWLFaWSuUUFvbzU889lj/t//W7/m/lbxFO4O/rgZ+Yxjx9NNX1O//r//J7d/1Bz9wx/ryt47nmR+OUyaTQggv2d6KyXODFY4Kz62DOWVpMLb+UEoIhIMirZOZKJCkma0XLy8tSgp2diIODwvy3JMXhspZds/G9HuKe86H3H9fE6EkF8/EhEKSl4ZeT6OF5mS/YrXwaF1LJtTq647ehkTLdQJVUQ/eqT2v2YRmR+FMLeuv1yrvcUOhVI2twss64Vp7rxD11CgI19kokGfOSSlUfyN57exu+zf98x+7efyVICW/6Qb+xUnX9z/541/8r3//u+bOVb9uNFl5J+H4OBcCwaXLbTZ6EYNuTKcV0mhF3L2VkYSK3e0YjeT8uRatpmJ3I6HVibm9l6IDRV4YRqOCfj9EK4hDSWE8x0cZSng6HcUj97fY3WownaWUpcVUkuXEcrJv2N1OiCNHqyVxOFQo36SHlDnYyqOVXDMNLF5Q00WrWkUWV5d0VeUQa4C78zV22rv6zkfU9fQbwHYkmArn8XJzuzE6s935Tf/+n9154WvtVn1TDPyLk64f+h3/8mO/7fe/v5Sx/TXjSeY2t5ri7kEm5gtDGCp6bc3uRkAnkpzdaRIGmiQQDAZN7tzOODpcMZkXnN2J2N2NKSpHK5E8/nCfV2/leOHY3A549NE+OEGjUbdHnfPkWa2nFWhPFGjSlUUpyYVzIWEMxnm6fU27rem0gpoTVDh6vYBWJ8TbGvPVaNYZ8WLhKVLIs3pcaW3t5dZQe29VJ2dC1uM/Kaiz9obGOWGdR23uNsZbO+3f8syP733irdgR/E0z8JtTp6tP6P/hj/+7n/0dP/RtKy+qXyslYqOfuDt3VmK+sIzHBd55sqwEURPDK1MTxDb6UU2ydp69/RVhJHjk/jb9bsCZnSbvfqTBLDX1Auay5kHleYVHcnTk+NSn5hztV+xsR5ycGA4OC8JEsFiWFKXHeKgqRzMOObeTMBoVRHFAWXomQ/Mml7fIPenCYYoaGSneGDI4SOKa/eAdVKbW4tBBTVmJYkm7F2IqbFU5tXWuOdo62/mNP/dP937u623ct6xV+WX1rJ++oq4/ed3+P//Zd/6+V147+l+rrAqKlbeH+yvlgLI0DLq1RL6zjk5Hk6YWa2tS+cZGgrP1Eo3FsmJnSyNkyHsfj5jnBeOZYTIrGY8qZjPHdFxRpYIHLg8YjlJCbRhsam7vlWS5rbte0qOCmp+khaYVwXRW1XelrceA3tfZdByDlJI0dVQF6KAmcgsBSSJYrmrwYBTXwi1SeZJEo0PFYm6M8+jtc61b/Z32b/+5/+3WJ594Av3MM5iv93P/hhkY4OrVJ/S1a8+Yv/Bj3/Prbx0d/N2j48lmPquMklovFpZFZtjdinHG1dhg4zg+zcnzijCUbAwi+h1Jmlt04EmSWvo3TCQ6lJjKkGUwGVdEsSQONNJpVkvDbJFTVgZvBdZBp13fuUcHFVUB07ElXdZrdaQEqVmP8upJkZD1UMNUNVKyLNaSC+tSSsm6QxXG9RiwhsEKXxrnk5aWW9uNjw82er/nI//ktRvfKON+Q0L0f1xC3XZXrz6hr/6Jf/fy7/1jH/rp5WLxbaNZen4+L9ygn2CMF8NRjg4kWV6Tv6K4HsuNRyWHhzk6lASBZ7GsWKWWqlKMRiWrucEagTMwn1d02uH6/qt7zDUdVDGf1pROKRzpwuCcJAwErvTEUd24SFO3Xglbd5/UGixXVTWn164JaoJ6PZ1UtasoXc+xrfEUhbNWIHsbkdg50/lb939w8/f+5N94+fjKFdRP/dTXNyx/0zz4Pw3XTz/9h7r/5qVP/cjdg/HvHw1zlJB2uTAKL2pSlhbUAxfB9pmI4bDAW8fWds2dnY3Nm3NUreo6eXicgYSkIRFKUpWeOBTodePBGshSy3JlKcpaSsF7X6MZva/FUJBvCqQ4u9ahXIv3SlmXcM5DEgcIWc97natZgQjvvRcubkrVHUTHg83On/zEv7j7j+oQhuTa1ydbflsZuA7XV+W1a9ccwB/9n37Z9x3sT/7S3t3p9vi0tICQUkhna8QGXnL5/rgWKfH1XqEit8zGptZZ1nVT/+yZBs7B/v4KLz1BKMlSQ5HXjQ1b1k0N72qqKaJuokjqHnOtRucQStY8IgeSddvS1TykMJYUaQ2WC0NFZcwvGiQJIxW63dV0OtG/2Tg3+GM/+49ff3WdTLmvR537tjUwrJXkn6r30//Zv/5d99/ZO/x/7R/MftPR0YKycCYIhYxDLZ31ZKnBe1ezBtZ3onBy3Vhw2MphjKPV1CQNjbVQ5Ia8MOSprXm5pa+bF2tccxDUnaaat+tq0TFVJ0peONR6e0a+8hjzxhYUR1WJNUHbI6TwUuKQqLipaXeCk8FG4y9+6id/8K8Lcc19IzLlt62B3zhPXH1CP3PtGQOC73/qW//A6WjyZ05H6QOjSU6It3GihK2cLAuHMYZGK0QKz2JeUeZ1iBVSoHyNVgRBmbt6T+CaSI1dDwT8+r5cr5EzVb2zyNt6goT4hRXt1tYCZiDWQjR+jcYQSCW8EFilhU7amjCUrtUJ/+HG2caff+Yf3H0NEGvBbvfNfLZvCwPXIRu51n3yf/Nf/c7+xz/9wg8c3p1//3i8um88SlFSWKUkCGQYSNFpapSSzOcl6bJGZm5vJiymBWlqSdNaaMxYV+OYfU0LAb+mcYo1m77m/+LFm6iOerT3C1xdFdRXvXUeKaULAumtdaomhemi10/+ebMR/42P/Yu9/1DDmL65Xvu2NPB/moAB/MiP/cbeJ1+88Xvv3J5+3zIr3lcZS1l4ytIa4bxoNQKJ96JITb2T19WSCXa9plXImrHHGh/l1wA5rSR5YckzV2fA612CQtZwISHqYf8b4z0vhQPnpJYqSrSIYokSYtpoxk93B/H/+rH/fe8zb1YlV/HfbK99Wxu4vpwRTzz1hKrDNjz9sT+R/P1/9JO/dTpd/bY8r35VkfvGYlaSzipwWL3W5pJKSue8eANk7x3kua2pmGtRMe9qhoH3vl6etR7I14InHufwQSi9c75Orp2XQgkRN3W9JyJSz7Za0fXBoPOPP/JPXrvxJjKm1td3b7dH+fY08C/6fE9c/QVDA/yuH37XQ5Nx8ZtX0/xDk1H+K/PcJNnSrElfNdxGaWW9dd5UDoQU3oEzVrwhKuZZ84WU8N47pBfeWS+qwkoEIowlOpJEsSLQkkDLF+Nm9NEoCH7yu7/vl//MtSevl3W4QfHo28tjf6kZ+M3PuWbW/aJSQ/C7fvj9Dx0ejN+Xz6tvXy2L95rSPl5WZmDWZY11YCv7plpcICVl5d7c0SuVxKxRlLi6/RiEcqG1vNFsBS9Ekfp8px184jsevPcz1649k795jVxBXX+bG/aXmoH/o2Tsozwhn7n2jP3FdaUQgh/4Hz+4/eLn7j5YlfbxorTdqjBnEFwEv+HwCdYHpnRYL2wQilwIOfWGO0pzN4rDaajFa+cut57/M7/rwycf+MCPVv9RbnCl7vp9s+rZ/2IM/J8a+4UX6u/w/y9rFUK8qbcp1igd1kC4/5+2uoK68uZE7JeWUf+zMfD/6bt4uPIk8uSk/l7PbOO5zpt7t/+/fvcryCfWP7+9jV+HXv9L1aDvnHfOO+ed885557xz3jnvnHfOO+ed88555/yXfP4/vtNbuuk6vFUAAAAASUVORK5CYII=',
  'data:image/png;base64,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',
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAAB4CAYAAAA5ZDbSAABHHklEQVR42u29aaxu53Ue9qx32Ht/33fGey9HkZekOF5NtBzVsSxFpZo4rY0GCBpTadqitjMYlpoCDhoHzXhJIK0bx0FTGIYV2W3sFAmSS6dA0NgF7NSiA8dxHDuSU8uDJg7icOd7zvmGvfc7rf5Y693nUFUgkbwSpZSfQZiS7j3Dfvd611rPep5nAW9+3vy8+Xnz8+bnzc+bnzc/b37e/HyFHzp//rxhZvuV/HPhwgXLzPTmY/s6/DAz6QE5ZrY34+sxs/v4xz/u9CX5hj74b8QfnvShGwCFiMoX/4ELFy7Yc+fO3fmWt7zlrdvb21sh5yYOQ5tSanLOxnufve/GzpsxA+Hy5ctXf+/3fu/T3/7t33747zh0B4D1+/E30sNy30CRagAQEWV9yAUADg4OTq3X63OnTu29a7MZHjHG/IfGmJ2U0p73fh8AGmvh5nOgFDADIAIDSARwzmiaFo8++q6XDm/c6McYPz+fz5/ebDaf22w2v/aDP/iDzxNROvFz1FviG+Kw6ev8UE9Gan2Y9rnnnvum3d3dP2ytfW+K8duYcHo+myHngr7vkVJESgkxJmZGKSUj5wIwg4gAAsgQiAxIHoF13sKQQdu0WGzNEWNEjDEQ6LfJuF/u+/XPf/7zn//VD3zgA1dOHvYTTzzBTz75ZHkzgl/lwT799NNWIycDwNWrV7/FWvojMeY/AuBRIkIII1bLJUJMuMacyBBKKYaZQQDlUijnYsHy/J3zIGMk/FJGLgwwI6XEhQtPV4Ux7JwzjW+axdbim7rOflPXNH/2wQcefPnK5Su/kML4M//2Fz/1i0S0PhHV/KXSxZsR/CUiloiy5tLmD3/Hd/wxR/ynQkj/Ude1tFyusDxaopSSyQDGGGOtg7WGCjNyDMgpI5eCkotEqjEgAkrOSCkD+u/yIsgjMMZMh59zQk4ZDLCxhgkoRMbMZguzvb0N5yyYyzPW+X949erVn3z44Yc///V60F8vB0zMPB3sJz/5ycXZs2e/u22aDzvv3jEOI24cHCDGmAlEzMVwKXBtA2MkJVoiFC4opYBLma7ikrMcOGeUXJBzRgFAYBgQrDWw1svfY4lqZkaSKxqlyNcEEZzzbI0txhra2dk2Z06fQS75yBr391+6fv3Hz91///9z4qC/LnI0fR1Eralv/C/8wi/sfst73vO9bOkjs6Z7cLlc4vDwqADMhYspuRBzAcCwzktUlgJ9/jBEKMwwBDRNgxgTUoogsBZX8isTgFwySmEwywshiRnQpA3o4RMIpRTkkpFzhjUWZAjG2OKcL75p3K1nziDnPMCYpzab/kfuvvvuf1sPur60/7884BMPgA4PD7/HefcX2qZ95ODgAIdHhzmnRCVnA0CuWRCMNbDGIueMlBOICMwMY4z8Q/XXkkhkLaxID8/qNcxcUApjHEM9WxQAOWWkFPXPAMaQxDsX/XqAtVZuCGaA5Aq31tpbb7sNzDw2vvnJZ59//ofe/e53v8jM5oknnsAbVYjRGxW1mqv42WdffN8tt5z6G13Xvu/o6BCHh3KwKSeTc0bTNGiaBiklFGaJNma5mkkiFyBYY+Ccg6l5tGQ5xCwHY8igcAFrwWXITBFLIMQYkPXPphzBheU/o+i/S16Xb2fgvQcAjOMo17yxzCwHfffdd8P55nkQ/cW9vb1/8EZGM72BUYsb1679Bd91f52Z/bVrVzMKiLkYiSCJTOc9wIxcCowxsFYO0hoLoICMgXMezjoUPm6H6svAkLuZmJFLRkoJOSeUwjCGQCDkkpAzw1kH5oKUpe1NKUkOLxkhBAzDKN/b2qmAA4CSC4whdLMZuDAX5ryzs+tuv/0O5FL+0fPPP//nH3300RfeiEOmr/HhOiJKv/d7v/eWu+6886O28f/ppUuXkGPOzjubc0aKSX+q6WhgDcFaL5HiLKwxYMZ0/VpnYYxBDFEKq1L04DI4ZxhrtIiaOiFkraK1pQLpFR/GEaVkpJwRQ0DRFyumBC4FxliknCQdgJByRuECQwbeOYSY4L2Dca5YMnz32butdf6Fo6Pl9999990/W6HPr1UB9jU6YCZmaX8ODg6+vZt1P8m5nL10+XIGs7HOERiIMWhEOhgjV6GECMNYA2MsiCAPNRcYIpABrJWILqz1cSlIOSPnJHkSepUTwZCB0eKJIQdNkJcihBE5JS2y9Fvr1wohTO1UigmpZLkpckE36+TK16/JzPDeg7kg55J3dnbt6dNnMIbwQ7fffvtf+uLi8hsa6DjxxuZrV658/3w2+1/6YWhuXL+eyZAlMrDGgIjQdttw1iGXhBST9psM443Aixqxs6aBgYGzBkzQaljzMxFSjLBgWNvoAfOUqxkMLlIpk5HvnQX1AukB5to/AzDGwkIKqxgTYhzhvYeFVtsEjMMI33g0bScvnXwzpJjBnO3R8rAsVyvcc/bsX7x86dIjT//SL30vER1+LQ6ZvgaHS0RUDg8P/8ed7e2/eOXKFaxWq2KsNW3bom07BRcicmFozMI3Hs55pBglcq0RqFGv2MLS4oAZxjoYkorLGIvCDAIjpzhdxaVkaam4QP4aT5V2KVm+XpacXSM4xwQyZmqdUk5IKcEaixACQgxIKaNtGrRti3EcJe8zT/l5GAd45+G8Z4Dyfffe51Ipv/o7v/O7//kf/IN/8Lmvdl6mr0Hk8nq5/Mn51taf+sIXvpDDOJr5YkGz2RwMYOx7hBgg8L9EUNM0cN7DOw8QCTiRE3IpAGOqlLne4hrBxjpYo4eshwnIlc4lT/lXvhWf+Fm1Ui4FOWXJwXpVE4DCjMIF1jkQ67VdMsZhEJDFWmw2PdbrFbyzAJNW4gVMgLN+ui3adpbuve8+R6Df+dwzz3zne9/73mcvXLhgP/ShD+VvmCu6Qo5PPPEEb9brjzVN86eeeeaZxMx2vlgQEeHw8GCqcqWvhB4wTUVQvepKzlOx47wHK/BABOSUpj9ruaAQKUyZwaCpPyaiqcWy1sgMQ884MwCWnA5rQEaKrnrYBIZlAwODwvqzAGjaRnI5A4vFHETA0PcoLHBoCNJjt1sd2q5DCBExBnfx4svp9ttvP/fg/ff/09/6rd/6zne84x3Pf7Wu669GBE+w49HR0f+8tbX4gc9//tlkrHHWGAx9D4Cwtb2laFNAivK2k0ZvPRTrnFaughNbqwBHDFoVl6l3ZT5umYhIXxoDIgNjCEXbJ0ZBKRnMEDhSQY0Ypfclo1U5GXBhxJTk7xdGSknbrDhdx8a4qYgzxiLGiBBGgEircwJY8nI375BTQYwRs/k83Xbbbc4a82+vXT/4jnPnzr301Thk+ipEryOidHh4+NcXi/lffv75L6ScswVAIQS0TYPd3b3pgPp+g5winPcgMmiaFk3TCEih2LI8PDm8eghcCgoDJSe5qongrJVqm8wEhEik8oR4hTBMOZaIsF6v5KVJefqZoAVb0Sv9+BaQfDwOPdabNUKQwYbzbgJPKigTYpgGGs55yfeF0bQtrHPo+x6LxVa64447nW/8r332s5//Q+9///uXN/uQ6SYfriWi/PKLL//Z/TP7P3rp4qU8DqPJXAhc0HYzeOfBnJFiVGRIrmhjHax1aLzTvtLCWDkU1MMzFgSC8w7OuQm04Cmd8vQgJdWyIlZSWYcwSKQyo+QM5xx802AYBrn2k1TFKcXpcIq2QiFFsP53xloAEt2b9UaLwkZgVDKIMSEXadFkrpykRwcDBOzu7U8vqfdduuuut7jZbPEzv/O7t/+Jxx6T9+pm9cl0sw/3ypUrf3S+mP8f165eK5v1xjCYpF8loDAKeCqSrLUwhmDJ6Jst+VWikMAlw1oHY+0EUsi/awRqjmUGSskT9Jj14GPKApRYg2Ecp55YolT+DpFBKRlO64AQIlJOGIdxAjRKOW6JSs4TbCm/l4W1Fv16hb6XFooMIYQgrVUIGEKY0kQuBV3TwDce1lp07Qwhp/TgAw86EP2ds2fv/f6bWVnTTTpcQ0Tl4sWLb51vbf3Kenl022q5KswwDJ7AA+ktGQyC9x7OOThr4ZsGBAU6yKBtG1hrMY4jcsk6RJC8KrNfiXgpvmobxCil5kjBkOUQASKGtQ7eN0gxIKco178WVzUHxyD/PWn+jDEiJblp5M/K95lgzJJhrbRMQ7+Roo7kIBmSFpq2g288VkdLhBBAhtC2nQxPuGC2WMA5h5JLOnvPva4Y/vAD9z300Zt1yHSzKuYvfAHN3s7yn8USv+3qlavZGGNTjDo4l8pVUCMZ9fmmgbOS18gQOBcYd4wwtU2LpH+3bVvEEABmAT/qD2/qOE/zJ4CJmKE5lpiRcpL/nlmq45z0kOsvIWhVzcNyuxhwKQgxouhtUIuswgzS8WPKEv0xjhj7EcZYwboVvmQdSMjPKy+Dc/JS1/5Z0k1m71u+++6zYw782MPvePjXbkY+ppt1NV+9ev2HrDX//UsvvZitcxalIIQgqI9iwX3fo2kbeOd0liv5t2kaqTpJDsUaC+ccmraT3JgTvPcoChkWLmjbDm03k0FEziglIYQoV7qR3jnnjHHokVKe2q/6MtSiq6JaAGCd01sgT9Fc2zQuBcMYEHOSebSxCDEixTT9jEUPmyxhvVzDOoucC2JO2k6xAClZvqf1Dtvb2zhzyy04vHEAgMru3r657bbbfzPE+AceeeSR9evNx+5mHO6NGzc+GEL881euXMsEss4YjDFqfmSEEJBSkrYmJXhndahg4DSnWrIgsmgaP12BMS1l2B5l7ru9vY1uPoM1Dr5pJfJSPB7ka67vNxukGCSia9/LrONFg/of6/XvXTPlZankHRiQYYO+KATA61DDOonEWluULEVdyhmbzUbhc4bJWcl/AQwzvezeexhrUXLGZrXBdboKax1CiObGjetpb3fn0Xa2+GEi+rCyQ/LXPIIrDPn00083j5w796thDI8eHh6WxdbClJzQb3qUwgL4Q65GQwRjCMZaGIJg0Nr+yBhQkKt4Ath3zoHISC7MCW3TTg9HYEi5mi0JnJl11FdvDZTj0WHFs+UwSXtnofyEMOpNIKiVDrRQuAjPK0sLNYYAUuYIWHleOWEcR6nGAeSc0fe9MkfKhIjVdqttW6SUsBkGuZ5jwvb2FnzTwjvP3rvywIMPWZD9jx966KGffz1X9euJYENE+aWXXvqzxphHl0dH2VlrYwzoNxuJvFykkPIW824GBrBZr04UTJKDpcgRRKomUIEqnR4WgUwDk4xiwnEaPNRcy8THL432q4YsYBkWEK5VKSgoIOOUfCcVtLwoAlQYo4NKhTNzzghD7cdZq+oysTyMM2hcA+ssuvkCOSb0/QZEhJQSkCJKlBYsJ8G2x3GUvlrz/3w+R7/p5fe2lkIIdOnSJdx99uzf/rmf+7lvBbBiZnotVzW91qrZGFOuXr36doB+7cb1a11KiRigig7RCaYinQQMrLQ2TpiQcqhKibLOKiggD08inOCsm0D/SpeJMQg6pdcuUKk5wnfmXEAG02HUMWNW2LMeqpZj09Mg7V1Tkj5W0DIh7gFyG4SYJjhUop0RU4QhC2cdxjCi73uAC4ZhwGq1BkCIKSjRQIrDlORm6LoO88VC20aLnDJmW4t87uG3Wd+2f+n+++//oddaVZvXcUXDWfukc3Yec2IYopQSyEgLtLW9DUMWOk6CtQ5EBAPhVIEIOWUQjM56jbIeE0pJ09XLBQJjgqa2yjkL7xsYJ/nMew9rBPzw3sM6h6Zr9UWRazJFmSGTHrbVr2OthSXAKvAQtf2Z4FIr32trexu7p05hsbWF+bzDrG3QeKfYCiHHjNVqidVqKYVdDBj6ASVLhEr1LjcD5zIdNhnCZuhx/dp1rJYrWGex6TdYHhzSM5//LA/r1X/78X/1r24HUM6fP2++6hFc36SDg4Nvd879Xy+//DJSSraCBnXI3radAgL5+JCdVMdGpu/KWmTkooqD4wZoGhAQyQszwYXGoKQsudu76c/GEJBTkFqKhM1RB/wpxinSS07IXEA6LkyZwSVP7VxRPrXMhfM0JjSGQAyEGAEuyJlROEu0x4iUM5arNaBFZQVmolb9znv0vcCk4yCIWpEgEZjVyS21NV9ga2cLh4dL7Oxs5fvf+qDd3tn5kQceeuQHX0sUv5YILhcuXLDWmifGcbSj0lqcUmq44ATPuFampKhNi9Z7NM6hbTycNSj6v1dsmCBXsnMezjt0bQdn3StGfb5tlfQmLMuS0zSAkBlvEWBDSXiVw8UsRZR3DUASUXV+CyIdKwqSxmBY5wR+tBaNb2CsRdO0WhTaiegntwChbRt479B2rbzMRl7avh+wPFpJRR2CMDmNpIdhHBFCRFAINZWCzWYjI1PXmKtXr3Lf93/mE5/4xFteSxS/qiLrwoULVgur9+Wcv+3ixUvsjBRWSZ4RdnZ2QEQY+jUaHSA475QJKbhwKQzkApDi0PUqbDwIZmJypJxAMGCWYo0gUcxgRYUMTJJ7qOlalJwBPkaZctbhPip9Fui6DkSAcxY5JYzjAGaS2oBIAZMCZtJJlFTx9QYgEnJATHFCtnLOyFzQeI+xFDgi9DFis97AGIJvPGIUot84CDqXg0Cm4xBkagZGiEGnXA5N22LoB5rN5jnGuLu1tfWniehJZjZPPvnkVyeCH3/8cQaAWdd9OIYIQ1RIx6pFc2bOCZt+g5gyXNOgm3UKLVrBjFnxZLDAkl2HbjbDfD6feFUxCvJUUarj/ByFpZHS8ZWtlXgdDtRCqhZbRHJwhoQkJ8N8YXrI4KEmBYbSqqbHEvWBe28nrLr282RI2SEFMAZN26FtWjjfIJYis9+csO4HjGNAjBHr9RoxxamVYhbmCsAIIaJkxmq9Qj+MMpFKAYXZXLt2lQvjez/xiU/sEVF+NVFMr6ZyJqLy4osvfvN8Mf+VK5evNGBGTIEKSzFkDGkBJX9nZ3tbMGG5hyWPKae4QCgy1kqPa41FUuWAOUEAqMxHkLQ9JwcVQmxjJdklxYn5FYS5OjmS/yz1AGsbleLxwy4pAUSw3knvXI6r7BSDgDVaTVcqba32iQxyyTg6WmKz2WAYBvTjiDAMEqVjQBhHMI5Tkfzegpodv2Wio5q1HaxzmM1nuOuuuxFjzI88/LCdz7c+cs999/34q8nF7tUWZFuLrY+4xrUAUi7FEQloXk/EOquFkRN+MQv2jGmKRHKgGsUpRRitVC0z4jiiZNZDrowMiapajOQiL0LN80QGznr9bWQwn1NGBZutlaqd2B6zOozkUzICrNRWq+SMcRymIisGOdxS6vCiSBQylGAnhdRqs8YwymDiJJ8o56RYgD/B3JRbyloDhuD1ZM1U5Tsr8hhWQj4AXLlyhW+/s/mT58+f/4lXg2zZrzB6iYjKb/3Kr5w6dccdf2N5tNwbhoFSSuSdF82OjvSs9r0yp+UJQlRYSCtXpdkYaZ9qHvPWwDcNUk6wRob2tYWa6LS20mqt6pHsiYrbHCsZjIFrPGazGYx1cNYpkGFhnZVCixkpBQFAckZKI8IoiFaIETEExKCVuZF2TvpeUiAjTgCNoSqXwVQLWEv6Z1VFoaQAUgDFGguUAmMtUpa+v6hI3ViL02dOAcxYLldmvV7j9OlTtz74trf//J233/6FCxcu2KeeeopvVgQbZi7L5fKDxph71ut1GYbRbG0vpI0YtI2QcgY5JdiqPjBy2F6jWNAqksmROY5KAhBiQtc5zOeLV7IT9cUxOns1RqIf2gqVAqAoh8tbNLaDsXZiVVZOl8JvIjkJg0yUjmXB8jIag8Y5zGZznSQVBThkAEEwCBQmODVnodyGFDXahQLUth4xAOSBbIVD1hqLUjKWh0KOl+GDXI1O2z7vPYZBgJIrly9jb2cHMReEEMtmvfanb7nljwP4l7UeulkHzETEy9XqvwwxYhxG9t5hd2cXly5dFOZhztKvEsHPOpkBc4FlkZsY5RkTLIxIMSWncYYzBjByTZecQYXh2wa1MzaGYIzXm4CmfMEkzApDBNLUUKtdQYmyisUcjFHpaJF/wIB1HhbHWmGwmV6Eod/I4RMQU0JSKWmKEWEcpvl2/Z1LKWBnMZt1gmCNI7y1IAOkXGQUmTPGMGI2a5FzxqbvYSsc6wSQcdahmwkfbBhHXD84xGI+BxHRxUsXMVss/ujP/dzP/TUiOqqP4XVV0efPnzdEVC5dunR7SvEDhwcHKCwq+suXLqGiV857aXOI0PkGi/nWiVyioLsWTEWHD03bSE7lgpK1tVEuVtK+UBgdfrqGpVAjABZkHIyRPpQ0p1cYksjAWw+n+fdY5uLRNB262VxnsR5N11WlP1KMGIceMQl5buh7pBBATGi9Ry4JhQHnGoEmFT3ruhaL+QK729voug6ztkM36wSiDFF64fUGvVbVwxDQNC262UxmzVm0ycMYpheRIPVBSgH90Jtr167lFMM999xzzwcB4OMf/7h93VV0rdguX778+Gw2u/Diiy+WnLIZx156Sn3w9cqpSoXZbD6Rzo01Oh5knShZMKQ4Mlo5WutEqaA/klXajnUO3ndTVX0sDaWJg1XBDcm9Tme9RUaGhZErQd4YxDAKWa6iVCfGmFlzZ2HJqTnL/14nQkaHG5Xt2W82glmrHgqF4bzFjYND9H0PZsZq02Oz3rxCj5xzlqkUSMeiUbjdVSOlv6x3FiFE7J/aR0wJs3aW3vmOd7jdvb2/9ei7f9+f/0qqafcq2qRv0wPjXETm0TSNtCpTO1MmWo1UfzRJOouVilfYk0DOBFfnq0aq4AIBC0hp8FWbW6kx031Emu8njhWOhwwlI06cLCWfc5l4W/VmAJmJl51yJQEYMDI4F4Qi2HXRPNk0Xq9+me/mlOCaBvPFAjkrsS4mkJFbJ6WMMUaACLP5TAckaRolCifimNQn7EvpPMiKa9N6M2pOHjCfL5BSNDcObqCbzf/A44+fbwDE15WDmZmMMfnvnj/fWWvfPwwjuBQS6qrBOMpQXa5iQX10CDZVlmQcQhxBIHjrJ8ZF27qp8k4xTFyoFKPAfwoH0qR5qDN7nvrTCnFKDswIYVDedBR8WSUnrPPYrAJuidIElmGU3CrOKeGeYb1HY2c6IBH2ZApC87GadtqmgVcqUQxaATuLkhO6WYedsgPnHVKK2Gx6FAb6zaDoHCFlj5wrklb79TQVhaSvMxFhHANm3QxkiA4PD3HmzJl3/tATH7qHiD7z5WbFXy6CiZn5Oz784TsBvG29XtU+fepBuYiaoIquChd4MmC9unPKqrwTtKuEUXvOgFISACM9cxLWhvMeSAIH5mQFDzbHpUKVlJ7MLoWFO5UnDw6ervIagZXrXAEFzpUrfYyF56S4J9FUeVdpqWu80H6q1IX5eGigr6F3HtS0aLuC3d0dcCm4ceNARqDM6NoWwzBoYMgocb1aSUHVDwhjUKowTa4EKQldSdgnltbrdTHGzo7GzXsBfObLpVn3leToEPJ75/PFPKVUuBRjDCGlMsVWYQZyAtgI26IyGLSHxaTlBQrLWM5aocqC6RXRyDkj5QIWYAm+NJLjnZ8YH/WkiUk5TpofjQEXQgEjFeE9V40SGQMYyavyhpqJOy2jSyHTWSNEORixWqoGLBW1EuqrsETbdo7F1o5wtHS+DWaMo7Q5y8MD+MbDlIISE2ZdK4Gg39MSMCy2wGWF4rMqEgX4IfBkMBN19DifzTGOYxnCYE6dOf1eAH/vphzwqVO7v180tVwYbIpWxCHGKeoKiY0CSgEMwXq5YiWZHv8UVtEpqOykSkyqij8pSsWKisUQNIotjMpb6jXCJ+BIMUkJIvpWBmXJWcXifGybpNFpiLRHxwQuWOcnloUQ5ovAmpCRYsppKsZEgeHkpdCfP0YhzB8eHGC5XOJouULOcq2nJAK4UgoyM3KMSCnDNw1ms5lOxixK28jvE5PSiQgpCfAyXwDWWHN0eISdnb23P/7445Wv9e9sl77cATMAhJTucKWq2SVXECB01LHA54yCgrZpjwfqzqNtW8zmc2EuKuXVgBBzwjj0E+9KelooqiXXqPft1F9KtRsV7rT6Ulh56MrVkjZLUSZ90eoLUCHGUopObjSh61VfyQRkDHJMU2Rb5wDFnblyqpoGrXHwjUdKGcO4mUjtpTC8t0gpwjcei8UM600R5qUqIXLK2GzWWK43k90TWQOyhLhJ8I3YSJimUekOphpCRpOOhnFATuld58+f3yWi64o0vroI1r+Un3nmmY5LeedqMyDnYogImpnkWmQoXYUQYwSYYJ1BVvhxvVxia3sb1jeIQQ4qqx0CxGFsYkWCj9WF9YW01k19bKW75sQgr4p6nRGTMXBGJlZU5JByzipjkReDjFwldTxJes6l5Cn6JjeAmnpEPyEjT40TcdgB2rYFDKHf9DDGoGs8YhxRWLjQg7ZKY4wIw4CU5BY4PDzEZiPFldGfOUaZCaccEWJCyQVN04gIQBkqXBi2sRj6AUSmSyntArj+xBNPvOYIxv7+vfOcb+wPQw9jiKRXVOZDyWh8IwzGXEBMsN5qFMmDst5jDAFG9T7iY1V9IuVgROXgEcMIgp2AeVLc9sRbJwJsK8N7Vk8schYif2LELBU0T4MIlc3UqlRBl6peAGSwYQuDKCHrLFi4Uxa+dVojyNRLyo2IqLNk55zmesYYBmw2G/R9jxBGHC1XGMcBIUQZ7I9BvgYYXdcAIKxWawFYlJ2JLFV9N+/ke8YI3zTCBBkHbG0tKKfM4zi2y9X6rQCeefvb306vJQcTAL58+TP7Ozs785xFRRfGAVmv6KLkdlLNkHEGSELXsd5qf3fiIjQG5oRnBtHxIIJLQdN0ExBg6/wYMoskomnCVGUu1jrFthlcBKCQ4KJjeo9e+ZUAUAvyqjeuArOpPjfHCJgQ4KTvHYaNmKqRQc5y0CEE5MLw1iLGgM0ow4pxHLBZy9iwnPAJMdagsYJw9ZsNVsuVgigM7x2slZfUipRFLzaaii9rRNjmnOOUIu3u7p3ROf2rL7KeeuopAoDd3d3bmXlRVQhTPBGhm80VgSk6EZIrpG1bkYdkkX4iY/phK3ghaZIVDPEw1okzThZFoNVmf7Iq1BlxrnmWjKBZOuyXwb5DSXGyC5avI3Nmo1czM45FaGAY58Rvw0pLZq30wzEE1S7rtW0I3XwOYsZqJUMFMWPLGDZrxJQwjANGnUBJFItMhUuGlYkCcmYcHRwhpAgyFovZbAJ1NpuNqBhVbSEC1soMFe2xjDJnnFOA93bxmoGO+lZ0XbeXUqZSMqcUyRrpcdu2E0uhFJELoWssum6GUgrWm800YKg9cH1IzvpJgSe8Ka+RxjAkD1zaqup+kyba60RtNTTBk9PwoI7iVGoKzcGVp1UBEzJA49tJTE6GUFKCdSKGG8cRzKKHarsOYZT+1PoGpPPipmkx9IPg1iGIz1aSYioMI8ZhQNt1aBuHo8MjYXgakjTgRUNci7+oUGUYR6ltDE2eYKz655SSIGk6GAnjiBQT+r7ff93TJNe6TosVLiVT5TeNYZQ2pL7xzMh5JUgVEXIVcBHDKU3WKEYcY8BsNkc3m4tR6ESxsWicVT1QmvInnTxdzaMpBSG/aYRXP0lWYZh4ahnkQnCwKhhnIRZYcdYpOWPsB00joyBLwyDgQiNDiRgDYgpqcZjEfGUchZddKjRLSEgoTYOubRXxcuj7jU6dtDDyBrNZh5AS4hjF4oHlJsulwJKBabzcfAykkkATDzzDdO6YDVIy1uv1mdd9wCWWruLM3vlJCppCkEixmPBkJq2Cy3ExY4xF03VTnm6aBmRkNpwUcK/z2FzyZEFI1RaB3eRBKYMN0RQb54RnRaLFzYiinFYYtfbHlUVSWPHpELRqTsfIVhWFVVcBZmzWG6yOVsIRS8L4kAgfkHOB9zIJC+OIlDPaVootocMKc4MJaNoZSs5oO5lRj+OITd9LxOeEnEQ1KS4E8nK6xsuNZs3kVyKCN4nu1rfQIfhC8+nrOGCipvKa6xtbqTS+aSc6jPYbGIZRVQlWfikiDH0PMkKwSzHBWJ7oLJzzCZ9mASZI1Q8EI7+0OabeWmNRMokEBQqy1KpZQRbRE0X1puSJO11ymdSArGSBKjed+uCcwJYRjFyDnHTqZQz6zQacC5pGbo4UpQc3xiHEgM16rRxuC+MaeBQ0rQXIYL1cYdNvxPLBOhAyQhh1VixtUYziJiQ2EFnaT2OUnSqAB0txUW+jmeZTfs0HbC1M1iZ/DEJvMeRgGz+5vlWr3RrJxlp0sw6lFKzWKzjvNT8C7D3CKkwC6SptseoTmcmAElT1p/ivQqAyWx0nl1nhOgugkVQ4xpmVqVFQETdnLKL6RTvfyPWvRuFTL6odwTgMWgge98MEIIZxkroGvXlIhXSVCDDfmsOSRYhJ9E9qLJ7yOPlfivCbsVjMJG30ArVaa9FZi34QzlelMUFBIBHwCfdaJLMFzqkj6usaF2YkkBDMUcQhpmlaGFXyrTebydSzlAJ4CyrAer0BFxYSOB2PDY+OjiZGv3UWRoujqtQnUjhRo3Kqpq2DIWAMo6ZiAzhCGQcYfTmKwpSlSN/qGwvftCCGIGdOD1TNRFNS09EghU7hAtc0oi9OGZzSMWlPfTgkP7eKoslL5bzHXtdhHAYwEVorOTfGOIEdIpcxICooRSZEWztbiLn29QWbTa+2TiJ5bW0j5EAvhWijCo8QU23z8us+YGYerXNqiuJgC2Pv1B7WqzX6zVorWGlHhHPMKEZaHec1XxqHbjZTU7IoDEiIvVCtfFnNxlCqaK3qfeVrhDAilySmYhA1Ya7keWSNdommRv/+JO+sFodJGIzVnLSSf2wjbJSKmNXBfzJGQYYMEGsfTGgaj1KElakWQIDOwlOqfOsC4gLvnagKiYAMJGZYSxiHiI47zGczhBBwcHCIUhg7Ozto2w79eq3qRcUDdFJGRkzWmrZBTmX8csSNL3vAxpgA5R81vkHbtWJQkuI0EC86gy2qQOhmbup3x3Gc+rfFYoHZbI5xUKuDUoCUJhmpIQvnrcxRo7QHPEV4gdUKW1SAmvpJmZiV2qrlAGc6HkSoacpE6wWBLJ0osI4Zj4zjPtsaC3IWYRzQ+FZsJ2qLVTJSSEhZgJCgSz6yHrCxBt6JRDYbuc69c1iv1+hXa61n5OUeByHwzecz/R0ZZC2ca2BVhup0Nl1diRrfgAxuvO4IHoZhUJMQqlLO9XqNknkqjrgUNG2Dft0jcUS0FhEQdEaNwiJHHB4dwulgvbC0AjCEMYSJ7M3MiGPUANdhA7IYnEG4ytVgpVJoSo6TPsr5RguxpMUIYFjw5KLFYGVRVBStmpnWSVGl1lgtbubzLXjfqFseNDoVKlH/TN39A+clXYQ4ouhL42cdem3HqnWDdQ7r1RoFDNc6mGAwn8/Q9z3GcUTbNpgvtlTcltHO2slPzLsGDKBt20uv54AZAI6Ojm7s7OwUKUQtO98QY6V2gMegvHcN3I7TvKY6XhwbeVbMlsjAWoJ3kuustWhbq3mOwUQ6SkxgNiBnpsE3UZrmx6z9sG8aVSqKrYN1VlqQlDR6pUItk8W/VNKlollK23EKdFSW40lVRMkZQ5YKmEuBb1tk7YkFuiwYxxGjugQQgK3FNspMPDsODq5jHMaJoemsWA2HIuzLOMpIceh7eTEB9JseMUTM5wsYa7BerbCzs43ZbA7vPBERGtdde+0H/MQTNYJf3tvbXTnndhrXqNeylJht2yCEEaS9aKPeT1UP1HWdHszx/NZNbEopAK1R4rqVStbqChzXNChJHdu1SKkRoGGEpu0AshOxL+ekw/iaz0v1Ipj4eaIHal7B5qgvGqtwLSUxVyFDyKpcrHsicoro+w1mc/Wm3Kyx3qxVJRjQD4Oajrbidpcy1v1G2BqG1LY4T260WiKj7weQkRduGEZYVUP0m7UwTTVtjMOI0hRq2hb92N9QWPk1HTDjySfRdd0BF94YY3esqv5qVHrfom0ChnEUCYgOtZ21SGD0w2ZSvRMMwNK/hTFiHMMrLAproVWtHayq+ivUySzf2+s8OGuFW/++NTQxL+oQIanIuqJf08jRGHGNVcpR5jK5yxYlBUyisKEXIXedUytkeHD9GsiIwdpqtdQpk2DeKUWs1yvEGBUSldtgvdqojwdNZIYYE1glAyWJnRODMJ/PJwpwThlN19RbhQ1ZssaG+f7+ZwDgU5/6FL9qXjQRMTPTT/3UTx2lnH+361qQscV6J/2fvvkyhDb6YNRQu/pWseDGqYj7ukg9oqrby6S5yidYjUKIo2nDiZiIllfMcItKW7z3ots9wdqo/6AUceNxldynQ/lcEEPEEAaEEJTUnjEMg0yChh7D0GOz2WC5XIogTkmAopYoGFNCTAXL5QrjMChlAGASCeg4jiIqgzyjMI5Yr9dYb3ohO4SA5dGR2Eg5p9OpY/5Ytaio219m85k4G9gTqQw8vOXM/dckFp/g18SLrsaiy+Xh38mpfN8wDKlpG3fj+jWRa4QgAMgwAqpc6PsNggqmrLGTo51vBOxovOTh+kKI3kijXDnTTdsqdUZoQQyB8I7BEWmvvG8mUCJXqYuO5QCaZCcVsUqKKdfpTeVXjapHMopOgaBEASnmKlWnFmIpF5W5RvSbjeDVUbFlvUFq5b5erbBar6eXmFkONYYAMmIj0ffiO+28QwoRZA0a5ydsYD6fA0TY39tD13Wlm83M7bfd8au/8H9//A888cQTWbH61zbwB4Dlsv/dxWKOTb8hYw129/YxDAMuX74ET9JDipVugPducmOvxmMpM8qgM96ShRstsA6YgcY3089HBPSrFWKKaBr1k1KLB6P5ufKXxnGYaLNi8CJC86S+WhN3q1SlRJnMSquCgAF03QxhDAiKVhEImROyHm7QCROUQ13J8lFvAFYXu6ZpxfBt6CeedD8Mkm+zlIW5ZIS+lw0vpWAYot5GDlEr+MYK5ixFqbycTdeiazukXMr2zq7Z3d//zSeffDI99thjDkB6rW2SVinln4/jUHIuZhgGdG2HWTdD27QoqmyPUbRI3onVQeVBEbEYaQOiFMgjTEw4feoUnPeqRhS6zxBGLagE8gxB+NTGWTjfTgZpUFYFF0y6pMKMEkdhWGoer9yqqNVvvQG8t1r4CaEuBpGpVElqQZn62xyTmotXX0s+lqjmpOQ96c/HlBDDiFFtGYoOO7jIC0CqiTLqZhBChLPieFuyEO6NNTJQUCgYzHCN4ApkLEpMZtZ2YC6/DACPPfYYv54+mDWJf/Zd73rXc/PZ7L71Zl2cc6bvNwLgJ3kHmqYR/ydngcLoFjMMmx4MHdGdsF4wOos1REgqH/Heom38tC4HmoNzyTAMMIfjFThEMKh+GXbiY6eQdV+DtCN1SpRyBqkPljV2kpGUEjXXKWSpawNYdbyC0vHkAJBPLNpC5ZKREB2S2iyZao3sGBYMeCcOttpNtG0zudeKWZukDuFmCZ3JNw3m87lMrnRBlzHiXt12nSmFlznjl79c/v2yB6yFliGiw5cvXvyNpm3vO1wuOSrJfLPZwDqL1CcsthZom0b9MFQ/m7Mcpj4o7/x0jREBMScZppPBqDwp66xGDJ8gzDNIqaxV2V+lm8eWR0rpmVbX8TRTbn2j6vwkslEl49WKnSGKjFwyOEawFpEg6cMZAUXptVV+Mt/akmIqilVF1fsaY9EWWauTc0a/6RFCEovEVirqFEfpw4v286qnEsWEGMwIKyaDS1TLKoe2nTEA8t5/8gd+4AdeqLrt16tNIjXk/GXXtd9VcsZmvYFvPAozhtUGxtKkUWrbFjZloczeNsNquaqyCwXxE3IRMH0YBlUbFr3GGZyy+mUc64Gdd7qVjFV1UCZ7RLk5M/KkBlA7XzUFr0pDsTpKEyHANc1kqyTXqIwVrfpZOd9gNp9hvVohkwWzUGya1qqiIYjmuZHiKKeEoELyVk3GU0ow1mA+6xC1g5BpnNQSTeeVHAiEYVAlpVGWJmF/dw8hCtvjzC23gqwprW9MO5v/81/6pV9KKuB/feKz2kTnnH8lp5yYiy2MSdpJVmwL+mHArJthebTEzs42whiwv7+Ptu0wDkJEqwdQZ7P1360lGTJYI1GjFsJi7Y9pV6FXo9KYIrJaIJg6MpzsBaU1sySTIxCJudm0vzALSwIkY0UAjZL01+v11OIREeIoY8Gm7V5h3ta2M9T1e847bDa93D5kMFt0uHbtOowhzLpOohxJSA4MJIiE1XsnPtOj9OpOcWtB3YBhDDg8PAQZg+2dHQCEq5cum4cfeQQ7851/DgBPP/00fUXR+ZVYOHzoQx8yH/3oj//60dHRNx0cHJT5bG6MNbh67ZrINYYRt91+K8IwYjP02NvbhXces9kczjsc3DjQaILOZR3atsVms4HTgzJOVA5iVioHUDeOAgRnjHhkNY0OOkQwnVW0NTnBE02Kx0pwLzljUEZoHajzZJdwLDkp004IYX1UO2Gjdk916/g4BkXP8oRpHx4eYuh7hJREVsMy25UbQQrP9XoNkMzRxYU3ommaCUsQAn3B7s72tMdie2cby6NVOX36jHnr/Q98erVeP/rBD35wuGkuO7Ufvnbt2g+C8MPPPvNMAcPsnzqF5dES6/VKhtclY29vT8XTAbO57GhYLLYwn8/UHCWp9a4UHQLtiZC6IlO1Wq6Tk7pXUAzI/ASw1AebS5mUDFNfrHZKJ9zBxa8qxImIJ55aUZkSxxKYpAdbedvjOGC1XGEYB5QiIjIiQt+LPni+WODK5SvIOWE2n6FrO8SUcOP6Naw34lcto0YoU0OLOX3RrbXoN706vyfMZzPZPuOcmKYBaNsuP/LIOXvbHXf+D29729v+ylfqtPOV6oMLAFxdrf7xXtv+JW/dXkiRj46OyDuHmKLmroRLly9hR1XuXHR3EFbyy89moqpXVuXQDzBWCO81ImtrwMrh6mYzpc4aWCUWyCw4g1nZlMYKpFsYKZXJm6MqHqBYeBx5MnPJKSHmqJh6ixBHbNYbMMtmlNqvxpRkwM6M2WyG7e1tUQUul+q1FXD1ygYgYL61QAwJ19bXhdGiqWVvb0uMxoO0kqvVGiEmGCfjSy6M+WyG+XyGcRzgrTzTsNkg54L5Ys5N4631fizW/syXw59fl0/W1UtXfnY9rL/j8uXLmXNx3XyGcRixXB6qyyxNWzrbrsPOzrYOyIGZmqLV8VzXtujmM5TCGIYNSj6WrHjvdAnWsWQlhFEMTumYKFfBCqNz4VfsiNC+lyv3asLRWSt7URCGGAHIlKlpWzCAMA5yW1gSo1Mv056DGzfQ9/2kWnROdL6b9Ub76YCiP9dqtUbbdZjPWiwPj3B4dCSiOiOF43QNg7DZrLFe92DOeptJVZ1Swaxr89l77jX33PfAv/z0o49+4FNPPMFf6cLpV3PAYt1/6dIfg8HPfPoznyvWWsOKuDRtg4svv4yYIrxzUsVqVX3rrbdI2V+qLS/gfSMH7pxylvP041jV61T7/RCjsiJYZSVJoEudWmFykJWXwlrSfrpMxuHOC81mHEWfnLL4ccQYJ/cfaf+khfKNV6A/KY+ZsVwtZZhPYkrq1Jmvyk+O6b+EoI73suXtUBd39Mhq7NK2LfZ2ttEPg1pFyO7GVsEfr1V+CCPativvevTd5u577v7e++574KdejRHaqzlgAoDf+I3fcG95yx3/4saNg/9gebTMw9DbYRyxtdjC3v4OXnrxJW1jMI3gmsbj1KlTaBqvdr3SKnQzWU7Ztu3kMTVJPJX/FdVPozrE1rxa191UK0Wj6wEqkc7pHiYzudgSgjrW5ZynA6l+IHXhhrXysg5DjzAGUS3mMnlIjykh9AN297axWq2xXq7gGok4mQvLGgDo3oixH8Rx1xCMFVrtZr3Wh1pksmRkubVzDrNZN/XCwzCilFLOnDlD993/4Gfuve/9777zTvQVo7ipTncKetj3vOc98dKlSz+8vbX91HJ5RM45NFywXB4hZ7FfGPKoGtesLjoZ165f0z5WsWcGrl+P4i29tYW2a8VGSRn/1XD7eDIlRL226yYPS9H0iiRV0LF0LCcZRrRNg8Z7JP0aFY6vq95rlFdCu3UOrbXo1xshrZ8g8vXDgEEPS6i6Ikrf299HiBKdYs5G05LLnDKMs0hjwjgG5LieZKjHLvOygRyq33LOyUY3BYOc93znnW8xW4utj77lLbR5tZbCr9bSvzAzfeYzn/k/txaLT+3u7r59s+kLejJCAg9aBfPEGQY6vZK9cLN0T8HW1pYUMEEIZDFFrFcb4WRZh929vVcslmy7Ds57BB2sV0hxjOMkET32BTFovNBa6iSnMgactcdsDRbJSSWWl5SwjEGvb93ToDVmCBGz+Rxt08A4qwoIwbA3m0GGC+lYjRFDhDE0ucvWpVhV8G5sQU48WVdUu+KcC6wjWN8hFy77+6fM1s7upf3Tp39ab9FXtbvhNRuCX752+U/EIfyDl156sTCL6n/Y9JM6YBwGlWZIH+u9FwKeGo8aY9B1rRh/dS22t7dhvcN6uRKb+1mnm81oUv0d5zkcWy2Q6o7KF1n6g6foIz3ceqdlRa/qzt9QF2Kx/G9CxYG65STVI8ntshl6DJt+uuqdt1okBsQk/KmgCzeLigHI0LRaR+blZdIZJTVSb72HU4iybVt45xFjzOfe/k576vSZP/fOd77zb78WQ/BXvZSDiDIz09NPP/3Uww8/+JHd7d33X7txLeeUbdM26Pt+ijprDFLOGEcRNkueNMc7C5TfG2LApu/FIUBzZr8uk7FplYIatfurhVOVtNT9vkb5CymHyVxcHOKT7l5qhA3KQpBnrxV1Eq63zHiFQCgTK4E2Q4pYbzbHHh05if1DkJ5WSAx5wqpTLdyqnUTmqQWMMcKSQTvrRBVZ9zPRMX2pFa/ofMutt5nF1tZvbW1tfbQa0n3VLf1PRvELzz33h1zjf+HZ557Nxlg7bNbq2Cb5Y72SYiKEcaLLzLoOTSsQXgUS7HToELf3OlNW0N7X3Qgko0PWry/b0Sp1h9Q/SzlWzoknRhLbhmEUR5uieHb1jwaJX5dzFpvNBuM4Cu4Nybt1XaxXiUwYZHVsjLJhNOeiC7LytNM4xIgSZXWAIZqEb1WG7ptmcgCs3G3ftugaUTRmGSvmd3/zN9u9/b3vOnfunf/4tS7leE1rdTSKLRH9s5dffuknTp8682eu37ie29nMptUKzAWzbg7vG+SUsFoJ6byiTyUntF077QY2eqXWtx5J9zu0HsRiMVStFyjJ1dyoj9as60RSo5zswgVxjFiv1ohq0W+N5nDndbu4mrWNYtoSY8I4pikCQxRPrKTm3dZahGE4YVyWp33DJcvKHFahekxlWqFnldqb9KCtQrDHch2l3xiL+Xwu7SUzcsr5oYcesm3X/aNz5975j6vT/ms5q9ezN6kwM/3mb/7KXzm9f9d3EuhOGBTnvBmGEQMNmM/ncGrQuVyuxPdRUaY6UpXtJ9JmWCficYJ4XDgl1MseJfkzra9zYIdBndHr9XZ4eCSbt8fx2AJCVwiEMWA+myGmiM1qmK7WukwEhlSXZNUOuUzymhgTolL3uGDCi6MuwoR6ZDJDhx6iBGQ2U/XPx37CcE50VqTdgnUyriRj4Ywpu7u7Zm//9I3FYue/Y2b6cjPfm35Ff/FV/eKLL/4XRPj7n/vcZ5P33h0cyPr2tm1hjMVsPkcMARcvvoxh6MGFdX5rVIXYymSKgVtuvUV4XqMM4q2zosdNCfunTomqIiobkYAUIsYQ+MyZ07DGHvNjCchRRpMVbeUszvHVoK0iZEW5VjACW/brDVIWNopYFx7bJyV9OZP6dBQ+/jM171v1lS6qX6o4uVXiXF0UEnRji28aUX3MF2Dm9Mi5c+7Mmdu+54EHHvjpCxcu2A996EP5DTlgdcIjIiovv/ziT63W6+++dPFS5lLs0ZFEkyGaMNyUEg4PDnB0dKgmn1lWrSpttA4AtrYW2N8/jflcHGFBwPXr17FZrbFcrWGcmZz1SKO3ylZO/kIpH9vuA4AzlaqDyQi0ut++AsrkMtGDq5WwRDtP7dZkNaxcr6QzaLIkLM1xEAJ/Ksfcaz3YpmnBzBgGWf+3vbON+WKBlEp65JFH3JlbbvuJc+fOfd/NWDF7s9bL4saNGzt93//61atXH+j7ddlsNkagOdlsttiag/SwiQj9ZsDVq5dV5sm6qTNPubb1jQ4nOjhvJ2G39x7Xr9+Q6lnpPseIlCBZwk+Wgsxr7yxXpYjE6hbvSjnKOSEW0RTX4ZMUhjgm2sU0VfMoopSIMYnns6FJ7hlixDAMExlhWghiRAhgjYHzgpSBBR9YbG+hpFJuue1Wc99bH/id7e2z33bvvXtHuAmbwG/Kguh6jXzh85///fD+Fy9futSNYQAB5uhoifVmdUw018jgwtjZ3cF8PkdMCdevXlcDNTdFpxbOUtSkhN3dXWwtFrhx42Ci3Vrtj4E60JdbYLG1mIxQqsWgd25SFIhIPE87HLLOg7PysOs8uTCjaRpEdfUjbXVCCBjDiBgiMovysFbYTuWmMSehDjsZWjjr0LUNUpKqum2bCnCUxWJOZ++5b7O1PX/fO9/5zb95M3YH37QDVnNq98EPfjA999xz39M0/u9++jOfTtYYO5vNaL1aY+g32PRCdXHOTa6qUmR5sUVyDk3j0StDQiQnajOkLAgxeskYxhG33nobQhjQrzfTlVwPpV7BIFYvL1kxH5VMPqhCspq3VFcgOSBhdQ6j0GKrAZrzDjkX9Jth8gMRlX61aFL5aSnw1iq/Wn6NWkx676bcb61H0zTs26Y88sg5u7u3990PP/y2v/d1t+L9i4uu55555klY+mu//anfTl3buOrr7L0yLw0hhCi6m5IxDmESfdelWEZthwmkpHk1cdG8W9RuKWaZRYNFAVAJ5rXvPGl0GqPsXQrheOhAoMmaqWm8bnUpaoHkpiEEa4SPIUybvStwUYl/OQt+LjPnmlZIl4cYtF2jODpUzG1hnEnnzr3d7ext/+Db3/5NP3IzD/f1tklfqj8u+gOef/6F52+/7957v++zn/1MaprGhXGE80GticK0W1AqbeEwd10Ha40YoKxXsGQxX8wnE/DCEg3CkxKOU9N6MEh4xNbh8PBAyHBFVYUsCzgMKotTQAtZqWNEeqK5nUjNzZiRckFMg25jSdM6grpyr+5qYq3bi66Ir5tiiAwKpBawU+4Wmlw36+B9wyHG/NDDj7gzt976ww8++PCPfPzjH3dElG7qmeAmf+riaCIqzz33zE/0m/5Pf/azn0kgciEIE7GyHca+132BWQngHmEYkVmWTFVMNuWE+WyO+dYCRweH8I3Tfrlu1bZYLpc60AhThR5jAJGkAK83g1ythBQD6u7AlJI4xqrfprA90mRLwbr/NqcCo2ZsUa0ZucoelcddWaC1M6i7lRrdYDoJzgunt73jHe6WW2/96Fvf+uCHtY4p+DJLNt7wAz55yE8//bS5996z/+t6vf6vX3zhxRRTtP0wUNs0ysMSoH61OhJim+40MkTIXNQg26DxQnBHkeWNhYt4b6kMiyrkaC28lz0HxhrMum5a11Q4ywayEMQzMiehrxpMm0dRhCsWVT5qzHGPXKdBlTGSkuwOri4BxooFojmhm5bBvWiydvf2EMYRQ4g8n83zgw886G65/Y6fuP/++7//qaeeoscff7y83or5a3bAJ9snIuJnn/38j6WYPvLc88/ncRwNmKmbdSgpw1hCLiwWRXws6pb8J1ivDASS+GD4RgcLtQflYx+7E9LPpvEYBlHxGWMBKpiMq7X9EYe5+Aq/jphksC+SVCgMqtW8yjlD0MWUajTunNdVQXYyZqsTNC4FW1tbUpz1A2/tbPPb3vZ2s7d/+sfvv//+j5w/f9488cQT/NU43Jueg7+U/PT8+fPm3nvf+t88++yzl86evffJSxdfwnq9KmEMpnpsOWuxs7OtD60yIiXCfCeFWU6i7ykqO4ExurZdKtgxDJOYOmflVtX9giWrTKRMh1R3OUALIKjRmuXq3m4RwqCTojSJwKR944l5sr29DWgPLLlZBiR1hcBsPteWKeczt56xd911lnZ2d+tWb3Mzet03JIK/VE5++YWXv2eM/Y9dvXpl/sILL+QYoy0KaVbph/PHNgrDZi1CNL3KrQqw6tJlybE02TBVJQRzgW+aSf0Xxyh02CRisajDAignepof52Ne2Dj0GMZh4laTEVg1xHC8jdzZaVBSK3XnnO5jElw9xoSUcrrzjjvcLbfdvjx16+3f98B99/1D7XP5Zufcr1kEn4zk2iffcdcdP/Xc5z732dOnb/m7TdM+8MILL+QQgkkpUXUPODwQNv/p06ewtb0t1gZk0LZ22s1AbYMwjji1fwpchJRu6y5DVf+HMKLxC/TDAAMhwRV1kRXDFnNsvqIelawLumLOxxbG2hLllNHMGrgiBAWwTMjYVkdc+f9t22GxmMOKbSETET/00ENu//Qtv7W3t/8nz549+6+/GtXyGxbBXwoM+eQn/8Wtp87c/WP9uv+uF154Huv1OscQbFJb/hAiZrMOZ06fntYB1FXqMQlbYhwDGu91G4qsfa9WSdUxFoqe1Y2nQStsIQXSRH21usTaWtEwhZhUrCYWDBUd843QeJvGy7CCZeLk1I3H6A006zqAKG9tLexdd5/Fzt7+T7f+9h+47779g/oMvlbP/Gt6wCdhTQC4/PLLf3LVb3748PDg9IsvvpiHTU+5FFM9Grumwabf6CBfLrM6++VJZC6/hVM2RM2zQm+liY/FiohZayY556SvUji0ukjLAmo7mbGJJlkWXDVtg/VypRCmm3wspw7A2DKfz3DPPfea/dOnLu5s7/yFu+++93//4t/939sD/uK8/Mwzz9w7m7X/0+HR8o9ffPll3Lh2PTMKlcKmqhdWyxViCljMxfovK7rknMUwjFq1WsxnMymST2xicapFHocBqfC0Ni4rSc8pfSjreruU01T4VdzcGotuIv0FUUOqtNU5D99YlMLFWMu33XKbve3223Hmtjv+t8Vs9pdvu+22ixcuXLBfrTbo6/KAvxjaBICXXnrpu1JKf3WzXr3r+S88j/VqnUvJJsdA1nssl7JsczafTV5ZOSYUFMnTzCrjFHvDon10ikmWP8YgaFIVmCsiZqoTgLY9VQhX7YyJKq1HdxCr673RfY0AlWEY+NTp0/bee+/D9s7ur83ni796zz33/PwX/45vxMe9kQd8ch/9nXfe+TMXLlz42fe///3ff9bYP9dvNne//NIXcKPvc2am+XxhxPlmNVkbiiOtg5vIfeF4GK+Umvp/uRy708nkyR6DEoou2epiw8LWFNK+bj6xfvK/NNZxKaXknGixtWUefOhh7OztPdO1s7/1N//m3/zYxz72sXiiBcpv6DPG18nn5Jt+cHCwf3h4+P2r1fIj4zDcdfHiy7h67RqP41i4MDWNN8aQMP91hiy2xgVW/bamlbYlT3sLUXgaDNSemll2Lxrddlr9sMTLw6viL6sjji8wxN45e/r0GZy+5RbM5ovf3tvZ+WgI4acfeuiho6+HqP26POATDBFTH86P/uiPnn7f+973X3Ep351TfHcuGRcvXcLVy1eYCJlkuCt0JkPTYODYn+M4OotuCOfC6tAT1Ly7rvVRLpayNAsYKSYGUWl8g/libvf29rG7tw/rbNzd2flF380/9rlPf/pnv/M7v3M8cbA3HU/+9+mATxZh5kQUmE984l9/IGf+zwj0h3NOD6cUcXR4iIMbBxjGATHExAI0mCDqhFp7kzmxDk9AlaIyUeE/p5g5xsBShSdmwUxt13Z0xx134MyZM7I+p2k/2bbun6zX4z/5lm/5lk+cvH0AvCFF1DfkAZ886Kefftqe7Bvvuuuu2cc+9rHfd+rU3n8ya7v3DGP/rVzKbikF6/Uaq5VYCMomsQAuIiKWUaPhWmCJgzyoaVsz6zoiljGec1aYH2RA1hzt75/65XEcfy2l8k+/9Vu/9d9MSLa+hF+vB/sNccAnf84LFy6Yxx9/HF+c2379d3/9zPLl5SNnzpx5z2azescYxt+/mM0XzLyIYbzVN36iCFWxmdFiigFE2YG8bLr2xtCPQ0npEzt72588vHb4b7b3/Se++Zs/cOXk42IuVoun8g3x4PCN96ELFy6YW265hR577LH8paKHme1TTz11an9//94777z1zGy23XSdt1TI5pzJeF+Qc7l+eJguvvDC8oWLF59nvufF7/3e/6/vBTObp59+2jz22GPla4Edv/n5Etf4hQsXLDM7zYWv9+sZZnb6Nekb/fnQv6fnTsyMp556ytQNbl/Kcuixxx7jp556Cp/61Kf4ySeffDM63/y8+Xnz8+bnzc+bnzc/b37e/Hxln/8XZE4GHwrnhREAAAAASUVORK5CYII=',
  'data:image/png;base64,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',
];
const EARTH_PLANET_IMG='data:image/png;base64,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';
const VAAR_BN=['রবি','সোম','মঙ্গল','বুধ','বৃহস্পতি','শুক্র','শনি'];
// HM/VM are indexed by sidereal SOLAR sign at the moment that sign is
// ENTERED during a lunation (Mesha=0 ... Meena=11). Rule (Amanta): "the
// lunation in which Mesha Sankranti occurs is Chaitra" — i.e. the
// lunation during which the Sun enters Mesha is named Chaitra, the one
// during which it enters Vrishabha is Vaishakha, and so on.
//
// This mapping was exhaustively re-verified against exact, authoritative
// Sankranti timestamps (not approximate dates) after an earlier attempt
// to "fix" this array turned out to itself be based on a UTC/local-time
// misreading:
//   - Mesha Sankranti 2026: confirmed exact moment Apr 14 04:09 UTC
//     (Apr 13 11:09 PM in Houston's UTC-5) -> sunLongSid = 0.03° at that
//     instant, confirming sign index 0 = Mesha.
//   - Mithuna Sankranti 2026: confirmed exact moment Jul 16 07:29 UTC
//     (12:59 PM IST) -> sunLongSid = 89.6° at that instant, confirming
//     sign index 2 = Mithuna (about to cross into 90°).
//   - Full March 2026 panchang grid confirmed "Amanta Month: Chaitra" for
//     the period containing Mar 19 (Pratipada Shukla / Hindu New Year),
//     and the LUNATION containing the Mesha Sankranti (which starts at
//     that Mar 19 new moon) is the one labeled Chaitra.
// Forward-chaining the engine's own (now-confirmed-correct) lunation
// math from that verified Mar 19 boundary reproduces every other
// month name correctly: Apr17-May16=Vaishakha, Jun15-Jul14=Jyeshtha, etc.
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
// Amanta month name: determined by which solar Sankranti (sign-entry)
// occurs WITHIN the current lunation (new-moon to new-moon), not by the
// Sun's instantaneous sign at `jd`. These regularly differ — e.g. just
// after a new moon but before that lunation's Sankranti has happened yet,
// the Sun is still in the PREVIOUS sign, but the lunar month has already
// advanced. Reading the instant sign alone (the old implementation) gave
// wrong month names in exactly that window.
//
// Rule (classical Amanta definition, verified against Drik Panchang's
// exact Sankranti timestamps and a full confirmed month grid): the
// lunation during which the Sun enters Mesha is Chaitra, the one during
// which it enters Vrishabha is Vaishakha, etc. — HM[signEnteredDuringLunation].
// A lunation with NO sign-entry at all (the Sun stays within one sign for
// the whole lunation) is Adhik Maas — see adhikMaas(), which already
// detects this case; hinduMonth() itself does not need to special-case it
// because every regular (non-Adhik) lunation has exactly one Sankranti by
// construction, so the lookup below always finds one for those.
//
// SAME-DAY AMAVASYA CASE: per Gaudiya/ISKCON panchang convention (verified
// against a real reference: May 6 1997, an Amavasya day, is listed as
// "Vaishakha Krishna Amavasya" even though the exact new-moon moment that
// day doesn't occur until 8:48 PM) — the whole calendar day on which
// Amavasya falls is attributed to the month beginning right after it, not
// the one ending that day. A flat tiny epsilon nudge (the "+.0001" pattern
// used elsewhere in this file) is NOT enough here: the actual new-moon
// moment can be many hours after the reference time being tested, so a
// sub-second nudge still lands in the outgoing lunation. Instead, when
// `jd`'s tithi is Amavasya, search forward to that Amavasya's own end
// before computing the lunation.
function hinduMonth(jd){
  let refJD = jd;
  if(tithiIdx(jd) === 29){
    const amavasyaEnd = findElong(jd, jd+2, 0); // elong wraps to 0 at next new moon
    refJD = amavasyaEnd + 0.0001;
  }
  const lEnd = nextNewMoon(refJD);
  const sE = sunLongSid(lEnd);
  const idx = Math.floor(sE/30) % 12;
  return {name:HM[idx], vaishnavName:VM[idx]};
}
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
  // Adhik Maas takes the name of the FOLLOWING Nija month, not the sign
  // the Adhik lunation itself ends in. E.g. the 2026 Adhik lunation
  // (May16-Jun15) ends with the Sun in Vrishabha (sign 1, "Vaishakha" in
  // HM[]), but the Adhik month is correctly called "Adhik Jyeshtha"
  // (confirmed via Drik Panchang) — i.e. one sign further, HM[sign+1].
  return{isAdhik,nextMonthName:HM[(Math.floor(sE/30)+1)%12],isPurushottam:isAdhik};
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
  const _VL=['Surya (Ravi)','Chandra (Soma)','Mangala (Bhauma)','Budha','Brihaspati (Guru)','Shukra','Shani'];
  const _NL=['Ashwini','Bharani','Krittika','Rohini','Mrigashira','Ardra','Punarvasu','Pushya','Ashlesha','Magha','Purva Phalguni','Uttara Phalguni','Hasta','Chitra','Swati','Vishakha','Anuradha','Jyeshtha','Mula','Purva Ashadha','Uttara Ashadha','Shravana','Dhanishtha','Shatabhisha','Purva Bhadrapada','Uttara Bhadrapada','Revati'];
  if(vaarIdx===0&&nakIdx===7)r.push({name:'Ravi Pushya Yoga',symbol:'☀️',desc:`${_VL[0]} + Pushya — extremely auspicious`,...t});
  if(vaarIdx===4&&nakIdx===7)r.push({name:'Guru Pushya Yoga',symbol:'🪔',desc:`${_VL[4]} + Pushya — highly auspicious`,...t});
  const sc=SARV.find(([d])=>d===vaarIdx);if(sc&&sc[1].includes(nakIdx)){r.push({name:'Sarvartha Siddhi Yoga',symbol:'🌺',desc:`Favorable for accomplishing all goals (${_VL[vaarIdx]||''} + ${_NL[nakIdx]||''})`,...t});}
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
  document.getElementById('vp-vaar-name').textContent=(VAAR_ICON[displayVaar.index]||'')+' '+displayVaar.name+' Vaar';
  document.getElementById('vp-month-line').innerHTML=
    (headerAM.isAdhik?`<span class="vp-adhik-badge">${headerAM.isPurushottam?'Purushottam':'Adhik'}</span>${headerAM.nextMonthName}`:headerHM.name)+
    ' &nbsp;·&nbsp; '+headerPaksha+' Paksha &nbsp;·&nbsp; '+headerWhen+' '+fmtDate(headerRef);
  document.getElementById('vp-vaishnav-line').textContent=
    headerAM.isAdhik ? 'Purushottam Maas (Adhik) — most spiritually potent month' :
    'Vaishnav Month of '+headerHM.vaishnavName;

  // Personal horoscope card (opt-in) — async, self-caching; safe to call
  // on every renderAll() pass since it no-ops fast when already loaded.
  vpPersonalRender();

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
    // Rabi(0)=Sun(Surya), Mangol(2)=Mars, Budh(3)=Mercury,
    // Brihaspati(4)=Jupiter, Sukro(5)=Venus, Shani(6)=Saturn.
    // Som(1)=Moon(Chandra) is handled separately below — it orbits EARTH,
    // not the Sun, so it isn't part of this table.
    // Distance order (closest→farthest from Sun): Mercury, Venus, Earth, Mars, Jupiter, Saturn
    const PLANET_INFO = {
      3: { au: 0.39,  spd: 26.3, self: 38.7 },  // Mercury — closest, fastest
      5: { au: 0.72,  spd: 18.9, self: 23.6 },  // Venus
      7: { au: 1.00,  spd: 13.4, self: 17.2 },  // Earth
      2: { au: 1.52,  spd: 11.2, self: 19.4 },  // Mars
      4: { au: 5.20,  spd: 6.1,  self: 15.8 },  // Jupiter
      6: { au: 9.58,  spd: 3.9,  self: 12.2 },  // Saturn — farthest, slowest
    };

    // The Moon orbits the EARTH, not the Sun — small fixed radius around
    // wherever Earth currently is, fast enough to visibly circle it within
    // a few seconds (real life: ~13.4 lunar orbits per Earth solar orbit;
    // moonSpd:earthSpd below is deliberately even faster than that ratio
    // purely for visual legibility on a small dial).
    const MOON_INFO = { r: 28, spd: 95, self: 30 };
    const MOON_NODE_HALF = 12; // half of the 24px moon node (see CSS) — for centering offsets

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
    const INNER_R = Math.max(54, dialR * 0.34); // clears the Sun's corona
    const MAX_R   = dialR - (NODE_D/2) - 12;     // stays inside the dial, room for label

    const orderedIdx = Object.keys(PLANET_INFO)
      .map(k=>parseInt(k))
      .sort((a,b)=>PLANET_INFO[a].au - PLANET_INFO[b].au); // closest first

    const step = (MAX_R - INNER_R) / (orderedIdx.length - 1);
    orderedIdx.forEach((vi, i)=>{
      PLANET_INFO[vi].r = INNER_R + i * step;
    });

    // Stable, spread starting angles (only used the FIRST time we build)
    const START_ANG = { 2:52, 3:104, 4:156, 5:208, 6:260 };
    const MOON_START_ANG = 15;

    // Persistent state survives across renderAll() calls
    if(!window._vpOrbit){
      window._vpOrbit = {
        built:false,
        planets:{}, // vaarIdx -> {orbitAng, selfAng}
        moon: { orbitAng: MOON_START_ANG, selfAng: 0 }, // orbits Earth, not the Sun
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

      // Earth — populate image/radius once (no vaar in vaarStrip)
      const earthArm = orbitWrap.querySelector('.vp-planet-arm[data-vaar="7"]');
      if(earthArm){
        const eImg = earthArm.querySelector('.vp-planet-img');
        if(eImg){ eImg.src = EARTH_PLANET_IMG; eImg.alt='Earth'; }
        const eNode = earthArm.querySelector('.vp-planet-node');
        if(eNode){ eNode.title='Earth'; eNode.style.cursor='default'; eNode.onclick=null; }
      }

      // Moon — its own arm, NOT part of the PLANET_INFO build loop above,
      // since it orbits Earth's live position rather than a fixed radius
      // from the Sun (handled in the tick loop below).
      const moonWrap = document.createElement('div');
      moonWrap.className = 'vp-planet-arm';
      moonWrap.setAttribute('data-vaar', '1');
      moonWrap.innerHTML = `<div class="vp-planet-node vp-moon-node" data-vaar="1"
          onclick="vpSelectVaar(1)">
          <img class="vp-planet-img" src="" alt="" draggable="false">
          <span class="vp-planet-day-label"></span>
        </div>`;
      centerEl2.insertAdjacentElement('beforebegin', moonWrap);

      // Orbit ring guides — one per radius, drawn once. The Moon has no
      // guide ring here since its orbit is centered on Earth, which itself
      // moves — a static ring around the Sun wouldn't represent it.
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
      const info = PLANET_INFO[v.index] || (v.index===1 ? MOON_INFO : null);
      if(!info) return;
      const armEl = orbitWrap.querySelector(`.vp-planet-arm[data-vaar="${v.index}"]`);
      if(!armEl) return;
      const node = armEl.querySelector('.vp-planet-node');
      const img  = armEl.querySelector('.vp-planet-img');
      const label= armEl.querySelector('.vp-planet-day-label');

      let nodeCls = v.index===1 ? 'vp-planet-node vp-moon-node' : 'vp-planet-node';
      if(v.isActive) nodeCls += ' today';
      if(selectedVaarIdx!==null && v.index===selectedVaarIdx) nodeCls += ' selected';
      node.className = nodeCls;
      node.setAttribute('data-vaar', v.index);
      node.title = `${v.name} Vaar`;

      const dayLabel = v.dayOffset===0?'Today':v.dayOffset===1?'Tmrw':v.dayOffset===-1?'Yest':
        v.dayOffset>0?'+'+v.dayOffset+'d':v.dayOffset+'d';
      label.textContent = '';
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
    // Earth: not in vaarStrip — push its info to arm directly
    (function(){
      const eArm = orbitWrap.querySelector('.vp-planet-arm[data-vaar="7"]');
      const eInfo = PLANET_INFO[7];
      if(eArm && eInfo){ eArm._vpRadius=eInfo.r; eArm._vpOrbitSpd=eInfo.spd; eArm._vpSelfSpd=eInfo.self; }
    })();

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

    // Rabi Vaar (Sunday, index 0) lives at the Sun center — keep it
    // tappable and show today / selected state so it behaves identically
    // to the orbit-ring planets (pulse when today is Sunday, highlight
    // when selected).
    const centerElRabi = document.getElementById('vp-orbit-center');
    if(centerElRabi){
      centerElRabi.classList.toggle('rabi-today',    activeVaarIdx  === 0);
      centerElRabi.classList.toggle('rabi-selected', selectedVaarIdx === 0);
    }

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

      // Each planet orbiting the Sun directly (Mercury, Venus, Earth, Mars,
      // Jupiter, Saturn). The Moon (data-vaar="1") is excluded here — it has
      // no entry in S.planets — and handled separately right below, where
      // it orbits Earth's just-computed position instead.
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

        if(vi === 7){ S.earthPx = px; S.earthPy = py; } // remember for the Moon, below
      });

      // ── Moon — circles the EARTH, not the Sun ─────────────────────
      // Centered on Earth's position computed just above (one rAF frame
      // "stale" at most, which at 60fps is visually imperceptible).
      const moonArm = wrap.querySelector('.vp-planet-arm[data-vaar="1"]');
      if(moonArm && S.moon && typeof S.earthPx === 'number'){
        const moonSpd  = moonArm._vpOrbitSpd || 90;
        const moonSelf = moonArm._vpSelfSpd  || 30;
        const moonR    = moonArm._vpRadius   || 28;

        S.moon.orbitAng = (S.moon.orbitAng + moonSpd*dt) % 360;
        S.moon.selfAng  = (S.moon.selfAng  + moonSelf*dt) % 360;

        const mrad = S.moon.orbitAng * Math.PI/180;
        const mpx = S.earthPx + Math.cos(mrad)*moonR;
        const mpy = S.earthPy + Math.sin(mrad)*moonR;

        const mnode = moonArm.querySelector('.vp-planet-node');
        if(mnode){
          mnode.style.left = (mpx - MOON_NODE_HALF) + 'px';
          mnode.style.top  = (mpy - MOON_NODE_HALF) + 'px';
        }
        const mimg = moonArm.querySelector('.vp-planet-img');
        if(mimg) mimg.style.transform = `rotate(${S.moon.selfAng}deg)`;

        const mlabel = moonArm.querySelector('.vp-planet-day-label');
        if(mlabel) mlabel.style.transform = `translateX(-50%) rotate(${-S.moon.orbitAng}deg)`;
      }

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

  // Hindu month / Vaishnav month / Gaurabda — same info shown on the main
  // page header, so the date-picker result is consistent with it.
  const hmEl = document.getElementById('vp-dateresult-hindu-month');
  if(hmEl){
    const am = adhikMaas(jd);
    const hm = hinduMonth(jd);
    const paksha = tithiIdx(jd) < 15 ? 'Sukla' : 'Krishna';
    const vaishnavLabel = am.isAdhik ? 'Purushottam Maas (Adhik)' : 'Vaishnav Month of ' + hm.vaishnavName;
    hmEl.innerHTML =
      (am.isAdhik ? `<span class="vp-adhik-badge">${am.isPurushottam?'Purushottam':'Adhik'}</span>${am.nextMonthName}` : hm.name) +
      ' &nbsp;·&nbsp; ' + paksha + ' Paksha &nbsp;·&nbsp; ' + vaishnavLabel +
      ' &nbsp;·&nbsp; Gaurabda ' + gaurabda(noon);
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

  // Tara Bala for this date — only if user has a saved birth profile
  const taraWrap = document.getElementById('vp-dr-tara-wrap');
  if(taraWrap){
    const p = _vpPersonalProfile;
    if(p && typeof p.nakshatraIndex === 'number'){
      const dayNakIdx = nakTL.current.index;
      const tara = vpPersonalTaraBala(p, dayNakIdx);
      const taraClass = tara.polarity === 'good' ? 'good' : tara.polarity === 'bad' ? 'bad' : 'neutral';
      const paksha = profile => profile.tithiIndex < 15 ? 'Sukla' : 'Krishna';
      taraWrap.style.display = 'block';
      taraWrap.innerHTML = `<div class="vp-dr-tara-card vp-tara-${taraClass}">
        <div class="vp-dr-tara-head">⭐ Tara Bala — Your Personal Star Balance</div>
        <div class="vp-dr-tara-row">
          <span class="vp-dr-tara-label">Birth Nakshatra</span>
          <span class="vp-dr-tara-val">${p.nakshatraName}</span>
        </div>
        <div class="vp-dr-tara-row">
          <span class="vp-dr-tara-label">Day Nakshatra</span>
          <span class="vp-dr-tara-val">${nakTL.current.name}</span>
        </div>
        <div class="vp-dr-tara-name vp-tara-name-${taraClass}">${tara.emoji||''} ${tara.name}</div>
        <div class="vp-dr-tara-note">${tara.note}</div>
      </div>`;
    } else {
      taraWrap.style.display = 'none';
    }
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
  const titleEl = document.getElementById('vp-horo-modal-title');
  if(titleEl) titleEl.textContent = '🪐 Janmo Tithin & Rashi Calculator';
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

// "Your Rashi" entry point — pre-fills the horoscope modal from the
// saved birth profile (if one exists) and relabels it for personal use.
function vpHoroOpenMine(){
  vpHoroOpen(); // sets defaults, opens overlay
  const titleEl = document.getElementById('vp-horo-modal-title');
  if(titleEl) titleEl.textContent = '🌕 Your Janmo Tithin & Rashi';
  // Pre-fill from saved profile when available
  if(_vpPersonalProfile && _vpPersonalProfile.dob){
    const dateEl = document.getElementById('vp-horo-date');
    const timeEl = document.getElementById('vp-horo-time');
    const latEl  = document.getElementById('vp-horo-lat');
    const lngEl  = document.getElementById('vp-horo-lng');
    if(dateEl) dateEl.value = _vpPersonalProfile.dob;
    if(timeEl && _vpPersonalProfile.tob) timeEl.value = _vpPersonalProfile.tob;
    if(latEl && typeof _vpPersonalProfile.lat === 'number') latEl.value = _vpPersonalProfile.lat.toFixed(4);
    if(lngEl && typeof _vpPersonalProfile.lng === 'number') lngEl.value = _vpPersonalProfile.lng.toFixed(4);
  }
}
function vpHoroClose(){
  const overlay = document.getElementById('vp-horo-overlay');
  if(overlay) overlay.classList.remove('open');
}
function vpHoroCloseBackdrop(e){
  // Full-screen page: only close via the explicit ✕ / Cancel buttons.
  return;
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

  // Hindu month / Vaishnav month / Gaurabda for the birth date — same fix
  // applied to the date-picker result above, for consistency.
  const horoHmEl = document.getElementById('vp-horo-result-hindu-month');
  if(horoHmEl){
    const am = adhikMaas(jd);
    const hm = hinduMonth(jd);
    const paksha = tithiIdx(jd) < 15 ? 'Sukla' : 'Krishna';
    const horoVaishnavLabel = am.isAdhik ? 'Purushottam Maas (Adhik)' : 'Vaishnav Month of ' + hm.vaishnavName;
    horoHmEl.innerHTML =
      (am.isAdhik ? `<span class="vp-adhik-badge">${am.isPurushottam?'Purushottam':'Adhik'}</span>${am.nextMonthName}` : hm.name) +
      ' &nbsp;·&nbsp; ' + paksha + ' Paksha &nbsp;·&nbsp; ' + horoVaishnavLabel +
      ' &nbsp;·&nbsp; Gaurabda ' + gaurabda(birthDate);
  }

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

// ══════════════════════════════════════════════════════════════
// PERSONAL HOROSCOPE — opt-in, additive layer
//
// Builds on the engine functions already defined above in this same
// scope (dateToJD, moonLong, sunLong, moonLongSid, norm, findElong,
// NAKSHATRA[], TITHI[]). Persistence goes through window.vpFirestore,
// the narrow bridge exposed by app.js (see app.js for why a bridge is
// needed instead of reaching fbDb directly).
//
// Nothing here is shown unless the user explicitly saves a birth
// profile AND turns the personalization toggle on — see vpPersonalRender().
// ══════════════════════════════════════════════════════════════

const RASHI = ['Mesha','Vrishabha','Mithuna','Karka','Simha','Kanya',
  'Tula','Vrishchika','Dhanu','Makara','Kumbha','Meena'];
const RASHI_LORD = ['Mars','Venus','Mercury','Moon','Sun','Mercury',
  'Venus','Mars','Jupiter','Saturn','Saturn','Jupiter'];
// Classical ishta-devata commonly associated with each Rashi (Moon sign).
const RASHI_DEITY = ['Hanuman','Lakshmi','Krishna (Radha-Krishna)','Chandra/Durga',
  'Surya','Vishnu','Lakshmi','Durga/Kartikeya','Brihaspati (Guru)',
  'Shani/Hanuman','Shani/Varuna','Vishnu/Brihaspati'];
// 27-Nakshatra ruling deities (classical list).
const NAKSHATRA_DEITY = ['Ashwini Kumaras','Yama','Agni','Brahma','Chandra',
  'Rudra','Aditi','Brihaspati','Naga (Sarpa)','Pitru (Ancestors)','Bhaga',
  'Aryaman','Savitar','Tvashtar','Vayu','Indra-Agni','Mitra','Indra',
  'Nirriti','Apah (Water)','Vishvadevas','Vishnu','Vasu (8 Vasus)',
  'Varuna','Aja Ekapada','Ahirbudhnya','Pushan'];
// Vimshottari Dasha lord cycle, index-aligned to NAKSHATRA[] (27 entries,
// repeating the classical 9-graha Ashwini-cycle three times).
const NAK_LORD_CYCLE = ['Ketu','Venus','Sun','Moon','Mars','Rahu','Jupiter','Saturn','Mercury'];
function nakLord(nakshatraIndex){ return NAK_LORD_CYCLE[nakshatraIndex % 9]; }

// Index-aligned to VAAR = ['Rabi','Som','Mangol','Budh','Brihaspati','Sukro','Shani']
const VAAR_LORD = ['Sun','Moon','Mars','Mercury','Jupiter','Venus','Saturn'];

// Classical graha-maitri (simplified to 3 states), symmetric for our use.
const FRIENDSHIP = {
  Sun:     {Sun:'own', Moon:'friend', Mars:'friend', Mercury:'neutral', Jupiter:'friend', Venus:'enemy', Saturn:'enemy'},
  Moon:    {Sun:'friend', Moon:'own', Mars:'neutral', Mercury:'friend', Jupiter:'neutral', Venus:'neutral', Saturn:'neutral'},
  Mars:    {Sun:'friend', Moon:'friend', Mars:'own', Mercury:'enemy', Jupiter:'friend', Venus:'neutral', Saturn:'neutral'},
  Mercury: {Sun:'neutral', Moon:'enemy', Mars:'neutral', Mercury:'own', Jupiter:'neutral', Venus:'friend', Saturn:'neutral'},
  Jupiter: {Sun:'friend', Moon:'friend', Mars:'friend', Mercury:'enemy', Jupiter:'own', Venus:'enemy', Saturn:'neutral'},
  Venus:   {Sun:'enemy', Moon:'neutral', Mars:'neutral', Mercury:'friend', Jupiter:'enemy', Venus:'own', Saturn:'friend'},
  Saturn:  {Sun:'enemy', Moon:'neutral', Mars:'neutral', Mercury:'neutral', Jupiter:'neutral', Venus:'friend', Saturn:'own'},
};

// Tara Bala (9-fold count from birth Nakshatra), classical names + polarity.
const TARA = [
  {name:'Janma Tara',     emoji:'🌟', polarity:'caution', note:'Self-tara — proceed mindfully, avoid starting risky ventures'},
  {name:'Sampat Tara',    emoji:'💰', polarity:'good',    note:'Wealth & gain favored'},
  {name:'Vipat Tara',     emoji:'⚠️', polarity:'bad',     note:'Danger tara — avoid travel & new starts'},
  {name:'Kshema Tara',    emoji:'🛡️', polarity:'good',    note:'Well-being & safety favored'},
  {name:'Pratyak Tara',   emoji:'🚧', polarity:'bad',     note:'Obstacle tara — expect delays'},
  {name:'Sadhaka Tara',   emoji:'🎯', polarity:'good',    note:'Goal-accomplishing — favorable for important tasks'},
  {name:'Vadha Tara',     emoji:'🗡️', polarity:'bad',     note:'Harm tara — avoid risky or confrontational activity'},
  {name:'Mitra Tara',     emoji:'🤝', polarity:'good',    note:'Friendly tara — good for relationships & cooperation'},
  {name:'Ati-Mitra Tara', emoji:'💞', polarity:'good',    note:'Highly friendly — auspicious for most activities'},
];


function vpPersonalJdFromForm(dateStr, timeStr){
  const [y, mo, da] = dateStr.split('-').map(Number);
  const [hh, mi] = (timeStr || '12:00').split(':').map(Number);
  return dateToJD(new Date(y, mo-1, da, hh||0, mi||0, 0));
}

// Compute Rashi + Nakshatra + Pada + birth-Tithi from birth moment.
// Sidereal (Lahiri) longitude is used for Rashi/Nakshatra, matching how
// this engine already computes Nakshatra elsewhere (moonLongSid). Tithi
// uses the tropical Moon-Sun elongation, matching tithiIdx()'s own
// definition — tithi is a synodic measure, not a sidereal-sign measure,
// so mixing the two here would silently miscount it.
function vpPersonalComputeProfile(dateStr, timeStr, lat, lng){
  const jd = vpPersonalJdFromForm(dateStr, timeStr);
  const moonSid = moonLongSid(jd);
  const rashiIndex = Math.floor(moonSid/30)%12;
  const nakSpan = 360/27;
  const nakshatraIndex = Math.floor(moonSid/nakSpan)%27;
  const withinNak = moonSid - nakshatraIndex*nakSpan;
  const nakshatraPada = Math.floor(withinNak/(nakSpan/4))+1;
  const elong = norm(moonLong(jd)-sunLong(jd));
  const tithiIndex = Math.floor(elong/12);

  // Birth Yoga (sum of sidereal moon + sun longitude divided into 27)
  const birthYogaSum = norm(moonLongSid(jd) + sunLongSid(jd));
  const birthYogaIndex = Math.floor(birthYogaSum / (360/27)) % 27;
  const birthYogaName = YOGA_N[birthYogaIndex];

  // Birth Karana (half-tithi)
  const birthHalfTithi = Math.floor(elong / 6);
  const birthKaranaName = karName(birthHalfTithi);

  // Birth Hindu (lunar) month — needed so the Vedic Janmotithi search below
  // can require BOTH "same Tithi" AND "same lunar month" (e.g. Vaishakh
  // Krishna Amavasya), which is what actually recurs once a year. Matching
  // Tithi alone recurs roughly every 29.5 days, which is wrong for a
  // birthday and was the bug reported — this field fixes that.
  const birthAdhik = adhikMaas(jd);
  const birthHM = hinduMonth(jd);
  const birthMonthName = birthAdhik.isAdhik ? birthAdhik.nextMonthName : birthHM.name;

  return {
    dob: dateStr, tob: timeStr||'12:00', lat, lng,
    rashiIndex, rashiName: RASHI[rashiIndex], rashiLord: RASHI_LORD[rashiIndex],
    nakshatraIndex, nakshatraName: NAKSHATRA[nakshatraIndex], nakshatraPada,
    tithiIndex, tithiName: TITHI[tithiIndex],
    birthYogaIndex, birthYogaName,
    birthKaranaName,
    birthMonthName, birthMonthWasAdhik: birthAdhik.isAdhik,
    enabled: false,
  };
}

// Shared scan: finds the first Janmotithi occurrence (birth Tithi WITHIN
// THE SAME HINDU MONTH as birth — e.g. "Vaishakh Krishna Amavasya" — the
// actual Vedic Janmotithi) at or after `searchStartJD`. This is a once-a-
// year event, unlike matching Tithi alone (which recurs roughly every
// 29.5 days and was the bug previously reported: the app was showing next
// month's matching Tithi as if it were the birthday).
//
// Scans forward in ~one-lunar-month steps using the same findElong()
// bisection the rest of this engine relies on, but only accepts a
// candidate whose Hindu month name ALSO matches the birth month.
// `guardLimit` bounds how many lunar months ahead to look (the caller
// picks this based on how wide a span it needs to cover) so it safely
// spans a year even when an Adhik Maas (leap month) falls in between and
// shifts month names for a few weeks.
//
// Used both for "the next upcoming Janmotithi" (search starts today) and
// for "the Janmotithi in a specific year" (search starts a little before
// 1 Jan of that year) — same matching rules, different starting point.
function vpPersonalScanJanmotithi(profile, searchStartJD, guardLimit){
  const targetDeg = profile.tithiIndex*12;
  // Use birth lat/lng for sunrise calculation if available, else fall back to
  // current display location (LAT/LNG).
  const obsLat = (profile && typeof profile.lat === 'number') ? profile.lat : LAT;
  const obsLng = (profile && typeof profile.lng === 'number') ? profile.lng : LNG;
  let windowStart = searchStartJD;
  for(let guard=0; guard<guardLimit; guard++){
    const windowEnd = windowStart + 31;
    const candidate = findElong(windowStart, windowEnd, targetDeg);
    // findElong's bisection can converge a hair below the true boundary
    // due to floating-point precision; nudge forward before reading any
    // index off the candidate (see getTithiPeriods' own "+.0001" pattern
    // elsewhere in this file for the same class of fix).
    const checkJD = candidate + 0.0001;
    const idx = Math.floor(norm(moonLong(checkJD)-sunLong(checkJD))/12);
    if(candidate > windowStart-1 && idx === profile.tithiIndex){
      const am = adhikMaas(checkJD);
      const hm = hinduMonth(checkJD);
      const monthName = am.isAdhik ? am.nextMonthName : hm.name;
      if(monthName === profile.birthMonthName){
        // ── SUNRISE RULE (Vaishnava/Smarta convention) ──────────────────
        // The Janmotithi is observed on the civil day whose LOCAL SUNRISE
        // falls within this tithi's span — NOT simply the calendar date on
        // which the tithi begins.
        //
        // Example: Amavasya begins at 6:49 PM on 5 May 2027. Sunrise on
        // 5 May is ~5:30 AM — BEFORE Amavasya starts, so 5 May is excluded.
        // On 6 May, sunrise (~5:30 AM) falls inside Amavasya (active until
        // 5:00 PM that day), so 6 May is the correct Janmotithi date.
        //
        // Algorithm: find the tithi's end JD, then walk candidate-day and
        // candidate+1-day and pick the one whose sunrise is inside the
        // [tithiStart, tithiEnd) window.
        // ────────────────────────────────────────────────────────────────

        // Tithi-end: next elongation crossing (targetDeg + 12 mod 360)
        const nextDeg = (targetDeg + 12) % 360;
        const tithiEndJD = findElong(checkJD, checkJD + 3, nextDeg);

        // Check sunrise on the tithi-start civil day AND the following day.
        // "Civil day" here = the UTC calendar date of the candidate instant.
        let observanceDate = jdToDate(candidate); // fallback
        let observanceJD   = candidate;
        for(let offset = 0; offset <= 1; offset++){
          const testDate = jdToDate(candidate + offset);
          // Build a noon-ish Date on that calendar day to anchor SunCalc
          const testNoon = new Date(testDate.getFullYear(), testDate.getMonth(), testDate.getDate(), 12, 0, 0);
          const sunTimes = SunCalc.getTimes(testNoon, obsLat, obsLng);
          const srJD = dateToJD(sunTimes.sunrise);
          // Sunrise must fall on or after the tithi start AND before the tithi end
          if(srJD >= candidate && srJD < tithiEndJD){
            observanceDate = new Date(testDate.getFullYear(), testDate.getMonth(), testDate.getDate(), 6, 0, 0);
            observanceJD   = srJD;
            break;
          }
        }

        return { jd: observanceJD, date: observanceDate, monthName, wasAdhik: am.isAdhik };
      }
      // Tithi matched but wrong month (e.g. this month's matching Tithi,
      // not the birth month's) — keep searching forward.
    }
    windowStart += 29.4;
  }
  return null; // fail safe — caller shows "could not be determined" rather than a wrong date
}

// Next occurrence of the Vedic Janmotithi from today (or from `fromJD` if
// given). Search extends up to ~14 lunar months ahead so it safely spans
// a year even across an Adhik Maas shift.
function vpPersonalNextJanmotithi(profile, fromJD){
  if(!profile || typeof profile.tithiIndex !== 'number' || !profile.birthMonthName) return null;
  const startSearch = (fromJD || dateToJD(new Date())) + 1;
  return vpPersonalScanJanmotithi(profile, startSearch, 14);
}

// Janmotithi occurrence falling within a SPECIFIC Gregorian year — past,
// current, or future — not just the next upcoming one. Starts the same
// scan ~60 days before 1 Jan of the requested year (so an occurrence that
// lands in Jan/Feb, before the birth-month's Tithi cycle "catches up", is
// not missed) and runs it far enough forward to safely clear 31 Dec.
//
// Because an Adhik Maas can occasionally nudge the match a few days past
// a year boundary, if the first match found isn't actually dated in the
// requested year, the scan is resumed just past it (bounded retries) —
// this keeps the result strictly "the Janmotithi dated in year Y", not
// merely "the next one found after some date".
function vpPersonalJanmotithiForYear(profile, year){
  if(!profile || typeof profile.tithiIndex !== 'number' || !profile.birthMonthName) return null;
  const yearStartJD = dateToJD(new Date(year, 0, 1));
  let result = vpPersonalScanJanmotithi(profile, yearStartJD - 60, 18);
  let retries = 0;
  while(result && result.date.getFullYear() !== year && retries < 3){
    result = vpPersonalScanJanmotithi(profile, result.jd + 1, 18);
    retries++;
  }
  if(!result || result.date.getFullYear() !== year) return null;
  return result;
}

function vpPersonalTaraBala(profile, todayNakIndex){
  const diff = ((todayNakIndex - profile.nakshatraIndex)%27+27)%27;
  return TARA[diff%9];
}

// Scans forward day-by-day (using the Nakshatra active at local noon each
// day, consistent with how getNakshatraPeriods reports "today's" Nakshatra
// elsewhere in this file) to find the next `count` days whose Tara Bala
// from the birth Nakshatra is 'good'. Bounded to `maxDays` so it can't
// run away; returns whatever it found within that window (possibly fewer
// than `count`).
function vpPersonalUpcomingGoodTaraDays(profile, fromJD, count, maxDays){
  // Use exact nakshatra boundaries; also include Chandra Bala at the window start.
  const results = [];
  const limitJD  = fromJD + maxDays;
  const nakPeriods = getNakshatraPeriods(fromJD - 0.5, count * 8 + 6);
  for(const p of nakPeriods){
    if(results.length >= count) break;
    if(p.endJD <= fromJD) continue;       // already ended
    if(p.startJD >= limitJD) break;       // beyond scan window
    const tara = vpPersonalTaraBala(profile, p.index);
    if(tara.polarity === 'good'){
      const isActive  = p.startJD <= fromJD;
      const showDate  = isActive ? jdToDate(fromJD) : jdToDate(p.startJD);
      const sampleJD  = isActive ? fromJD : p.startJD;
      const rashiIdx  = Math.floor(moonLongSid(sampleJD) / 30) % 12;
      const chandra   = vpPersonalChandraBala(profile, rashiIdx);
      results.push({ jd: p.startJD, date: showDate, endJD: p.endJD, tara, chandra, isActive });
    }
  }
  return results;
}

// ══════════════════════════════════════════════════════════════
// CHANDRA BALA — Moon's positional strength from Janma Rashi
// Position = ((currentRashiIdx - birthRashiIdx + 12) % 12) + 1
// Classical Muhurta: Good = 1,3,6,7,10,11  |  Bad = 2,4,5,8,9,12
// ══════════════════════════════════════════════════════════════
const CHANDRA_BALA_DATA = [
  null, // placeholder so index 1 = position 1
  {pos:1,  name:'Janma (1st)',      emoji:'🌑', polarity:'neutral', note:'Moon in birth sign — moderate, introspective energy'},
  {pos:2,  name:'Vipat (2nd)',      emoji:'🌪️', polarity:'bad',     note:'Drains resources; strained expression'},
  {pos:3,  name:'Kshema (3rd)',     emoji:'🍀', polarity:'good',    note:'Courage & enterprise — good for effort and initiative'},
  {pos:4,  name:'Pratyak (4th)',    emoji:'⛈️', polarity:'bad',     note:'Emotional restlessness; avoid domestic disputes'},
  {pos:5,  name:'Sadhana (5th)',    emoji:'🌀', polarity:'bad',     note:'Conflicts of intention; creative blocks'},
  {pos:6,  name:'Naidhana (6th)',   emoji:'🛠️', polarity:'good',    note:'Overcoming obstacles; health & service supported'},
  {pos:7,  name:'Mitra (7th)',      emoji:'🤝', polarity:'good',    note:'Balanced energy — favors partnerships & agreements'},
  {pos:8,  name:'Ashtama (8th)',    emoji:'💀', polarity:'bad',     note:'Ashtama Chandra — avoid major changes; transformation period'},
  {pos:9,  name:'Param Mitra (9th)',emoji:'✨', polarity:'good',    note:'Fortune & dharma — auspicious for important undertakings'},
  {pos:10, name:'Karma (10th)',     emoji:'🏆', polarity:'good',    note:'Strong action energy — career & achievement favored'},
  {pos:11, name:'Labha (11th)',     emoji:'💎', polarity:'good',    note:'Ekadasha — strongest Chandra Bala; gains & fulfillment'},
  {pos:12, name:'Vyaya (12th)',     emoji:'💸', polarity:'bad',     note:'Rest & withdrawal — avoid expenditure and new starts'},
];

// Find the Moon's rashi (sidereal sign, 0-11) at `fromJD`, then track
// transitions for `count` signs ahead using bisection on moonLongSid.
function getMoonRashiPeriods(fromJD, count){
  const MOON_DEG_PER_DAY = 13.2;
  const curSid     = moonLongSid(fromJD);
  const curRashiIdx = Math.floor(curSid / 30) % 12;
  const degIntoRashi = curSid % 30;
  const estDaysSinceEnter = degIntoRashi / MOON_DEG_PER_DAY;
  const curBoundary = curRashiIdx * 30;
  // Exact moment Moon entered current rashi
  const entryJD = findMoonLng(fromJD - estDaysSinceEnter - 0.5, fromJD, curBoundary);

  const periods = [];
  let rashiIdx = curRashiIdx;
  let pStart   = entryJD;
  for(let i = 0; i < count; i++){
    const nextRashi    = (rashiIdx + 1) % 12;
    const nextBoundary = nextRashi * 30;
    const pEnd = findMoonLng(pStart + 0.5, pStart + 4.0, nextBoundary);
    periods.push({ index: rashiIdx, name: RASHI[rashiIdx], startJD: pStart, endJD: pEnd });
    rashiIdx = nextRashi;
    pStart   = pEnd;
  }
  return periods;
}

// Chandra Bala for a given current moon rashi index vs birth rashi index.
function vpPersonalChandraBala(profile, moonRashiIdx){
  const pos = ((moonRashiIdx - profile.rashiIndex + 12) % 12) + 1;
  return CHANDRA_BALA_DATA[pos];
}

// Build a merged Tara+Chandra timeline starting from `fromJD`.
// Each segment ends at whichever boundary (nakshatra or rashi) comes first.
function vpPersonalCombinedTimeline(profile, fromJD, count){
  const nakPeriods   = getNakshatraPeriods(fromJD - 1, count + 6);
  const rashiPeriods = getMoonRashiPeriods(fromJD, count + 4);

  let ni = nakPeriods.findIndex(p => p.endJD > fromJD);
  if(ni < 0) ni = 0;
  let ri = 0; // rashiPeriods[0] is always current rashi

  const segs = [];
  let cursor     = fromJD;
  let changeType = 'current';

  while(segs.length < count && ni < nakPeriods.length && ri < rashiPeriods.length){
    const nak   = nakPeriods[ni];
    const rashi = rashiPeriods[ri];
    const segEnd = Math.min(nak.endJD, rashi.endJD);

    const tara    = vpPersonalTaraBala(profile, nak.index);
    const chandra = vpPersonalChandraBala(profile, rashi.index);
    const ts = tara.polarity==='good'?1:tara.polarity==='bad'?-1:0;
    const cs = chandra.polarity==='good'?1:chandra.polarity==='bad'?-1:0;
    const score = ts + cs;

    let combined, combinedClass;
    if(score>=2)       {combined='⭐ Very Favorable';combinedClass='best';}
    else if(score===1) {combined='✅ Favorable';     combinedClass='good';}
    else if(score===0) {combined='⚡ Mixed';         combinedClass='neutral';}
    else if(score===-1){combined='⚠️ Unfavorable';   combinedClass='bad';}
    else               {combined='⛔ Avoid';         combinedClass='worst';}

    segs.push({startJD:cursor,endJD:segEnd,nak,rashi,tara,chandra,score,combined,combinedClass,changeType});

    cursor = segEnd;
    const nakEnds   = Math.abs(nak.endJD   - segEnd) < 1/1440;
    const rashiEnds = Math.abs(rashi.endJD - segEnd) < 1/1440;
    changeType = (nakEnds && rashiEnds) ? 'both' : nakEnds ? 'nakshatra' : 'rashi';
    if(nakEnds)   ni++;
    if(rashiEnds) ri++;
  }
  return segs;
}

// ══════════════════════════════════════════════════════════════
// KARANA POLARITY — classical auspiciousness of the 11 Karanas
// ══════════════════════════════════════════════════════════════
const KARANA_BAD_SET  = new Set(['Vishti','Bhadra','Shakuni','Chatushpada','Naga','Kimstughna']);
const KARANA_GOOD_SET = new Set(['Bava','Balava','Kaulava','Taitila','Garaja','Vanija']);
function vpPersonalKaranaPol(name){
  if(KARANA_BAD_SET.has(name))  return 'bad';
  if(KARANA_GOOD_SET.has(name)) return 'good';
  return 'neutral';
}

// ══════════════════════════════════════════════════════════════
// CONSOLIDATED SCORE — 6 Muhurta factors, −9 → +9
//   Tara ±2, Chandra ±2, Yoga −2→+2, Karana ±1, Kala/Muhurta ±1, Vaar ±1
//   Yoga is enhanced: Vyatipata/Vaidhriti/Vajra/Parigha = −2;
//     Amrita/Sarvartha/Guru-Pushya/Ravi-Pushya special = +2
//   Kala: Abhijit/Vijaya/Brahma/Amrita Kala = +1; bad Kala = −1
//   nextChangeJD = earliest factor boundary (excluding Vaar which is daily)
// ══════════════════════════════════════════════════════════════
const YOGA_WORST = new Set(['Vyatipata','Vaidhriti','Vajra','Parigha']);
function vpPersonalConsolidatedNow(profile, jdNow, lat, lng){
  const nowDate = new Date();

  // ── Tithi ──
  const tithiPs = getTithiPeriods(jdNow - 1, 4);
  let tii = tithiPs.findIndex(p => p.endJD > jdNow); if(tii<0) tii=0;
  const curTithi = tithiPs[tii];

  // ── Nakshatra (Tara Bala) ──
  const nakPs = getNakshatraPeriods(jdNow - 1, 4);
  let ni = nakPs.findIndex(p => p.endJD > jdNow); if(ni<0) ni=0;
  const curNak = nakPs[ni];
  const tara   = vpPersonalTaraBala(profile, curNak.index);
  const tScore = tara.polarity==='good'?2:tara.polarity==='bad'?-2:0;

  // ── Moon Rashi (Chandra Bala) ──
  const rashiPs  = getMoonRashiPeriods(jdNow, 3);
  const curRashi = rashiPs[0];
  const chandra  = vpPersonalChandraBala(profile, curRashi.index);
  const cScore   = chandra.polarity==='good'?2:chandra.polarity==='bad'?-2:0;

  // ── Yoga (enhanced weights) ──
  const yogaPs = getYogaPeriods(jdNow - 0.5, 4);
  let yi = yogaPs.findIndex(p => p.endJD > jdNow); if(yi<0) yi=0;
  const curYoga = yogaPs[yi];
  const yogaPol = vpPersonalYogaPolarity(curYoga.name);
  let yScore = yogaPol==='good'?1:yogaPol==='bad'?-1:0;
  if(YOGA_WORST.has(curYoga.name)) yScore = -2; // upgrade penalty for the worst yogas

  // ── Special Yogas (Amrita Siddhi, Sarvartha Siddhi, Guru/Ravi Pushya) ──
  const vaarIdx    = getVedicVaarIdx(nowDate, lat, lng);
  const specYogas  = specialYogas(vaarIdx, curNak.index, null, null);
  const specLabel  = specYogas.length ? specYogas.map(s=>s.name).join(' · ') : null;
  if(specYogas.length > 0) yScore = Math.min(yScore + 1, 2); // boost by +1, cap at +2

  // ── Karana ──
  const karPs = getKaranaPeriods(jdNow - 0.25, 6);
  let ki = karPs.findIndex(p => p.endJD > jdNow); if(ki<0) ki=0;
  const curKar = karPs[ki];
  const karPol = vpPersonalKaranaPol(curKar.name);
  const kScore = karPol==='good'?1:karPol==='bad'?-1:0;

  // ── Kala / Muhurta now ──
  let kalaScore = 0, kalaName = 'Ordinary time', kalaPol = 'neutral';
  try {
    const vaarStrip  = getVaarStrip(nowDate, lat, lng);
    const activeVaar = vaarStrip.find(v => v.isActive);
    if(activeVaar){
      const md = getMuhurtaData(activeVaar, lat, lng);
      const nm = +nowDate;
      const dur = md.durMuhurtas && md.durMuhurtas.find(d => nm >= +d.start && nm < +d.end);
      if(md.amritaKala && nm >= +md.amritaKala.start && nm < +md.amritaKala.end){
        kalaScore = 1; kalaName = 'Amrita Kala ✨'; kalaPol = 'good';
      } else if(nm >= +md.abhijit.start && nm < +md.abhijit.end){
        kalaScore = 1; kalaName = 'Abhijit Muhurta 🏆'; kalaPol = 'good';
      } else if(nm >= +md.vijaya.start && nm < +md.vijaya.end){
        kalaScore = 1; kalaName = 'Vijaya Muhurta ⚔️'; kalaPol = 'good';
      } else if(nm >= +md.brahmaMuhurta.start && nm < +md.brahmaMuhurta.end){
        kalaScore = 1; kalaName = 'Brahma Muhurta 🌅'; kalaPol = 'good';
      } else if(nm >= +md.rahuKalam.start && nm < +md.rahuKalam.end){
        kalaScore = -1; kalaName = 'Rahu Kalam ☠️'; kalaPol = 'bad';
      } else if(nm >= +md.yamaganda.start && nm < +md.yamaganda.end){
        kalaScore = -1; kalaName = 'Yamaganda ⚰️'; kalaPol = 'bad';
      } else if(nm >= +md.gulika.start && nm < +md.gulika.end){
        kalaScore = -1; kalaName = 'Gulika (Mandi) 🐍'; kalaPol = 'bad';
      } else if(md.varjyam && nm >= +md.varjyam.start && nm < +md.varjyam.end){
        kalaScore = -1; kalaName = 'Varjyam 🚫'; kalaPol = 'bad';
      } else if(dur){
        kalaScore = -1; kalaName = 'Dur Muhurta ⚠️'; kalaPol = 'bad';
      }
    }
  } catch(e){ /* no-op: kalaScore stays 0 */ }

  // ── Vaar lord vs birth Rashi lord ──
  const vaarLord = VAAR_LORD[vaarIdx];
  const vaarRel  = vpPersonalLordRelation(profile.rashiLord, vaarLord);
  const vScore   = (vaarRel==='own'||vaarRel==='friend')?1:vaarRel==='enemy'?-1:0;

  // Total: max +9 (2+2+2+1+1+1), min −9
  const total    = tScore + cScore + yScore + kScore + kalaScore + vScore;
  const maxScore = 9;

  let verdict, verdictClass, verdictIcon;
  if(total >= 6)       {verdict='Excellent — Most Auspicious';    verdictClass='best';    verdictIcon='⭐'}
  else if(total >= 2)  {verdict='Favorable — Good for Action';    verdictClass='good';    verdictIcon='✅'}
  else if(total > -2)  {verdict='Mixed — Use Discernment';        verdictClass='neutral'; verdictIcon='⚡'}
  else if(total >= -5) {verdict='Unfavorable — Proceed Carefully';verdictClass='bad';     verdictIcon='⚠️'}
  else                 {verdict='Inauspicious — Rest & Reflect';  verdictClass='worst';   verdictIcon='⛔'}

  // Nearest factor boundary = when this score next changes (Vaar is daily so skip)
  const nextChangeJD = Math.min(curNak.endJD, curRashi.endJD, curYoga.endJD, curKar.endJD);

  return {
    tara, chandra, curTithi, curNak, curRashi, curYoga, curKar,
    yogaPol, karPol, vaarLord, vaarRel, specLabel, specYogas,
    kalaScore, kalaName, kalaPol,
    scores:{tara:tScore, chandra:cScore, yoga:yScore, karana:kScore, kala:kalaScore, vaar:vScore},
    total, maxScore, verdict, verdictClass, verdictIcon, nextChangeJD,
  };
}

// ══════════════════════════════════════════════════════════════
// BEST WINDOWS — next `daysAhead` days where Tara + Chandra
// are simultaneously good (combined score ≥ 2).
// Uses the combined timeline; cap at maxResults entries.
// ══════════════════════════════════════════════════════════════
function vpPersonalBestWindows(profile, fromJD, daysAhead, maxResults){
  // Need enough segments: each nakshatra lasts ~1 day, so 30 days ≈ 30+ segments.
  // Use daysAhead*4 to ensure we always have enough coverage regardless of range.
  const segCount = Math.max(80, Math.ceil(daysAhead * 4));
  const segs = vpPersonalCombinedTimeline(profile, fromJD, segCount);
  const limitJD = fromJD + daysAhead;
  const windows = [];
  for(const seg of segs){
    if(seg.startJD >= limitJD) break;
    if(seg.score >= 2 && seg.endJD > fromJD){
      // Clamp to today–limit range
      const start = Math.max(seg.startJD, fromJD);
      const end   = Math.min(seg.endJD,   limitJD);
      if(end - start < 1/24) continue; // skip windows < 1 h

      // Detect special yogas — scan every 6h across the full window
      // (midpoint-only misses yogas that fall early or late in the window)
      let winSpecYogas = [];
      try {
        const lat = typeof LAT==='number'?LAT:profile.lat;
        const lng = typeof LNG==='number'?LNG:profile.lng;
        const yogaMap = new Map();
        const step = 0.25; // 6 hours in JD units
        for(let jd = start; jd < end + step; jd += step){
          const clamped = Math.min(jd, end);
          const d = jdToDate(clamped);
          const vIdx = getVedicVaarIdx(d, lat, lng);
          const nIdx = Math.floor(moonLongSid(clamped)/(360/27))%27;
          specialYogas(vIdx, nIdx, null, null).forEach(y => {
            if(!yogaMap.has(y.name)) yogaMap.set(y.name, y);
          });
          if(clamped >= end) break;
        }
        winSpecYogas = [...yogaMap.values()];
      } catch(e){ /* no-op */ }

      windows.push({...seg, startJD:start, endJD:end, specialYogas:winSpecYogas});
      if(windows.length >= maxResults) break;
    }
  }
  return windows;
}

// HTML for one factor row in the consolidated breakdown
function vpConsolidatedFactorRow(icon, label, name, score, polarity){
  const polClass = polarity==='good'?'good':polarity==='bad'?'bad':'neutral';
  const sign     = score>0?'+':'';
  return `<div class="vp-cscore-row">
    <span class="vp-cscore-icon">${icon}</span>
    <span class="vp-cscore-label">${label}</span>
    <span class="vp-cscore-name vp-tara-${polClass}">${name}</span>
    <span class="vp-cscore-pts vp-cscore-pts-${polClass}">${sign}${score}</span>
  </div>`;
}

// Render one upcoming timeline row (segments after the current one).
function vpPersonalSegHTML(seg){
  const startDt   = jdToDate(seg.startJD);
  const endDt     = jdToDate(seg.endJD);
  const duration  = dur(startDt, endDt);
  const changeIcon = seg.changeType==='both'?'🌙⭐':seg.changeType==='nakshatra'?'⭐':'🌙';
  const changeLabel = seg.changeType==='both'
    ? `${seg.nak.name} Nak + ${seg.rashi.name} Rashi`
    : seg.changeType==='nakshatra'
      ? `${seg.nak.name} Nakshatra`
      : `Moon in ${seg.rashi.name}`;
  const taraClass    = seg.tara.polarity==='good'?'good':seg.tara.polarity==='bad'?'bad':'neutral';
  const chandraClass = seg.chandra.polarity==='good'?'good':seg.chandra.polarity==='bad'?'bad':'neutral';
  return `<div class="vp-tl-row vp-combined-${seg.combinedClass}">
    <div class="vp-tl-when">${changeIcon} <b>${fmtDT(startDt)}</b></div>
    <div class="vp-tl-change">${changeLabel}</div>
    <div class="vp-tl-badges">
      <span class="vp-tl-badge vp-tara-${taraClass}">Tara: ${seg.tara.emoji||""} ${seg.tara.name}</span>
      <span class="vp-tl-badge vp-tara-${chandraClass}">Chandra: ${seg.chandra.emoji||""} ${seg.chandra.name}</span>
    </div>
    <div class="vp-tl-combined">${seg.combined}</div>
    <div class="vp-tl-dur">for ${duration}</div>
  </div>`;
}

function vpPersonalLordRelation(lordA, lordB){
  if(lordA===lordB) return 'own';
  const row = FRIENDSHIP[lordA];
  return (row && row[lordB]) || 'neutral';
}

// Combine three independent classical factors (Tara Bala from birth
// Nakshatra, Rashi-lord/weekday-lord friendship, and today's active Yoga
// polarity) into one outlook. Each factor is computed from already-correct
// panchanga data; only the combination/weighting is a simplification, and
// that simplification is disclosed to the user in the UI, not hidden.
function vpPersonalDailyOutlook(profile, todayCtx){
  const tara = vpPersonalTaraBala(profile, todayCtx.nakshatraIndex);
  const vaarLord = VAAR_LORD[todayCtx.vaarIdx];
  const rel = vpPersonalLordRelation(profile.rashiLord, vaarLord);

  let score = 0;
  score += tara.polarity==='good' ? 1 : tara.polarity==='bad' ? -1 : 0;
  score += (rel==='own'||rel==='friend') ? 1 : rel==='enemy' ? -1 : 0;
  score += todayCtx.yogaPolarity==='good' ? 1 : todayCtx.yogaPolarity==='bad' ? -1 : 0;

  let verdict, verdictClass;
  if(score>=2){ verdict='Favorable day — good for important undertakings'; verdictClass='good'; }
  else if(score<=-2){ verdict='Use caution — better to defer major decisions'; verdictClass='bad'; }
  else { verdict='Mixed day — proceed with normal care'; verdictClass='neutral'; }

  return { tara, vaarLord, rashiLord: profile.rashiLord, relation: rel, score, verdict, verdictClass };
}

const INAUSPICIOUS_YOGA_NAMES = ['Vishkambha','Atiganda','Shula','Ganda','Vajra','Vyatipata','Parigha','Vaidhriti'];
function vpPersonalYogaPolarity(yogaName){
  if(INAUSPICIOUS_YOGA_NAMES.includes(yogaName)) return 'bad';
  // A short, clearly-good subset per classical lists used elsewhere in this file
  if(['Siddhi','Shubha','Shukla','Brahma','Indra','Siddha','Variyan','Saubhagya'].includes(yogaName)) return 'good';
  return 'neutral';
}

// ══════════════════════════════════════════════════════════════
// VIMSHOTTARI MAHA DASHA + PANCHA-MAHA YOGAS (personalized)
// ══════════════════════════════════════════════════════════════
const VIMSH_SEQ = [
  {lord:'Ketu',     emoji:'☄️', years:7},
  {lord:'Venus',    emoji:'♀️', years:20},
  {lord:'Sun',      emoji:'☀️', years:6},
  {lord:'Moon',     emoji:'🌙', years:10},
  {lord:'Mars',     emoji:'♂️', years:7},
  {lord:'Rahu',     emoji:'🐉', years:18},
  {lord:'Jupiter',  emoji:'♃', years:16},
  {lord:'Saturn',   emoji:'♄', years:19},
  {lord:'Mercury',  emoji:'☿️', years:17},
];
// Nakshatra → starting lord index in VIMSH_SEQ (Ashwini=Ketu, Bharani=Venus, Krittika=Sun, ...)
const NAK_LORD_IDX = [0,1,2,3,4,5,6,7,8, 0,1,2,3,4,5,6,7,8, 0,1,2,3,4,5,6,7,8];

function vpComputeMahaDasha(profile){
  if(!profile || typeof profile.nakshatraIndex !== 'number' || !profile.dob) return null;
  const jdBirth = vpPersonalJdFromForm(profile.dob, profile.tob || '12:00');
  const nakSpan = 360/27;
  const moonSid = moonLongSid(jdBirth);
  const withinNak = (moonSid % nakSpan) / nakSpan; // 0..1 traversed
  const startIdx = NAK_LORD_IDX[profile.nakshatraIndex];
  const startLord = VIMSH_SEQ[startIdx];
  const balanceYears = (1 - withinNak) * startLord.years;

  const periods = [];
  // First (balance) period: birth → birth + balanceYears
  let cursor = new Date(jdToDate(jdBirth));
  const addYears = (d, y) => new Date(d.getTime() + y * 365.2425 * 86400000);
  let endDate = addYears(cursor, balanceYears);
  periods.push({...startLord, start: new Date(cursor), end: endDate, years: balanceYears, isBalance:true});
  cursor = endDate;
  for(let i=1; i<=8; i++){
    const lord = VIMSH_SEQ[(startIdx + i) % 9];
    endDate = addYears(cursor, lord.years);
    periods.push({...lord, start: new Date(cursor), end: new Date(endDate), years: lord.years});
    cursor = endDate;
  }
  // Continue one more cycle for users with long lifespans
  for(let i=0; i<9; i++){
    const lord = VIMSH_SEQ[(startIdx + i) % 9];
    endDate = addYears(cursor, lord.years);
    periods.push({...lord, start: new Date(cursor), end: new Date(endDate), years: lord.years, cycle2:true});
    cursor = endDate;
  }
  return periods;
}

function vpComputeMahaYogas(profile){
  if(!profile || typeof profile.nakshatraIndex !== 'number') return [];
  const out = [];
  const tithiIdx0 = profile.tithiIndex; // 0..29
  const nak = profile.nakshatraIndex;
  const rashi = profile.rashiIndex;
  // Tithi-based Yogas
  if(tithiIdx0 === 4  || tithiIdx0 === 19) out.push({name:'Siddhi Yoga',    emoji:'🪷', desc:'Birth on Panchami — success in undertakings'});
  if(tithiIdx0 === 9  || tithiIdx0 === 24) out.push({name:'Dasha-mukta Yoga',emoji:'🔱', desc:'Birth on Dashami — liberation from obstacles'});
  if(tithiIdx0 === 14)                       out.push({name:'Purnima Yoga',   emoji:'🌕', desc:'Born on full-moon — fullness, fame & nourishment'});
  if(tithiIdx0 === 29)                       out.push({name:'Amavasya Yoga',  emoji:'🌑', desc:'Born on new-moon — deep introspection & ancestral grace'});
  // Nakshatra-based
  if([7,17,21].includes(nak))               out.push({name:'Pushya/Anuradha/Shravana — Vipra Yoga', emoji:'🕉️', desc:'Wisdom, devotion & teaching naturally favored'});
  if([3,12,20,25].includes(nak))            out.push({name:'Maha-Lakshmi Yoga', emoji:'💐', desc:'Rohini/Hasta/Uttara-group nakshatras — prosperity & abundance'});
  if([6].includes(nak))                      out.push({name:'Punarvasu Yoga',    emoji:'🌿', desc:'Renewal & return of good fortune through effort'});
  // Pancha-Maha-Purusha-Yoga proxies via Moon-rashi (approximate, Moon-based)
  const ownExalt = {0:'Mars-Ruchaka', 2:'Mercury-Bhadra', 4:'Sun-Solar', 6:'Venus-Malavya', 8:'Jupiter-Hamsa', 9:'Saturn-Shasha', 11:'Jupiter-Hamsa'};
  if(ownExalt[rashi]) out.push({name:ownExalt[rashi]+' Yoga (Moon-proxy)', emoji:'👑', desc:'Pancha-Maha-Purusha proxy via Moon — leadership & distinction'});
  // Gajakesari (Moon-Jupiter): we don't have Jupiter pos; offer educational entry
  out.push({name:'Gajakesari (educational)', emoji:'🐘', desc:'Strong Moon-Jupiter angle gives wisdom & influence — verify with full chart'});
  return out;
}

// ── Local cache of the loaded profile (avoids refetching on every render) ──
let _vpPersonalProfile = null;
let _vpPersonalLoaded = false;

async function vpPersonalLoad(force){
  if(_vpPersonalLoaded && !force) return _vpPersonalProfile;
  if(!window.vpFirestore){ _vpPersonalLoaded = true; return null; }
  const uid = window.vpFirestore.currentUid();
  if(!uid){ _vpPersonalLoaded = true; _vpPersonalProfile = null; return null; }
  _vpPersonalProfile = await window.vpFirestore.getProfile();
  _vpPersonalLoaded = true;
  return _vpPersonalProfile;
}

async function vpPersonalSave(){
  if(!window.vpFirestore || !window.vpFirestore.currentUid()){
    alert('Please sign in (Google) first to save and sync your birth details.');
    return;
  }
  const dateEl = document.getElementById('vp-horo-date');
  const timeEl = document.getElementById('vp-horo-time');
  const latEl = document.getElementById('vp-horo-lat');
  const lngEl = document.getElementById('vp-horo-lng');
  const dateVal = dateEl && dateEl.value;
  const timeVal = (timeEl && timeEl.value) || '12:00';
  const lat = latEl && latEl.value !== '' ? parseFloat(latEl.value) : NaN;
  const lng = lngEl && lngEl.value !== '' ? parseFloat(lngEl.value) : NaN;

  if(!dateVal){ alert('Please enter a date of birth first.'); return; }
  if(isNaN(lat) || isNaN(lng)){ alert('Please enter a valid birth place (latitude/longitude).'); return; }

  const profile = vpPersonalComputeProfile(dateVal, timeVal, lat, lng);
  profile.enabled = true; // saving = opting in; user can toggle off afterward without re-entering data
  const ok = await window.vpFirestore.saveProfile(profile);
  if(ok){
    _vpPersonalProfile = profile;
    _vpPersonalLoaded = true;
    vpHoroClose();
    vpPersonalRender();
    const card = document.getElementById('vp-personal-card');
    if(card) card.scrollIntoView({behavior:'smooth', block:'start'});
  } else {
    alert('Could not save your birth details — please check your connection and try again.');
  }
}

async function vpPersonalToggle(){
  if(!_vpPersonalProfile) return;
  _vpPersonalProfile.enabled = !_vpPersonalProfile.enabled;
  await window.vpFirestore.saveProfile({ enabled: _vpPersonalProfile.enabled });
  vpPersonalRender();
}

function vpPersonalFmtDate(d){
  return d.toLocaleDateString('en-IN', {weekday:'long', day:'numeric', month:'long', year:'numeric'});
}

// Toggle a named collapsible section (body element + chevron indicator)
function vpTogglePersonalSection(bodyId, chevronId){
  const body = document.getElementById(bodyId);
  const chev = document.getElementById(chevronId);
  if(!body) return;
  const isOpen = body.classList.toggle('open');
  if(chev) chev.textContent = isOpen ? '▾' : '▸';
  // Persist state so re-renders restore it
  try { sessionStorage.setItem('vp-collapse-'+bodyId, isOpen?'open':'closed'); } catch(e){}
  // Muhurta collapsible: live-sync from main panchanga's Coming Up list
  if(bodyId === 'vp-muhurta-list-body' && isOpen){
    const mainList = document.getElementById('vp-upcoming-list');
    const listEl   = document.getElementById('vp-personal-muhurta-list');
    if(mainList && listEl && mainList.innerHTML.trim()){
      listEl.innerHTML = mainList.innerHTML;
    }
  }
}

// Change the "best windows" day-range selector and re-render
function vpPersonalBestWinDaysChange(val){
  window._vpBestWindowsDays = parseInt(val, 10) || 7;
  vpPersonalRender();
}

// Renders (or hides) the "My Panchanga" card on the main panchanga page.
// Safe to call any time — it no-ops gracefully if the mount point isn't
// in the DOM yet, or if there's no saved/enabled profile.
async function vpPersonalRender(){
  const mount = document.getElementById('vp-personal-card');
  if(!mount) return;

  const profile = await vpPersonalLoad(false);
  if(!profile){
    mount.style.display = 'none';
    return;
  }

  if(!profile.enabled){
    mount.style.display = 'block';
    mount.innerHTML = `
      <div class="vp-personal-offcard">
        <span>✨ Personalized panchanga is available for your saved birth details.</span>
        <button class="vp-personal-toggle-btn" onclick="vpPersonalToggle()">Turn on</button>
      </div>`;
    return;
  }

  const now    = new Date();
  const jdNow  = dateToJD(now);
  const lat    = typeof LAT === 'number' ? LAT : profile.lat;
  const lng    = typeof LNG === 'number' ? LNG : profile.lng;

  // ── 1. 6-factor consolidated score ───────────────────────────────
  const cs = vpPersonalConsolidatedNow(profile, jdNow, lat, lng);
  const scorePct = Math.round(((cs.total + cs.maxScore) / (cs.maxScore * 2)) * 100);

  // ── 2. Combined Tara+Chandra timeline (10 segments) ──────────────
  const combinedTL = vpPersonalCombinedTimeline(profile, jdNow, 10);

  // ── 3. Best windows — user-selectable day range ───────────────────
  const bestWinDays = window._vpBestWindowsDays || 7;
  const bestWins = vpPersonalBestWindows(profile, jdNow, bestWinDays, 8);

  const paksha = profile.tithiIndex < 15 ? 'Sukla' : 'Krishna';
  const janmoTithiLabel = `${profile.birthMonthWasAdhik ? 'Adhik ' : ''}${profile.birthMonthName} ${paksha} ${profile.tithiName}`;
  const janmo = vpPersonalNextJanmotithi(profile, jdNow);
  const janmoLabel = janmo ? vpPersonalFmtDate(janmo.date) : 'Could not be determined this year';

  const nakDeity    = NAKSHATRA_DEITY[profile.nakshatraIndex];
  const nakLordName = nakLord(profile.nakshatraIndex);
  const rashiDeity  = RASHI_DEITY[profile.rashiIndex];

  // Upcoming good Tara days
  const upcomingTara = vpPersonalUpcomingGoodTaraDays(profile, jdNow, 4, 60);

  // Janmotithi year picker
  const nowYear = now.getFullYear();
  const janmoYearDefault = janmo ? janmo.date.getFullYear() : nowYear;
  const janmoYearRangeStart = Math.min(nowYear - 5, janmoYearDefault);
  const janmoYearRangeEnd   = Math.max(nowYear + 10, janmoYearDefault);
  let janmoYearOptionsHtml = '';
  for(let y=janmoYearRangeStart; y<=janmoYearRangeEnd; y++){
    janmoYearOptionsHtml += `<option value="${y}"${y===janmoYearDefault?' selected':''}>${y}</option>`;
  }
  const janmoYearInitialResult = (janmo && janmo.date.getFullYear()===janmoYearDefault)
    ? janmoLabel
    : (() => { const r = vpPersonalJanmotithiForYear(profile, janmoYearDefault); return r ? vpPersonalFmtDate(r.date) : 'Could not be determined for this year'; })();

  // ── Tithi / Nakshatra / Yoga / Karana descriptions ────────────────
  const TITHI_DESC = ['New beginning, auspicious start','Prosperity & growth','Victory & success','Caution: avoid risky ventures','Auspicious for all good deeds','Good for social gatherings','Favours clearing enemies','Mixed — use discernment','Complete pending tasks','Excellent for all activities','Ekadashi — highly sacred fast','Breaking fast, gifts & charity','Avoid starting new ventures','Ancestral worship, sacred rites','Full Moon — very auspicious','New Moon — reflection & rest','Prosperity & growth (Krishna)','Victory (Krishna)','Caution (Krishna)','All good deeds (Krishna)','Social gatherings (Krishna)','Clear obstacles (Krishna)','Mixed (Krishna)','Complete tasks (Krishna)','Excellent (Krishna)','Sacred fast (Krishna)','Gifts & charity (Krishna)','Avoid new ventures (Krishna)','Ancestral rites (Krishna)','New Moon cycle begins'];
  const YOGA_DESC  = {'Vishkumbha':'Obstruction — avoid new starts','Preeti':'Affection & love — excellent for unions','Ayushman':'Longevity & health benefits','Saubhagya':'Good fortune — auspicious for all','Shobhana':'Splendour — beauty & prosperity','Atiganda':'Obstacles — proceed carefully','Sukarma':'Good deeds bring double merit','Dhriti':'Steadiness — excellent for commitments','Shula':'Pain — avoid surgery or conflict','Ganda':'Hindrance — use caution','Vriddhi':'Growth & expansion — auspicious','Dhruva':'Permanence — good for long-term plans','Vyaghata':'Danger — avoid travel & new ventures','Harshana':'Joy & happiness — festive deeds','Vajra':'Thunderbolt — conflict, avoid','Siddhi':'Achievement — excellent for goals','Vyatipata':'Calamity — total avoidance','Variyan':'Comfort & leisure — rest well','Parigha':'Obstruction — avoid key actions','Shiva':'Auspicious — worship & spirituality','Siddha':'Achievement — perfect for success','Sadhya':'Attainable goals — moderate effort','Shubha':'Auspicious — good for all deeds','Shukla':'Bright & pure — excellent for rituals','Brahma':'Supreme — most auspicious yoga','Indra':'Royal power — leadership & victory','Vaidhriti':'No support — avoid all important work'};
  const KARANA_DESC = {'Bava':'Auspicious for all activities','Balava':'Good for travel & new ventures','Kaulava':'Excellent for trade & commerce','Taitila':'Good for agriculture & service','Garaja':'Favourable for family matters','Vanija':'Merchant — excellent for business','Vishti':'Bhadra — avoid all key actions','Shakuni':'Mixed — use discrimination','Chatushpada':'Fixed — good for spiritual rites','Naga':'Fixed — reflection & caution','Kimstughna':'Fixed — good for worship'};

  const tithiFx = TITHI_DESC[cs.curTithi ? cs.curTithi.index % 30 : 0] || '';
  const yogaFx  = YOGA_DESC[cs.curYoga.name]  || '';
  const karFx   = KARANA_DESC[cs.curKar.name] || '';

  // ── Factor row builders ───────────────────────────────────────────
  function makeFactorRowWithBar(icon, label, name, score, polarity, startJD, endJD, desc){
    const polClass = polarity==='good'?'good':polarity==='bad'?'bad':'neutral';
    const sign = score>0?'+':'';
    const startDt = jdToDate(startJD), endDt = jdToDate(endJD);
    const totalSec  = (endJD  - startJD) * 86400;
    const elapsedSec= (jdNow  - startJD) * 86400;
    const pct = Math.min(100, Math.max(0, Math.round(elapsedSec / totalSec * 100)));
    const timeLeft  = dur(now, endDt);
    return `<div class="vp-cscore-row vp-cscore-row-rich">
      <div class="vp-cscore-row-top">
        <span class="vp-cscore-icon">${icon}</span>
        <span class="vp-cscore-label">${label}</span>
        <span class="vp-cscore-name vp-tara-${polClass}">${name}</span>
        ${score!==0?`<span class="vp-cscore-pts vp-cscore-pts-${polClass}">${sign}${score}</span>`:''}
      </div>
      ${desc?`<div class="vp-cscore-row-desc">${desc}</div>`:''}
      <div class="vp-cscore-row-timeline">
        <span class="vp-cscore-tl-start">${fmt12(startDt)}</span>
        <span class="vp-cscore-tl-left">${timeLeft} left</span>
        <span class="vp-cscore-tl-end">${fmtEnd(endDt, startDt)}</span>
      </div>
      <div class="vp-cscore-row-bar"><div class="vp-cscore-row-fill vp-cscore-fill-${polClass}" style="width:${pct}%"></div></div>
    </div>`;
  }

  function makeFactorRowSimple(icon, label, name, score, polarity){
    const polClass = polarity==='good'?'good':polarity==='bad'?'bad':'neutral';
    const sign = score>0?'+':'';
    return `<div class="vp-cscore-row">
      <span class="vp-cscore-icon">${icon}</span>
      <span class="vp-cscore-label">${label}</span>
      <span class="vp-cscore-name vp-tara-${polClass}">${name}</span>
      ${score!==0?`<span class="vp-cscore-pts vp-cscore-pts-${polClass}">${sign}${score}</span>`:''}
    </div>`;
  }

  const specYogaBadgeHtml = cs.specLabel
    ? `<div class="vp-cscore-special-yoga">✨ Special Yoga active: <strong>${cs.specLabel}</strong></div>`
    : '';

  // ── Best windows HTML ─────────────────────────────────────────────
  const dayRangeOptions = [3,5,7,10,14,21,30,45,60,90,120,180,270,365].map(d =>
    `<option value="${d}"${d===bestWinDays?' selected':''}>${d>=365?'1 year':d+' days'}</option>`).join('');

  const bestWinHTML = `
    <div class="vp-best-windows">
      <div class="vp-best-windows-head">
        <span>🌟 Best Windows</span>
        <span class="vp-best-win-range-wrap">
          <label class="vp-best-win-range-label">Next</label>
          <select class="vp-best-win-range-select" onchange="vpPersonalBestWinDaysChange(this.value)">${dayRangeOptions}</select>
          <span class="vp-best-win-range-label">(Tara + Chandra both good)</span>
        </span>
      </div>
      ${bestWins.length ? bestWins.map(w => {
        const sd = jdToDate(w.startJD), ed = jdToDate(w.endJD);
        const winDur = dur(sd, ed);
        const taraClass = w.tara.polarity==='good'?'good':'neutral';
        const chanClass  = w.chandra.polarity==='good'?'good':'neutral';
        const specHtml = w.specialYogas && w.specialYogas.length
          ? `<div class="vp-best-win-special">${w.specialYogas.map(s=>`<span class="vp-best-win-yoga-badge" title="${s.desc||''}">${s.symbol||'✨'} ${s.name}${s.desc?` <span class="vp-best-win-yoga-why">(${s.desc})</span>`:''}</span>`).join('')}</div>` : '';
        return `<div class="vp-best-win-row">
          <div class="vp-best-win-when">${fmtDT(sd)} <span class="vp-best-win-arrow">→</span> ${fmtEnd(ed, sd)}</div>
          <div class="vp-best-win-badges">
            <span class="vp-tl-badge vp-tara-${taraClass}">Tara: ${w.tara.emoji||""} ${w.tara.name}</span>
            <span class="vp-tl-badge vp-tara-${chanClass}">Chandra: ${w.chandra.emoji||""} ${w.chandra.name}</span>
          </div>
          ${specHtml}
          <div class="vp-best-win-dur">Duration: ${winDur}</div>
        </div>`;
      }).join('') : `<div class="vp-best-windows-empty">No "Tara + Chandra both good" windows in the next ${bestWinDays} days — see timeline below for the best available periods.</div>`}
    </div>`;

  // ── Merged Tara & Chandra + Upcoming HTML ─────────────────────────
  const mergedTLHtml = combinedTL.map((seg, i) => {
    const sd = jdToDate(seg.startJD), ed = jdToDate(seg.endJD);
    const segDur = dur(sd, ed);
    const taraClass = seg.tara.polarity==='good'?'good':seg.tara.polarity==='bad'?'bad':'neutral';
    const chanClass  = seg.chandra.polarity==='good'?'good':seg.chandra.polarity==='bad'?'bad':'neutral';
    const isNow = i===0;
    const whenLabel = isNow ? '<span class="vp-now-badge">Now</span>' : fmtDT(sd);
    const changeLabel = i===0
      ? seg.nak.name+' Nak · Moon in '+seg.rashi.name
      : (seg.changeType==='both'
          ? seg.nak.name+' Nak + '+seg.rashi.name+' Rashi'
          : seg.changeType==='nakshatra' ? seg.nak.name+' Nakshatra' : 'Moon → '+seg.rashi.name);
    return `<div class="vp-tl-row vp-tara-${seg.combinedClass||'neutral'}">
      <div class="vp-tl-when">${whenLabel} <b>${isNow?fmt12(sd):''}</b> <span class="vp-tl-arrow">→</span> <span class="vp-tl-end">${fmtEnd(ed, sd)}</span></div>
      <div class="vp-tl-change">${changeLabel}</div>
      <div class="vp-tl-badges">
        <span class="vp-tl-badge vp-tara-${taraClass}">Tara: ${seg.tara.emoji||""} ${seg.tara.name}</span>
        <span class="vp-tl-badge vp-tara-${chanClass}">Chandra: ${seg.chandra.emoji||""} ${seg.chandra.name}</span>
      </div>
      <div class="vp-tl-combined">${seg.combined}</div>
      <div class="vp-tl-dur">for ${segDur}</div>
    </div>`;
  }).join('');

  const upcomingItemsHtml = [
    `<div class="vp-personal-upcoming-item"><span class="vp-personal-upcoming-label">🎉 ${janmoTithiLabel} (Janmotithi)</span><span class="vp-personal-upcoming-date">${janmoLabel}</span></div>`,
    ...upcomingTara.map(u => {
      const endLabel = ` → ${fmtEnd(jdToDate(u.endJD), u.date)}`;
      const whenLabel = u.isActive ? `Active now${endLabel}` : fmtDT(u.date)+endLabel;
      const chanClass = u.chandra ? (u.chandra.polarity==='good'?'good':u.chandra.polarity==='bad'?'bad':'neutral') : 'neutral';
      const chanBadge = u.chandra
        ? `<div class="vp-upcoming-tara-badges"><span class="vp-tl-badge vp-tara-good">Tara: ${u.tara.emoji||""} ${u.tara.name}</span><span class="vp-tl-badge vp-tara-${chanClass}">Chandra: ${u.chandra.emoji||""} ${u.chandra.name}</span></div>`
        : '';
      return `<div class="vp-personal-upcoming-item">
        <span class="vp-personal-upcoming-label">${u.tara.name}${u.isActive?' 🟢':''} — ${u.tara.note}</span>
        ${chanBadge}
        <span class="vp-personal-upcoming-date">${whenLabel}</span>
      </div>`;
    })
  ].join('');

  mount.style.display = 'block';
  mount.innerHTML = `
    <div class="vp-personal-card">

      <!-- ── Header ── -->
      <div class="vp-personal-head">
        <div><div class="vp-personal-janmo-tithi">Janmo Tithi: <span>${janmoTithiLabel}</span></div></div>
        <button class="vp-personal-toggle-btn vp-personal-toggle-on" onclick="vpPersonalToggle()">On</button>
      </div>

      <!-- ── 4 Birth boxes: Rashi, Nakshatra, Yoga, Karana ── -->
      <div class="vp-personal-rashi-row vp-personal-rashi-row-4">
        <div class="vp-personal-chip">
          <span class="vp-personal-chip-label">Birth Rashi</span>
          <span class="vp-personal-chip-val">${profile.rashiName}</span>
          <span class="vp-personal-chip-sub">Deity: ${rashiDeity}</span>
        </div>
        <div class="vp-personal-chip">
          <span class="vp-personal-chip-label">Birth Nakshatra</span>
          <span class="vp-personal-chip-val">${profile.nakshatraName} (Pada ${profile.nakshatraPada})</span>
          <span class="vp-personal-chip-sub">Deity: ${nakDeity} · Lord: ${nakLordName}</span>
        </div>
        <div class="vp-personal-chip">
          <span class="vp-personal-chip-label">Birth Yoga</span>
          <span class="vp-personal-chip-val">${profile.birthYogaName||'—'}</span>
          <span class="vp-personal-chip-sub">${profile.birthYogaName ? 'Moon+Sun yoga at birth' : ''}</span>
        </div>
        <div class="vp-personal-chip">
          <span class="vp-personal-chip-label">Birth Karana</span>
          <span class="vp-personal-chip-val">${profile.birthKaranaName||'—'}</span>
          <span class="vp-personal-chip-sub">${profile.birthKaranaName ? 'Half-tithi at birth' : ''}</span>
        </div>
      </div>

      <!-- ── Janmotithi calculator — top with birth info ── -->
      <div class="vp-personal-janmoyear">
        <span class="vp-personal-janmoyear-label">📅 Janmotithi in</span>
        <select id="vp-personal-janmo-year-select" class="vp-personal-janmoyear-select" onchange="vpPersonalJanmoYearChange()">
          ${janmoYearOptionsHtml}
        </select>
        <span class="vp-personal-janmoyear-result" id="vp-personal-janmo-year-result">${janmoYearInitialResult}</span>
      </div>

      <!-- ══ CONSOLIDATED SCORE + Tithi/Nak/Yoga/Karana progress bars ══ -->
      <div class="vp-cscore-card vp-cscore-${cs.verdictClass}">
        <div class="vp-cscore-head">⚡ Personal Muhurta — Right Now</div>
        <div class="vp-cscore-verdict">${cs.verdictIcon} ${cs.verdict}</div>
        <div class="vp-cscore-bar-row">
          <div class="vp-cscore-bar"><div class="vp-cscore-fill vp-cscore-fill-${cs.verdictClass}" style="width:${scorePct}%"></div></div>
          <span class="vp-cscore-num">${cs.total>0?'+':''}${cs.total} / ${cs.maxScore}</span>
        </div>
        ${specYogaBadgeHtml}
        <div class="vp-cscore-factors">
          ${cs.curTithi ? makeFactorRowWithBar('🌕','Tithi',cs.curTithi.name+' ('+(cs.curTithi.index<15?'Śukla':'Kṛṣṇa')+' Paksha)',0,'neutral',cs.curTithi.startJD,cs.curTithi.endJD,tithiFx) : ''}
          ${makeFactorRowWithBar('⭐','Tara Bala',(cs.tara.emoji||'')+' '+cs.tara.name+' · '+cs.curNak.name+' Nak',cs.scores.tara,cs.tara.polarity,cs.curNak.startJD,cs.curNak.endJD,cs.tara.note||'')}
          ${makeFactorRowWithBar('🌙','Chandra Bala',(cs.chandra.emoji||'')+' '+cs.chandra.name+' · Moon in '+cs.curRashi.name,cs.scores.chandra,cs.chandra.polarity,cs.curRashi.startJD,cs.curRashi.endJD,cs.chandra.note||'')}
          ${makeFactorRowWithBar('☯️','Yoga',cs.curYoga.name+(cs.specLabel?' · '+cs.specLabel:''),cs.scores.yoga,cs.yogaPol,cs.curYoga.startJD,cs.curYoga.endJD,yogaFx)}
          ${makeFactorRowWithBar('◐','Karana',cs.curKar.name,cs.scores.karana,cs.karPol,cs.curKar.startJD,cs.curKar.endJD,karFx)}
          ${makeFactorRowSimple('🔔','Kala / Muhurta',cs.kalaName,cs.scores.kala,cs.kalaPol)}
          ${makeFactorRowSimple('⊕','Weekday Lord',cs.vaarLord,cs.scores.vaar,(cs.vaarRel==='own'||cs.vaarRel==='friend')?'good':cs.vaarRel==='enemy'?'bad':'neutral')}
        </div>
        <div class="vp-cscore-timer">⏱ Next change in ${dur(now, jdToDate(cs.nextChangeJD))} · at ${fmtEnd(jdToDate(cs.nextChangeJD), now)}</div>
      </div>

      <!-- ══ BEST WINDOWS — user-selectable range ══ -->
      ${bestWinHTML}

      <!-- ══ TARA & CHANDRA + UPCOMING (merged, collapsible) ══ -->
      <div class="vp-collapsible-section">
        <button class="vp-collapsible-toggle" onclick="vpTogglePersonalSection('vp-tarachandra-body','vp-tarachandra-chevron')">
          <span>📅 Tara &amp; Chandra — Active Now &amp; Upcoming for You</span>
          <span class="vp-chevron" id="vp-tarachandra-chevron">${(()=>{try{return sessionStorage.getItem('vp-collapse-vp-tarachandra-body')==='closed'?'▸':'▾';}catch(e){return'▾';}})()}</span>
        </button>
        <div id="vp-tarachandra-body" class="vp-collapsible-body${(()=>{try{return sessionStorage.getItem('vp-collapse-vp-tarachandra-body')==='closed'?'':' open';}catch(e){return' open';}})()}">
          <div class="vp-combined-timeline">
            ${mergedTLHtml}
          </div>
        </div>
      </div>

      <!-- ══ MAHA YOGA & MAHA DASHA — personalized ══ -->
      ${(()=>{
        const dashas = vpComputeMahaDasha(profile) || [];
        const yogas = vpComputeMahaYogas(profile) || [];
        const nowMs = +now;
        const activeIdx = dashas.findIndex(d => +d.start <= nowMs && nowMs < +d.end);
        const fmtY = d => d.toLocaleDateString('en-IN',{year:'numeric',month:'short'});
        const dashaRows = dashas.map((d,i)=>{
          const isActive = i === activeIdx;
          const isPast = +d.end <= nowMs;
          const cls = isActive ? 'vp-dasha-active' : (isPast ? 'vp-dasha-past' : 'vp-dasha-future');
          const tag = isActive ? '🟢 Active' : (isPast ? 'Past' : 'Upcoming');
          return `<div class="vp-dasha-row ${cls}">
            <div class="vp-dasha-lord"><span class="vp-dasha-emoji">${d.emoji}</span><b>${d.lord}</b> Mahadasha</div>
            <div class="vp-dasha-when">${fmtY(d.start)} → ${fmtY(d.end)} · ${d.years.toFixed(1)}y${d.isBalance?' (balance at birth)':''}</div>
            <div class="vp-dasha-tag">${tag}</div>
          </div>`;
        }).join('');
        const yogaCards = yogas.length ? yogas.map(y=>`
          <div class="vp-mahayoga-card">
            <div class="vp-mahayoga-name"><span>${y.emoji}</span> ${y.name}</div>
            <div class="vp-mahayoga-desc">${y.desc}</div>
          </div>`).join('') : `<div class="vp-mahayoga-empty">No major classical yogas detected from Moon-based factors. A full chart with all planets reveals more.</div>`;
        return `<div class="vp-collapsible-section vp-mahasection">
          <button class="vp-collapsible-toggle" onclick="vpTogglePersonalSection('vp-maha-body','vp-maha-chevron')">
            <span>🕉️ Maha Yoga &amp; Maha Dasha — Your Life Cycles</span>
            <span class="vp-chevron" id="vp-maha-chevron">${(()=>{try{return sessionStorage.getItem('vp-collapse-vp-maha-body')==='closed'?'▸':'▾';}catch(e){return'▾';}})()}</span>
          </button>
          <div id="vp-maha-body" class="vp-collapsible-body${(()=>{try{return sessionStorage.getItem('vp-collapse-vp-maha-body')==='closed'?'':' open';}catch(e){return' open';}})()}">
            <div class="vp-maha-sub">✨ Personalized Maha Yogas (from your birth Moon)</div>
            <div class="vp-mahayoga-list">${yogaCards}</div>
            <div class="vp-maha-sub" style="margin-top:14px">🪐 Vimshottari Maha Dasha (120-year cycle)</div>
            <div class="vp-dasha-list">${dashaRows || '<div class="vp-mahayoga-empty">Maha Dasha needs your birth nakshatra.</div>'}</div>
            <div class="vp-maha-note">Calculated from your birth Moon's nakshatra. Each planet rules a span of years and colors that phase of life.</div>
          </div>
        </div>`;
      })()}

      <div class="vp-personal-disclaimer">For reflection only — not a substitute for a professional astrologer.</div>
    </div>`;


  // ── Populate muhurta list ──────────────────────────────────────────
  try {
    const vaarStrip  = getVaarStrip(now, lat, lng);
    const activeVaar = vaarStrip.find(v => v.isActive);
    if(activeVaar){
      const md  = getMuhurtaData(activeVaar, lat, lng);
      const allM = buildAllMuhurtas(md);
      const listEl = document.getElementById('vp-personal-muhurta-list');
      if(listEl && allM && allM.length){
        const sorted = allM.slice().sort((a,b) => +a.s - +b.s);
        listEl.innerHTML = sorted.map((m, idx) => {
          const cls = m.type==='good'?'ausp':'inaup';
          const status = +m.s > +now ? 'In '+dur(now, m.s) : (+m.e > +now ? 'Active now' : 'Done');
          return `<div class="vp-upcoming-row ${cls}">
            <div class="vp-upcoming-serial">${idx+1}</div>
            <div class="vp-upcoming-icon">${m.icon||'⏰'}</div>
            <div class="vp-upcoming-body">
              <div class="vp-upcoming-label">${m.label}</div>
              <div class="vp-upcoming-desc">${(typeof MEFF!=='undefined'&&MEFF[m.label])||''}</div>
              <div class="vp-upcoming-timeblock">${fmt12(m.s)} – ${fmtEnd(m.e, m.s)}</div>
              <div class="vp-upcoming-dur">${dur(m.s, m.e)} duration</div>
            </div>
            <div class="vp-upcoming-in">${status}</div>
          </div>`;
        }).join('');
      } else if(listEl){
        listEl.innerHTML = '<div style="padding:12px;text-align:center;font-size:.76rem;color:var(--vp-ink-faint)">No periods available</div>';
      }
    }
  } catch(e){ /* no-op */ }
}

// Re-runs the Janmotithi-for-year lookup when the user picks a different
// year in the "My Panchanga" card, updating just that result line (no
// full card re-render, so the rest of the card — and the select's own
// scroll position — stays put).
function vpPersonalJanmoYearChange(){
  const sel = document.getElementById('vp-personal-janmo-year-select');
  const out = document.getElementById('vp-personal-janmo-year-result');
  if(!sel || !out || !_vpPersonalProfile) return;
  const year = parseInt(sel.value, 10);
  if(isNaN(year)) return;
  const result = vpPersonalJanmotithiForYear(_vpPersonalProfile, year);
  out.textContent = result ? vpPersonalFmtDate(result.date) : 'Could not be determined for this year';
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

window.vpToggleRightNow = function() {
  const w = document.getElementById('vp-now-wrap');
  const b = document.getElementById('vp-now-toggle');
  if(w) w.classList.toggle('open');
  if(b) b.classList.toggle('open');
};

window.vpToggleUpcoming = function() {
  const w = document.getElementById('vp-upcoming-wrap');
  const b = document.getElementById('vp-upcoming-toggle');
  if(w) w.classList.toggle('open');
  if(b) b.classList.toggle('open');
};

window.vpTogglePersonalSection = function(bodyId, chevronId) {
  vpTogglePersonalSection(bodyId, chevronId);
};

window.vpPersonalBestWinDaysChange = function(val) {
  vpPersonalBestWinDaysChange(val);
};

// Calendar date-picker
// ── Public API ───────────────────────────────────────────────
window.vpHoroOpen = function(){ vpHoroOpen(); };
window.vpHoroOpenMine = function(){ vpHoroOpenMine(); };
window.vpHoroClose = function(){ vpHoroClose(); };
window.vpHoroCloseBackdrop = function(e){ vpHoroCloseBackdrop(e); };
window.vpHoroUseGPS = function(){ vpHoroUseGPS(); };
window.vpHoroCalculate = function(){ vpHoroCalculate(); };
window.vpHoroClearResult = function(){ vpHoroClearResult(); };
window.vpPersonalSave = function(){ vpPersonalSave(); };
window.vpPersonalToggle = function(){ vpPersonalToggle(); };
window.vpPersonalRender = function(){ vpPersonalRender(); };
window.vpPersonalJanmoYearChange = function(){ vpPersonalJanmoYearChange(); };
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

})();

    /* === END ORIGINAL ENGINE === */
  }
})();

/* Muse.lab 스타일 분석 – 모든 분석은 브라우저 안에서만 실행됩니다. */
(function () {
  'use strict';
  var D = window.MUSE_DATA;
  var $ = function (id) { return document.getElementById(id); };
  var S = { face: null, body: null, wb: null, wbPicking: false, bone: [], color: [], res: null };
  var MAXW = 1280;

  /* ---------- 공통 유틸 ---------- */
  function gender() { return document.querySelector('input[name=gender]:checked').value; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function median(arr) { if (!arr.length) return NaN; var a = arr.slice().sort(function (x, y) { return x - y; }); var m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }
  function hex(rgb) { return '#' + rgb.map(function (v) { return ('0' + Math.round(clamp(v, 0, 255)).toString(16)).slice(-2); }).join(''); }
  function srgbToLab(rgb) {
    var c = rgb.map(function (v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    var x = (c[0] * 0.4124 + c[1] * 0.3576 + c[2] * 0.1805) / 0.95047;
    var y = (c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722);
    var z = (c[0] * 0.0193 + c[1] * 0.1192 + c[2] * 0.9505) / 1.08883;
    var f = function (t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; };
    var fx = f(x), fy = f(y), fz = f(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
  function busy(on, msg) { $('busy').style.display = on ? 'flex' : 'none'; if (msg) $('busy').textContent = msg; }

  /* ---------- 사진 불러오기 ---------- */
  function loadPhoto(file, cv, cb) {
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      var sc = Math.min(1, MAXW / Math.max(img.naturalWidth, img.naturalHeight));
      cv.width = Math.round(img.naturalWidth * sc); cv.height = Math.round(img.naturalHeight * sc);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      var keep = document.createElement('canvas'); keep.width = cv.width; keep.height = cv.height;
      keep.getContext('2d').drawImage(cv, 0, 0);
      cv.style.display = 'block';
      cb(keep);
    };
    img.onerror = function () { alert('사진을 불러오지 못했어요. 다른 사진으로 다시 시도해 주세요.'); };
    img.src = url;
  }
  $('fileFace').addEventListener('change', function (e) {
    if (!e.target.files[0]) return;
    loadPhoto(e.target.files[0], $('cvFace'), function (c) { S.face = c; S.wb = null; $('wbInfo').textContent = '색 보정: 사용 안 함'; $('wbBtn').disabled = false; refresh(); });
  });
  $('fileBody').addEventListener('change', function (e) {
    if (!e.target.files[0]) return;
    loadPhoto(e.target.files[0], $('cvBody'), function (c) { S.body = c; refresh(); });
  });

  /* ---------- 흰색 기준(화이트 밸런스) ---------- */
  $('wbBtn').addEventListener('click', function () {
    S.wbPicking = true; $('wbInfo').textContent = '사진 속 흰 종이(또는 흰 옷) 부분을 눌러 주세요.';
    $('cvFace').style.cursor = 'crosshair';
  });
  $('cvFace').addEventListener('click', function (e) {
    if (!S.wbPicking || !S.face) return;
    var cv = $('cvFace'), r = cv.getBoundingClientRect();
    var x = Math.round((e.clientX - r.left) * cv.width / r.width), y = Math.round((e.clientY - r.top) * cv.height / r.height);
    var d = S.face.getContext('2d').getImageData(clamp(x - 6, 0, cv.width - 13), clamp(y - 6, 0, cv.height - 13), 13, 13).data;
    var s = [0, 0, 0], n = 0;
    for (var i = 0; i < d.length; i += 4) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; n++; }
    s = s.map(function (v) { return v / n; });
    var m = (s[0] + s[1] + s[2]) / 3;
    if (m < 120) { $('wbInfo').textContent = '선택한 곳이 너무 어두워요. 흰 부분을 다시 눌러 주세요.'; return; }
    S.wb = [m / s[0], m / s[1], m / s[2]];
    S.wbPicking = false; cv.style.cursor = '';
    var ctx = cv.getContext('2d'); ctx.strokeStyle = '#00A3FF'; ctx.lineWidth = 3; ctx.strokeRect(x - 10, y - 10, 20, 20);
    $('wbInfo').textContent = '색 보정: 적용됨 (기준 색 ' + hex(s) + ')';
  });

  /* ---------- 질문 ---------- */
  function renderQuestions() {
    var g = gender(), qs = D.bone.questions[g];
    S.bone = qs.map(function () { return null; });
    $('boneQs').innerHTML = qs.map(function (q, i) {
      return '<div class="q"><div class="qt">' + (i + 1) + '. ' + esc(q.text) + '</div><div class="pills">' +
        q.o.map(function (o) { return '<label class="pill"><input type="radio" name="bq' + i + '" value="' + o[1] + '">' + esc(o[0]) + '</label>'; }).join('') +
        '<label class="pill"><input type="radio" name="bq' + i + '" value="">잘 모르겠어요</label></div></div>';
    }).join('');
    qs.forEach(function (q, i) {
      document.querySelectorAll('input[name=bq' + i + ']').forEach(function (el) { el.addEventListener('change', function () { S.bone[i] = el.value || null; refresh(); }); });
    });
  }
  function renderColorQs() {
    S.color = D.colorQuestions.map(function () { return 0; });
    $('colorQs').innerHTML = D.colorQuestions.map(function (q, i) {
      return '<div class="q"><div class="qt">' + esc(q.text) + '</div><div class="pills">' +
        q.o.map(function (o) { return '<label class="pill"><input type="radio" name="cq' + i + '" value="' + o[1] + '">' + esc(o[0]) + '</label>'; }).join('') + '</div></div>';
    }).join('');
    D.colorQuestions.forEach(function (q, i) {
      document.querySelectorAll('input[name=cq' + i + ']').forEach(function (el) { el.addEventListener('change', function () { S.color[i] = Number(el.value); }); });
    });
  }
  document.querySelectorAll('input[name=gender]').forEach(function (el) { el.addEventListener('change', function () { renderQuestions(); refresh(); }); });
  ['consent1', 'consent2'].forEach(function (id) { $(id).addEventListener('change', refresh); });

  function refresh() {
    var ok = $('consent1').checked && $('consent2').checked;
    var any = S.face || S.body || S.bone.some(Boolean);
    $('runBtn').disabled = !(ok && any);
    $('readyMsg').textContent = !ok ? '동의 항목 두 개에 체크해 주세요.' :
      (!any ? '사진을 올리거나 골격 질문에 답해 주세요.' :
        '준비됐어요. ' + (S.face ? '얼굴 ✓ ' : '얼굴 사진 없음 · ') + (S.body ? '전신 ✓ ' : '전신 사진 없음 · ') + (S.bone.some(Boolean) ? '골격 질문 ✓' : '골격 질문 없음'));
  }

  /* ---------- 분석 엔진 (MediaPipe, 기기 안에서 실행) ---------- */
  var faceMesh = null, pose = null, faceResolve = null, poseResolve = null;
  function getFaceMesh() {
    if (faceMesh) return faceMesh;
    faceMesh = new FaceMesh({ locateFile: function (f) { return 'vendor/face_mesh/' + f; } });
    faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5 });
    faceMesh.onResults(function (r) { if (faceResolve) { faceResolve(r); faceResolve = null; } });
    return faceMesh;
  }
  function getPose() {
    if (pose) return pose;
    pose = new Pose({ locateFile: function (f) { return 'vendor/pose/' + f; } });
    pose.setOptions({ modelComplexity: 1, enableSegmentation: true, smoothLandmarks: false, smoothSegmentation: false, minDetectionConfidence: 0.5 });
    pose.onResults(function (r) { if (poseResolve) { poseResolve(r); poseResolve = null; } });
    return pose;
  }
  function runFace(cv) { return new Promise(function (res, rej) { faceResolve = res; getFaceMesh().send({ image: cv }).catch(rej); }); }
  function runPose(cv) { return new Promise(function (res, rej) { poseResolve = res; getPose().send({ image: cv }).catch(rej); }); }

  /* ---------- 얼굴 + 퍼스널컬러 ---------- */
  function sampleCircle(ctx, cx, cy, rad) {
    var x0 = Math.max(0, Math.round(cx - rad)), y0 = Math.max(0, Math.round(cy - rad));
    var w = Math.max(1, Math.round(rad * 2)), h = w;
    var d = ctx.getImageData(x0, y0, w, h).data, R = [], G = [], B = [];
    for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) {
      var dx = x0 + i - cx, dy = y0 + j - cy; if (dx * dx + dy * dy > rad * rad) continue;
      var k = (j * w + i) * 4; R.push(d[k]); G.push(d[k + 1]); B.push(d[k + 2]);
    }
    var rgb = [median(R), median(G), median(B)];
    if (S.wb) rgb = rgb.map(function (v, i) { return v * S.wb[i]; });
    return rgb;
  }
  function analyzeFace(r, cv) {
    var lm = r.multiFaceLandmarks && r.multiFaceLandmarks[0];
    if (!lm) return { error: '얼굴을 찾지 못했어요. 정면을 보고 얼굴 전체가 나오게 다시 찍어 주세요.' };
    var W = cv.width, H = cv.height, P = function (i) { return [lm[i].x * W, lm[i].y * H]; };
    var dist = function (a, b) { var p = P(a), q = P(b); return Math.hypot(p[0] - q[0], p[1] - q[1]); };
    var top = P(10), chin = P(152), ax = [chin[0] - top[0], chin[1] - top[1]], len = Math.hypot(ax[0], ax[1]);
    var t = function (i) { var p = P(i); return ((p[0] - top[0]) * ax[0] + (p[1] - top[1]) * ax[1]) / len; };
    var upper = t(9), middle = t(2) - t(9), lower = len - t(2), sum = upper + middle + lower;
    var cheekW = dist(234, 454), jawW = dist(172, 397), foreW = dist(54, 284);
    var LW = len / cheekW, jawR = jawW / cheekW, foreR = foreW / cheekW;
    var shape;
    if (LW >= 1.38) shape = 'long';
    else if (jawR >= 0.85 && LW < 1.28) shape = 'square';
    else if (LW < 1.14) shape = 'round';
    else if (foreR >= 0.9 && jawR < 0.78) shape = 'heart';
    else if (foreR < 0.82 && jawR < 0.78) shape = 'diamond';
    else shape = 'oval';

    var ctx = cv.getContext('2d'), rad = cheekW * 0.035;
    var skins = [50, 280, 151].map(function (i) { var p = P(i); return sampleCircle(ctx, p[0], p[1], rad); });
    var skin = [0, 1, 2].map(function (c) { return median(skins.map(function (s) { return s[c]; })); });
    var irisR = lm.length > 473 ? dist(469, 471) / 2 : cheekW * 0.02;
    var eyes = (lm.length > 473 ? [468, 473] : [159, 386]).map(function (i) { var p = P(i); return sampleCircle(ctx, p[0], p[1], Math.max(2, irisR * 0.45)); });
    var eye = [0, 1, 2].map(function (c) { return (eyes[0][c] + eyes[1][c]) / 2; });
    var hp = [top[0] - ax[0] / len * len * 0.13, top[1] - ax[1] / len * len * 0.13];
    var hair = hp[1] > rad ? sampleCircle(ctx, hp[0], hp[1], rad) : null;
    var Ls = srgbToLab(skin), Le = srgbToLab(eye), Lh = hair ? srgbToLab(hair) : null;
    if (Lh && Lh[0] > Ls[0] - 15) { hair = null; Lh = null; }
    var hue = Math.atan2(Ls[2], Ls[1]) * 180 / Math.PI, chroma = Math.hypot(Ls[1], Ls[2]);
    var dark = Lh ? Math.min(Le[0], Lh[0]) : Le[0];
    var contrast = Ls[0] - dark;
    return { ok: true, lm: lm, shape: shape, ratio: [upper / sum, middle / sum, lower / sum], LW: LW, jawR: jawR, foreR: foreR,
      skin: skin, eye: eye, hair: hair, Ls: Ls, hue: hue, chroma: chroma, contrast: contrast };
  }
  function decideSeason(f) {
    var q = S.color.reduce(function (a, b) { return a + b; }, 0);
    var photo = f && f.ok ? clamp((f.hue - 56) / 4, -2, 2) : 0;
    var total = photo + 0.8 * q;
    var under = total > 0.6 ? '웜' : total < -0.6 ? '쿨' : '뉴트럴';
    var warm = total >= 0;
    var light = true, lightScore = 0;
    if (f && f.ok) { lightScore = (f.Ls[0] - 62) / 5 - (f.contrast - 40) / 8; light = lightScore >= 0; }
    var key = warm ? (light ? 'SP' : 'AU') : (light ? 'SU' : 'WI');
    var conf = (Math.abs(total) > 1.5 && Math.abs(lightScore) > 0.8) ? '보통' : '낮음';
    return { key: key, under: under, total: total, lightScore: lightScore, conf: conf, hasPhoto: !!(f && f.ok) };
  }

  /* ---------- 체형 ---------- */
  function analyzeBody(r, cv) {
    var lm = r.poseLandmarks;
    if (!lm) return { error: '몸을 찾지 못했어요. 머리부터 발끝까지 나오게 다시 찍어 주세요.' };
    var W = cv.width, H = cv.height;
    var vis = function (i) { return (lm[i].visibility == null ? 1 : lm[i].visibility) > 0.5; };
    if (![11, 12, 23, 24].every(vis)) return { error: '어깨와 골반이 잘 보이지 않아요. 정면 전신 사진으로 다시 찍어 주세요.' };
    var mc = document.createElement('canvas'); mc.width = W; mc.height = H;
    var mx = mc.getContext('2d'); mx.drawImage(r.segmentationMask, 0, 0, W, H);
    var md = mx.getImageData(0, 0, W, H).data;
    var on = function (x, y) { var k = (y * W + x) * 4; return Math.max(md[k], md[k + 3]) > 127; };
    var px = function (i) { return [lm[i].x * W, lm[i].y * H]; };
    var sh = [px(11), px(12)], hp = [px(23), px(24)];
    var shY = (sh[0][1] + sh[1][1]) / 2, hipY = (hp[0][1] + hp[1][1]) / 2, torso = hipY - shY;
    var cx = Math.round((hp[0][0] + hp[1][0] + sh[0][0] + sh[1][0]) / 4);
    function run(y) {
      y = Math.round(clamp(y, 0, H - 1));
      if (!on(cx, y)) return null;
      var l = cx, rr = cx; while (l > 0 && on(l - 1, y)) l--; while (rr < W - 1 && on(rr + 1, y)) rr++;
      return { y: y, l: l, r: rr, w: rr - l + 1 };
    }
    var sRow = run(shY + torso * 0.06);
    var wRow = null;
    for (var y = shY + torso * 0.45; y <= hipY - torso * 0.05; y += 2) { var rw = run(y); if (rw && (!wRow || rw.w < wRow.w)) wRow = rw; }
    var eL = Math.min(lm[13].x, lm[14].x) * W, eR = Math.max(lm[13].x, lm[14].x) * W;
    var wL = Math.min(lm[15].x, lm[16].x) * W, wR = Math.max(lm[15].x, lm[16].x) * W;
    var armFree = function (rr) { return rr.l > Math.min(eL, wL) + 4 && rr.r < Math.max(eR, wR) - 4 && rr.w < (eR - eL) * 0.92; };
    var bRow = null;
    for (var yb = shY + torso * 0.5; yb <= hipY - torso * 0.05; yb += 2) { var rb = run(yb); if (rb && armFree(rb) && (!bRow || rb.w > bRow.w)) bRow = rb; }
    var hRow = null;
    for (var y2 = hipY - torso * 0.05; y2 <= hipY + torso * 0.22; y2 += 2) { var rh = run(y2); if (rh && (!hRow || rh.w > hRow.w)) hRow = rh; }
    if (!sRow || !wRow || !hRow) return { error: '몸 윤곽을 읽지 못했어요. 배경을 단순하게 하고 다시 찍어 주세요.' };
    var warn = [];
    var elbows = [px(13), px(14)], wrists = [px(15), px(16)];
    var minElbow = Math.min(elbows[0][0], elbows[1][0]), maxElbow = Math.max(elbows[0][0], elbows[1][0]);
    if (wRow.l <= minElbow + 2 || wRow.r >= maxElbow - 2) warn.push('팔이 몸에 붙어 허리 너비가 크게 잡혔을 수 있어요.');
    var minWr = Math.min(wrists[0][0], wrists[1][0]), maxWr = Math.max(wrists[0][0], wrists[1][0]);
    if (hRow.l <= minWr + 2 || hRow.r >= maxWr - 2) warn.push('손이 골반 옆에 닿아 골반 너비가 크게 잡혔을 수 있어요.');
    var S_ = sRow.w, W_ = wRow.w, H_ = hRow.w, g = gender(), type;
    var SH = S_ / H_, WH = W_ / H_, WS = W_ / S_, BH = bRow ? bRow.w / H_ : WH;
    if (g === 'f') {
      if (WH >= 0.92 && WS >= 0.8) type = 'oval';
      else if (SH >= 1.08) type = 'invtri';
      else if (SH <= 0.93) type = 'triangle';
      else type = WH <= 0.76 ? 'hourglass' : 'rect';
    } else {
      if (WH >= 0.92 && WS >= 0.75) type = 'oval';
      else if (SH >= 1.18) type = 'invtri';
      else type = 'rect';
    }
    var ctx = cv.getContext('2d');
    ctx.drawImage(S.body, 0, 0);
    ctx.lineWidth = Math.max(3, W / 300); ctx.font = 'bold ' + Math.max(16, W / 45) + 'px sans-serif';
    [[sRow, '어깨', '#E07A5F'], [wRow, '허리', '#3D85C6'], [hRow, '골반', '#6AA84F']].forEach(function (a) {
      ctx.strokeStyle = a[2]; ctx.fillStyle = a[2]; ctx.beginPath(); ctx.moveTo(a[0].l, a[0].y); ctx.lineTo(a[0].r, a[0].y); ctx.stroke();
      ctx.fillText(a[1], a[0].r + 8, a[0].y + 6);
    });
    return { ok: true, type: type, S: S_, W: W_, H: H_, SH: SH, WH: WH, WS: WS, BH: BH, warn: warn };
  }

  /* ---------- 골격 ---------- */
  function decideBone() {
    var qs = D.bone.questions[gender()], sc = { S: 0, W: 0, N: 0 }, up = { S: 0, W: 0, N: 0 }, n = 0;
    S.bone.forEach(function (v, i) { if (v) { sc[v]++; n++; if (qs[i].up) up[v]++; } });
    if (!n) return null;
    var best = ['S', 'W', 'N'].sort(function (a, b) { return (sc[b] - sc[a]) || (up[b] - up[a]); })[0];
    return { key: best, sc: sc, n: n };
  }

  /* ---------- 실행 ---------- */
  $('runBtn').addEventListener('click', function () {
    busy(true, '분석 엔진을 준비하는 중… (처음 한 번은 10~20초 걸려요)');
    var out = { face: null, body: null };
    var chain = Promise.resolve();
    if (S.face) chain = chain.then(function () {
      busy(true, '얼굴과 피부 톤을 분석하는 중…');
      var cv = $('cvFace'); cv.getContext('2d').drawImage(S.face, 0, 0);
      return runFace(S.face).then(function (r) { out.face = analyzeFace(r, S.face); });
    });
    if (S.body) chain = chain.then(function () {
      busy(true, '체형 윤곽을 분석하는 중…');
      return runPose(S.body).then(function (r) { out.body = analyzeBody(r, $('cvBody')); });
    });
    chain.then(function () {
      out.season = (S.face || S.color.some(Boolean)) ? decideSeason(out.face) : null;
      out.bone = decideBone();
      S.res = out; renderResults(); busy(false);
      $('resultCard').classList.remove('hidden'); $('resultCard').scrollIntoView({ behavior: 'smooth' });
    }).catch(function (e) {
      busy(false); console.error(e);
      alert('분석 중 문제가 생겼어요. 페이지를 새로고침한 뒤 다시 시도해 주세요.\n(' + (e && e.message ? e.message : e) + ')');
    });
  });

  /* ---------- 결과 화면 ---------- */
  function sel(id, opts, cur) {
    return '<select id="' + id + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === cur ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>';
  }
  function pct(v) { return Math.round(v * 100) + '%'; }
  function renderResults() {
    var R = S.res, g = gender(), html = [];
    // 퍼스널컬러
    var seasonOpts = Object.keys(D.seasons).map(function (k) { return [k, D.seasons[k].name]; });
    if (R.season) {
      var sz = D.seasons[R.season.key], f = R.face && R.face.ok ? R.face : null;
      html.push('<div class="res"><h3>PERSONAL COLOR</h3><div class="big">' + esc(sz.name) + '</div>' +
        '<div class="meta">언더톤 ' + R.season.under + ' · 신뢰도 ' + R.season.conf + (R.season.hasPhoto ? '' : ' · 사진 없이 질문만으로 판정') + (S.wb ? ' · 색 보정 적용' : ' · 색 보정 없음') + '</div>' +
        (f ? '<div class="sw"><span><i style="background:' + hex(f.skin) + '"></i>피부</span><span><i style="background:' + hex(f.eye) + '"></i>눈동자</span>' + (f.hair ? '<span><i style="background:' + hex(f.hair) + '"></i>머리카락</span>' : '') + '</div>' +
          '<table class="m"><tr><td>피부 밝기 (L*)</td><td>' + f.Ls[0].toFixed(1) + '</td></tr><tr><td>피부 색상각 (높을수록 노란기)</td><td>' + f.hue.toFixed(1) + '°</td></tr><tr><td>피부-눈·머리 대비</td><td>' + f.contrast.toFixed(1) + '</td></tr></table>' : '') +
        '<label class="t" for="fSeason">최종 퍼스널컬러</label>' + sel('fSeason', seasonOpts, R.season.key) + '</div>');
    }
    // 얼굴
    if (R.face) {
      if (R.face.error) html.push('<div class="res"><h3>FACE</h3><div class="notice warn">' + esc(R.face.error) + '</div></div>');
      else {
        var fs = D.faceShape[R.face.shape], fo = Object.keys(D.faceShape).map(function (k) { return [k, D.faceShape[k].name]; });
        html.push('<div class="res"><h3>FACE</h3><div class="big">' + esc(fs.name) + '</div>' +
          '<table class="m"><tr><td>상안부 : 중안부 : 하안부</td><td>' + R.face.ratio.map(pct).join(' : ') + '</td></tr><tr><td>세로 / 가로</td><td>' + R.face.LW.toFixed(2) + '</td></tr><tr><td>턱 너비 / 광대 너비</td><td>' + R.face.jawR.toFixed(2) + '</td></tr><tr><td>이마 너비 / 광대 너비</td><td>' + R.face.foreR.toFixed(2) + '</td></tr></table>' +
          '<div class="meta">상안부는 인식된 이마 윗부분 기준이라 실제 헤어라인보다 짧게 잡혀요.</div>' +
          '<label class="t" for="fFace">최종 얼굴형</label>' + sel('fFace', fo, R.face.shape) + '</div>');
      }
    }
    // 체형
    if (R.body) {
      if (R.body.error) html.push('<div class="res"><h3>BODY</h3><div class="notice warn">' + esc(R.body.error) + '</div></div>');
      else {
        var so = D.silhouette[g], b = R.body;
        html.push('<div class="res"><h3>BODY SILHOUETTE</h3><div class="big">' + esc(so[b.type].name) + '</div>' +
          '<table class="m"><tr><td>어깨 : 허리 : 골반 (골반=100)</td><td>' + Math.round(b.S / b.H * 100) + ' : ' + Math.round(b.W / b.H * 100) + ' : 100</td></tr><tr><td>어깨 / 골반</td><td>' + b.SH.toFixed(2) + '</td></tr><tr><td>허리(가장 좁은 곳) / 골반</td><td>' + b.WH.toFixed(2) + '</td></tr></table>' +
          (b.warn.length ? '<div class="notice warn">' + b.warn.map(esc).join('<br>') + '</div>' : '') +
          '<label class="t" for="fSil">최종 실루엣</label>' + sel('fSil', Object.keys(so).map(function (k) { return [k, so[k].name]; }), b.type) + '</div>');
      }
    }
    // 골격
    var bo = ['S', 'W', 'N'].map(function (k) { return [k, D.bone.types[k].name]; });
    if (R.bone) {
      html.push('<div class="res"><h3>BONE TYPE</h3><div class="big">' + esc(D.bone.types[R.bone.key].name) + '</div>' +
        '<div class="meta">질문 ' + R.bone.n + '개 응답 · 스트레이트 ' + R.bone.sc.S + ' / 웨이브 ' + R.bone.sc.W + ' / 내추럴 ' + R.bone.sc.N + '</div>' +
        '<div class="meta">골격은 사진보다 질감·관절 확인이 중요해요. 손목·쇄골을 직접 보고 확정해 주세요.</div>' +
        '<label class="t" for="fBone">최종 골격</label>' + sel('fBone', bo, R.bone.key) + '</div>');
    } else {
      html.push('<div class="res"><h3>BONE TYPE</h3><div class="meta">골격 질문에 답하지 않았어요. 직접 확인한 결과를 골라 주세요.</div>' +
        '<label class="t" for="fBone">최종 골격</label>' + sel('fBone', [['', '선택 안 함']].concat(bo), '') + '</div>');
    }
    $('results').innerHTML = html.join('');
  }

  /* ---------- 스타일북 ---------- */
  function val(id) { var el = $(id); return el ? el.value : ''; }
  function buildBook() {
    var g = gender(), name = $('cName').value.trim() || '고객', today = new Date();
    var date = today.getFullYear() + '. ' + (today.getMonth() + 1) + '. ' + today.getDate();
    var sk = val('fSeason'), fk = val('fFace'), bk = val('fBone'), lk = val('fSil');
    var sz = sk ? D.seasons[sk] : null, fs = fk ? D.faceShape[fk] : null, bt = bk ? D.bone.types[bk] : null, sl = lk ? D.silhouette[g][lk] : null;
    var R = S.res, inc = $('incPhoto').checked, comment = $('comment').value.trim();
    var foot = '<div class="foot">Muse.lab · 이 스타일북은 사진 측정값과 컨설턴트 진단을 바탕으로 작성되었습니다. · @muse.lab_company</div>';
    var pages = [];
    var summary = [sz && sz.name, bt && bt.name, sl && sl.name, fs && fs.name].filter(Boolean).join(' · ');
    pages.push('<section class="page cover"><div class="brand">MUSE.LAB</div><div class="title">Personal<br>Style Book</div><div class="name">' + esc(name) + ' 님</div><p>' + esc(summary) + '</p><p style="color:var(--sub)">' + date + '</p>' + foot + '</section>');
    if (sz) {
      var f = R.face && R.face.ok ? R.face : null;
      pages.push('<section class="page"><h2>퍼스널컬러 · ' + esc(sz.name) + '</h2><p><b>' + esc(sz.axis) + '</b></p><p>' + esc(sz.desc) + '</p>' +
        '<h3>나에게 어울리는 컬러</h3><div class="book-sw">' + sz.palette.map(function (c) { return '<div><i style="background:' + c[1] + '"></i>' + esc(c[0]) + '</div>'; }).join('') + '</div>' +
        '<div class="kv"><b>옷</b><span>' + esc(sz.cloth) + '</span><b>메이크업·헤어</b><span>' + esc(sz.makeup) + '</span><b>조금 어려운 컬러</b><span>' + esc(sz.avoid) + '</span></div>' +
        (f ? '<h3>측정한 나의 색</h3><div class="sw"><span><i style="background:' + hex(f.skin) + '"></i>피부</span><span><i style="background:' + hex(f.eye) + '"></i>눈동자</span>' + (f.hair ? '<span><i style="background:' + hex(f.hair) + '"></i>머리카락</span>' : '') + '</div>' : '') +
        (inc && S.face ? '<img class="book-photo" src="' + S.face.toDataURL('image/jpeg', 0.85) + '" alt="고객 얼굴 사진">' : '') + foot + '</section>');
    }
    if (bt || sl) {
      var b = R.body && R.body.ok ? R.body : null;
      pages.push('<section class="page"><h2>골격 · 체형</h2>' +
        (bt ? '<h3>골격 · ' + esc(bt.name) + ' <span style="font-weight:400">' + bt.en + '</span></h3><p>' + esc(bt.desc[g]) + '</p><div class="kv"><b>어울리는 핏</b><span>' + esc(bt.fit[g]) + '</span><b>소재</b><span>' + esc(bt.fabric[g]) + '</span><b>스타일링 팁</b><span>' + esc(bt.tip[g]) + '</span></div>' : '') +
        (sl ? '<h3>실루엣 · ' + esc(sl.name) + '</h3><p>' + esc(sl.desc) + '</p>' + (b ? '<div class="kv"><b>어깨 : 허리 : 골반</b><span>' + Math.round(b.S / b.H * 100) + ' : ' + Math.round(b.W / b.H * 100) + ' : 100</span></div>' : '') + '<div class="kv"><b>스타일링 팁</b><span>' + esc(sl.tip) + '</span></div>' : '') +
        (inc && S.body ? '<img class="book-photo" src="' + S.body.toDataURL('image/jpeg', 0.85) + '" alt="고객 전신 사진">' : '') + foot + '</section>');
    }
    if (fs || comment) {
      pages.push('<section class="page">' + (fs ? '<h2>얼굴 · ' + esc(fs.name) + '</h2><p>' + esc(fs.desc) + '</p>' +
        (R.face && R.face.ok ? '<div class="kv"><b>얼굴 비율</b><span>상안부 ' + pct(R.face.ratio[0]) + ' : 중안부 ' + pct(R.face.ratio[1]) + ' : 하안부 ' + pct(R.face.ratio[2]) + '</span></div>' : '') +
        '<div class="kv"><b>스타일링 팁</b><span>' + esc(fs.tip) + '</span></div>' : '') +
        (comment ? '<h2 style="margin-top:12px">컨설턴트 코멘트</h2><p style="white-space:pre-line">' + esc(comment) + '</p>' : '') + foot + '</section>');
    }
    return pages.join('');
  }
  $('bookBtn').addEventListener('click', function () {
    var html = buildBook();
    $('book').innerHTML = html; $('previewHost').innerHTML = html;
    $('previewCard').classList.remove('hidden'); $('previewCard').scrollIntoView({ behavior: 'smooth' });
  });
  $('printBtn').addEventListener('click', function () { $('book').innerHTML = buildBook(); window.print(); });

  /* ---------- 새 고객 ---------- */
  $('resetBtn').addEventListener('click', function () {
    if (confirm('현재 고객의 사진과 결과를 모두 지우고 새로 시작할까요?')) { S.face = null; S.body = null; location.reload(); }
  });
  window.addEventListener('beforeunload', function (e) { if (S.face || S.body) { e.preventDefault(); e.returnValue = ''; } });

  renderQuestions(); renderColorQs(); refresh();
})();

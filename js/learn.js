/* ============================================================
   VARDA — learn.js
   The Academy: study all 88 constellations through 11 lessons,
   then prove it through three quiz stages —
   figure → lines → stars alone.
   ============================================================ */
var VARDA = window.VARDA || {};

VARDA.learn = (function () {
  var root, quiz = null;
  var STAGE_NAMES = ['Figure', 'Lines only', 'Stars alone'];
  var STAGE_KEYS = ['figure', 'lines', 'stars'];

  function lvl(cid) { return VARDA.state.progress[cid] || 0; }
  function setLvl(cid, l) {
    if (l > lvl(cid)) { VARDA.state.progress[cid] = l; VARDA.saveState(); }
  }
  function lessonMastery(les) {
    var s = 0; les.cons.forEach(function (c) { s += lvl(c); });
    return s / (les.cons.length * 3);
  }
  function overallMastery() {
    var s = 0, t = 0;
    VARDA.LESSONS.forEach(function (L) { L.cons.forEach(function (c) { s += lvl(c); t += 3; }); });
    return t ? s / t : 0;
  }
  function masteredCount() {
    var n = 0;
    VARDA.LESSONS.forEach(function (L) { L.cons.forEach(function (c) { if (lvl(c) >= 3) n++; }); });
    return n;
  }

  function unitMastery(u) {
    var s = 0, t = 0;
    u.lessons.forEach(function (li) {
      VARDA.LESSONS[li].cons.forEach(function (c) { s += lvl(c); t += 3; });
    });
    return t ? s / t : 0;
  }
  function unitDone(u) {
    return u.lessons.every(function (li) {
      return VARDA.LESSONS[li].cons.every(function (c) { return lvl(c) >= 3; });
    });
  }

  function build(container) {
    root = container;
    overview();
  }

  /* ---------- Overview ---------- */
  function lessonCardHTML(i) {
    var L = VARDA.LESSONS[i];
    var m = lessonMastery(L);
    var done = L.cons.every(function (c) { return lvl(c) >= 3; });
    return '<div class="lesson-card panel' + (done ? ' done' : '') + '" data-i="' + i + '">' +
      '<div class="lc-num mono">' + L.id + '</div>' +
      '<div class="lc-title">' + L.title + '</div>' +
      '<div class="lc-note">' + L.note + '</div>' +
      '<div class="lc-cons">' + L.cons.map(function (c) {
        var l = lvl(c);
        return '<span class="lc-pip l' + l + '" title="' + VARDA.CON_GEO[c].name + ' \u2014 stage ' + l + '/3">' +
          (VARDA.LORE[c] ? VARDA.LORE[c].sym : '\u2726') + '</span>';
      }).join('') + '</div>' +
      '<div class="bar"><div class="bar-fill" style="width:' + (m * 100) + '%"></div></div>' +
      '<div class="lc-foot">' + (done ? '\u2726 Mastered' : Math.round(m * 100) + '% complete') + '</div>' +
    '</div>';
  }

  function overview() {
    quiz = null;
    var om = overallMastery(), mc = masteredCount();
    var html =
      '<div class="academy-head panel">' +
        '<div class="panel-head"><span class="panel-title">Constellation Academy</span>' +
        '<span class="panel-sub">88 constellations \u00B7 2 units \u00B7 11 lessons \u00B7 3 stages each</span></div>' +
        '<div class="acad-progress">' +
          '<div class="acad-big">' + Math.round(om * 100) + '<span class="pct">%</span></div>' +
          '<div class="acad-meta">' +
            '<div>SKY MASTERY</div>' +
            '<div class="dim">' + mc + ' of 88 constellations fully mastered</div>' +
            '<div class="bar"><div class="bar-fill" style="width:' + (om * 100) + '%"></div></div>' +
          '</div>' +
          (mc === 88 ? '<div class="acad-badge">\u2726 CARTOGRAPHER OF THE WHOLE SKY \u2726</div>' : '') +
        '</div>' +
      '</div>';

    VARDA.UNITS.forEach(function (u) {
      var um = unitMastery(u), ud = unitDone(u);
      html += '<div class="unit-head panel' + (ud ? ' done' : '') + '">' +
        '<div class="unit-row">' +
          '<div><div class="unit-title">' + u.title + '</div>' +
          '<div class="unit-note">' + u.note + '</div></div>' +
          '<div class="unit-pct mono">' + Math.round(um * 100) + '%' +
            (ud ? ' <span class="unit-star">\u2726</span>' : '') + '</div>' +
        '</div>' +
        '<div class="bar"><div class="bar-fill" style="width:' + (um * 100) + '%"></div></div>' +
      '</div><div class="lesson-grid">' +
        u.lessons.map(lessonCardHTML).join('') +
      '</div>';
    });

    root.innerHTML = html;
    root.querySelectorAll('.lesson-card').forEach(function (el) {
      el.onclick = function () { lesson(+el.dataset.i); };
    });
  }

  /* ---------- Lesson (study mode) ---------- */
  function lesson(i) {
    var L = VARDA.LESSONS[i];
    var html =
      '<div class="panel lesson-head">' +
        '<button class="btn btn-ghost" id="a-back">\u2190 Academy</button>' +
        '<div><div class="panel-title">' + L.id + ' \u00B7 ' + L.title + '</div>' +
        '<div class="panel-sub">' + L.note + '</div></div>' +
        '<button class="btn btn-primary" id="a-quiz">Begin examination \u2192</button>' +
      '</div><div class="study-grid">';

    L.cons.forEach(function (cid) {
      var geo = VARDA.CON_GEO[cid], lore = VARDA.LORE[cid];
      var bs = VARDA.catalog.brightestIn(cid);
      var l = lvl(cid);
      html += '<div class="study-card panel">' +
        '<canvas class="study-canvas" data-con="' + cid + '"></canvas>' +
        '<div class="study-body">' +
          '<div class="study-title">' + lore.sym + ' ' + geo.name +
            '<span class="study-lvl mono" title="Quiz stages passed">' +
            '\u25CF'.repeat(l) + '\u25CB'.repeat(3 - l) + '</span></div>' +
          '<div class="study-sub">' + (geo.en !== geo.name ? '\u201C' + geo.en + '\u201D \u00B7 ' : '') + geo.gen + '</div>' +
          '<div class="study-myth">' + lore.myth + '</div>' +
          '<div class="study-star"><b>Key star:</b> ' + lore.star +
            (bs && bs[2] != null ? ' \u00B7 mag ' + bs[2].toFixed(1) : '') + '</div>' +
        '</div></div>';
    });
    html += '</div>';
    root.innerHTML = html;
    root.querySelector('#a-back').onclick = overview;
    root.querySelector('#a-quiz').onclick = function () { startQuiz(i); };

    // render the figures after layout
    requestAnimationFrame(function () {
      root.querySelectorAll('.study-canvas').forEach(function (cv) {
        var cid = cv.dataset.con;
        VARDA.drawConstellationCard(cv, cid, 'figure', { fieldStars: true });
      });
    });
  }

  /* ---------- Quiz ---------- */
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function startQuiz(lessonIdx, stage) {
    var L = VARDA.LESSONS[lessonIdx];
    quiz = {
      lesson: lessonIdx,
      stage: stage || 0,
      queue: shuffle(L.cons),
      total: L.cons.length,
      right: 0, asked: 0,
      streakWrong: {}
    };
    question();
  }

  function question() {
    var L = VARDA.LESSONS[quiz.lesson];
    if (!quiz.queue.length) { stageDone(); return; }
    var cid = quiz.queue[0];
    // distractors: prefer same lesson, fall back to all 88
    var pool = L.cons.filter(function (c) { return c !== cid; });
    var others = shuffle(Object.keys(VARDA.CON_GEO).filter(function (c) {
      return c !== cid && pool.indexOf(c) < 0;
    }));
    var opts = shuffle(pool).slice(0, 3);
    while (opts.length < 3) opts.push(others.pop());
    var choices = shuffle([cid].concat(opts));

    var prog = (quiz.total - quiz.queue.length) / quiz.total * 100;
    root.innerHTML =
      '<div class="quiz-wrap">' +
        '<div class="panel quiz-panel">' +
          '<div class="quiz-top">' +
            '<button class="btn btn-ghost" id="q-exit">\u2190 Exit</button>' +
            '<div class="quiz-stage">' +
              STAGE_NAMES.map(function (s, i) {
                return '<span class="stage-pip' + (i === quiz.stage ? ' on' : i < quiz.stage ? ' past' : '') + '">' + s + '</span>';
              }).join('<span class="stage-sep">\u2192</span>') +
            '</div>' +
            '<div class="mono dim">' + (quiz.total - quiz.queue.length) + '/' + quiz.total + '</div>' +
          '</div>' +
          '<div class="bar slim"><div class="bar-fill" style="width:' + prog + '%"></div></div>' +
          '<div class="quiz-q">Identify this constellation' +
            (quiz.stage === 2 ? ' <span class="dim">(stars alone \u2014 no lines)</span>' :
             quiz.stage === 1 ? ' <span class="dim">(lines only)</span>' : '') + '</div>' +
          '<canvas id="q-canvas" class="quiz-canvas"></canvas>' +
          '<div class="quiz-choices" id="q-choices"></div>' +
          '<div class="quiz-feedback" id="q-feedback"></div>' +
        '</div>' +
      '</div>';

    root.querySelector('#q-exit').onclick = function () { lesson(quiz.lesson); };

    requestAnimationFrame(function () {
      VARDA.drawConstellationCard(root.querySelector('#q-canvas'), cid, STAGE_KEYS[quiz.stage],
        { fieldStars: quiz.stage !== 1 });
    });

    var box = root.querySelector('#q-choices');
    choices.forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'choice';
      b.dataset.cid = c;
      b.innerHTML = VARDA.CON_GEO[c].name +
        (VARDA.CON_GEO[c].en !== VARDA.CON_GEO[c].name ? ' <span class="dim">\u00B7 ' + VARDA.CON_GEO[c].en + '</span>' : '');
      b.onclick = function () { answer(c, cid, b, box); };
      box.appendChild(b);
    });
  }

  function answer(picked, correct, btn, box) {
    box.querySelectorAll('.choice').forEach(function (b) { b.disabled = true; });
    var fb = root.querySelector('#q-feedback');
    quiz.asked++;
    if (picked === correct) {
      btn.classList.add('right');
      quiz.right++;
      quiz.queue.shift();
      var praise = ['Confirmed.', 'Locked in.', 'On target.', 'Verified.', 'Course true.'];
      fb.innerHTML = '<span class="ok">' + praise[Math.floor(Math.random() * praise.length)] + '</span>';
      setTimeout(question, 1100);
    } else {
      btn.classList.add('wrong');
      box.querySelectorAll('.choice').forEach(function (b) {
        if (b.dataset.cid === correct) b.classList.add('right');
      });
      // requeue at the back for another pass
      quiz.queue.push(quiz.queue.shift());
      fb.innerHTML = '<span class="bad">That was <b>' + VARDA.CON_GEO[correct].name +
        '</b> \u2014 \u201C' + VARDA.CON_GEO[correct].en + '\u201D. It will come around again.</span>';
      setTimeout(question, 5200);
    }
  }

  function stageDone() {
    var L = VARDA.LESSONS[quiz.lesson];
    // passing a stage raises every constellation in the lesson to that level
    L.cons.forEach(function (c) { setLvl(c, quiz.stage + 1); });
    var acc = quiz.asked ? Math.round(quiz.right / quiz.asked * 100) : 100;
    var last = quiz.stage === 2;
    var allDone = last && L.cons.every(function (c) { return lvl(c) >= 3; });

    root.innerHTML =
      '<div class="quiz-wrap"><div class="panel quiz-panel done-panel">' +
        '<div class="done-glyph">' + (last ? '\u2726' : '\u25C8') + '</div>' +
        '<div class="done-title">' + (last ? 'Lesson mastered' : STAGE_NAMES[quiz.stage] + ' stage cleared') + '</div>' +
        '<div class="done-sub">' + L.id + ' \u00B7 ' + L.title + ' \u00B7 accuracy ' + acc + '%</div>' +
        (allDone ? '<div class="done-note">All eight figures identified from their stars alone. ' +
          (masteredCount() === 88
            ? 'And with that \u2014 <b>the entire sky is yours.</b> All 88 constellations mastered.'
            : 'They are yours now \u2014 you will find them from a dark field without a chart.') + '</div>' : '') +
        '<div class="done-actions">' +
          (last
            ? '<button class="btn btn-primary" id="d-next">Return to Academy</button>'
            : '<button class="btn btn-primary" id="d-next">Next stage: ' + STAGE_NAMES[quiz.stage + 1] + ' \u2192</button>') +
          '<button class="btn btn-ghost" id="d-back">Lesson page</button>' +
        '</div>' +
      '</div></div>';

    root.querySelector('#d-next').onclick = function () {
      if (last) overview(); else startQuiz(quiz.lesson, quiz.stage + 1);
    };
    root.querySelector('#d-back').onclick = function () { lesson(quiz.lesson); };
  }

  return { build: build, refresh: function () { if (root && !quiz) overview(); } };
})();

window.VARDA = VARDA;

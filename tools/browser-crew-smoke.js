// Run from the lobby with agent-browser eval --stdin. Creates only a QA-owned waiting room.
(async () => {
  const checks = [];
  const $ = selector => document.querySelector(selector);
  const cards = () => [...document.querySelectorAll('#crewGrid .crew-card')];
  const check = (name, condition) => { if (!condition) throw new Error(name); checks.push(name); };
  const until = async fn => {
    const end = Date.now() + 10000;
    while (!fn()) {
      if (Date.now() > end) throw new Error('Timed out: ' + fn);
      await new Promise(resolve => setTimeout(resolve, 30));
    }
  };
  check('catalog-contains-24-unique-identities', KungCrew.length === 24 && new Set(KungCrew.map(c => c.id)).size === 24);
  $('[data-crew-filter="all"]').click();
  const ids = [];
  for (let page = 0; page < 3; page++) {
    check('page-' + (page + 1) + '-renders-eight-cards', cards().length === 8);
    ids.push(...cards().map(card => Number(card.dataset.mascot)));
    if (page < 2) $('#crewNext').click();
  }
  check('pagination-reaches-every-character-once', ids.length === 24 && new Set(ids).size === 24 && $('#crewNext').disabled);
  for (const [group, count] of [['explorers', 8], ['aliens', 6], ['robots', 6]]) {
    $('[data-crew-filter="' + group + '"]').click();
    check(group + '-filter-matches-catalog', cards().length === count && cards().every(card => KungCrew[Number(card.dataset.mascot)].group === group));
  }
  const loaded = await Promise.all(KungCrew.filter(c => !c.atlas).map(crew => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => img.naturalWidth === 512 && img.naturalHeight === 512 ? resolve(crew.key) : reject(new Error('Wrong dimensions: ' + crew.key));
    img.onerror = () => reject(new Error('Portrait missing: ' + crew.key));
    img.src = crew.image;
  })));
  check('all-20-ai-portraits-load-at-512px', loaded.length === 20);
  $('#crewGrid [data-mascot="18"]').click();
  check('chosen-robot-updates-storage-and-hero', localStorage.getItem('segulja-mascot') === '18' && $('#heroMascot').dataset.mascot === '18');
  $('#crewRandom').click();
  const random = Number(localStorage.getItem('segulja-mascot'));
  check('random-picks-a-different-visible-group-character', random !== 18 && KungCrew[random].group === 'robots' && $('#crewGrid [aria-pressed="true"]').dataset.mascot === String(random));
  $('#crewGrid [data-mascot="18"]').click();
  check('lobby-has-no-horizontal-overflow', document.documentElement.scrollWidth <= innerWidth + 1);
  $('#createButton').click();
  check('setup-shows-selected-character', $('#setupDialog').open && $('#setupMascot').dataset.mascot === '18');
  $('#nicknameInput').value = '별빛탐험가';
  $('#setupForm').requestSubmit($('#setupSubmit'));
  await until(() => !$('#gameScreen').hidden && document.querySelectorAll('.player-card').length === 1);
  for (let i = 0; i < 7; i++) {
    $('#addBotButton').click();
    await until(() => document.querySelectorAll('.player-card').length === i + 2);
  }
  const avatars = [...document.querySelectorAll('.player-card .avatar')];
  check('server-keeps-human-selected-character', avatars[0].dataset.mascot === '18');
  check('eight-people-and-bots-have-unique-portraits', avatars.length === 8 && new Set(avatars.map(a => a.dataset.mascot)).size === 8);
  check('every-room-portrait-uses-catalog-asset', avatars.every(a => a.style.backgroundImage.includes(KungCrew[Number(a.dataset.mascot)].image)));
  check('full-room-hides-add-bot', $('#addBotButton').hidden);
  check('game-has-no-horizontal-overflow', document.documentElement.scrollWidth <= innerWidth + 1);
  return {passed: checks.length, checks, loaded, room: $('#roomCode').textContent, roster: avatars.map(a => ({id: Number(a.dataset.mascot), name: a.title})), viewport: {width: innerWidth, height: innerHeight}};
})()

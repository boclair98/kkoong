const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {Lesson} = require('../src/main/resources/static/practice.js');
test('example lesson teaches a real three-word chain without inventing dictionary entries', () => {
  const lesson = new Lesson();
  const dictionary = new Set(fs.readFileSync(require('node:path').join(__dirname, '../src/main/resources/words-ko.txt'), 'utf8').split(/\r?\n/));
  for (const word of lesson.words) {
    assert.ok(dictionary.has(word)); assert.equal(lesson.syllable, word[0]);
    assert.equal(lesson.submit(word).ok, true);
  }
  assert.equal(lesson.done, true); assert.equal(lesson.submit('줄넘기').ok, false);
});
test('invalid length, syllable and different example are rejected without advancing', () => {
  const lesson = new Lesson();
  for (const value of ['아', '아버지', '자뷁쀍', '자장면']) assert.equal(lesson.submit(value).ok, false);
  assert.equal(lesson.index, 0);
  assert.equal(lesson.submit(' 자전거 ').ok, true);
});

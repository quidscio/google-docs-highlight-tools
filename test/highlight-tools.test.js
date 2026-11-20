'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const type = {
  TEXT: 'TEXT', PARAGRAPH: 'PARAGRAPH', LIST_ITEM: 'LIST_ITEM', TABLE_CELL: 'TABLE_CELL'
};
const code = ['Library.js', 'Highlights.js', 'Code.js'].map(file =>
  readFileSync(path.join(__dirname, '..', 'src', file), 'utf8')
).join('\n');

function fixture(services = {}) {
  const context = vm.createContext({
    DocumentApp: { ElementType: type },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (algorithm, value) => createHash(algorithm).update(value).digest(),
      base64EncodeWebSafe: bytes => bytes.toString('base64url')
    },
    ...services
  });
  vm.runInContext(code, context);
  return context;
}

function text(value, changes = { 0: null }, edits = []) {
  return {
    getType: () => type.TEXT,
    asText() { return this; },
    getText: () => value,
    getTextAttributeIndices: () => Object.keys(changes).map(Number),
    getBackgroundColor: offset => changes[offset],
    setBackgroundColor: (...args) => edits.push(args)
  };
}

function container(kind, children, fields = {}) {
  return {
    getType: () => kind,
    getNumChildren: () => children.length,
    getChild: index => children[index],
    ...fields
  };
}

function range(element, start = -1, end = -1) {
  return {
    getElement: () => element,
    isPartial: () => start >= 0,
    getStartOffset: () => start,
    getEndOffsetInclusive: () => end
  };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('highlight and clear use fresh selection ranges and leave surrounding text and objects alone', () => {
  const edits = [];
  const otherEdits = [];
  const paragraph = container(type.PARAGRAPH, [
    text('Other line', {}, otherEdits),
    { getType: () => 'INLINE_IMAGE' }
  ]);
  const first = text('first word', {}, edits);
  let selection = [range(first, 6, 9), range(paragraph)];
  const fieldCalls = [];
  const fixtureServices = {
    DocumentApp: { ElementType: type, getActiveDocument: () => ({
      getSelection: () => selection ? { getRangeElements: () => selection } : null
    }) },
    LockService: { getUserLock: () => ({ tryLock: () => true, releaseLock: () => fieldCalls.push('released') }) },
    CardService: {
      newActionResponseBuilder() {
        return {
          setStateChanged(changed) { this.changed = changed; return this; },
          setNotification(notification) { this.message = notification; return this; },
          build() { return { changed: this.changed, message: this.message }; }
        };
      },
      newNotification: () => ({ setText: value => value })
    }
  };
  const runtime = fixture(fixtureServices);
  const highlight = color => runtime.applyHighlight({ commonEventObject: { parameters: { color } } });
  assert.equal(highlight('#FFFF00').changed, true);
  assert.deepEqual(edits, [[6, 9, '#FFFF00']]);
  assert.deepEqual(otherEdits, [[0, 9, '#FFFF00']]);
  selection = [range(first, 0, 4)];
  assert.equal(highlight('clear').changed, true);
  assert.deepEqual(edits.at(-1), [0, 4, null]);
  selection = null;
  assert.equal(highlight('#FFFF00').changed, false);
  assert.equal(edits.length, 2);
  assert.equal(fieldCalls.length, 3);
});

test('extraction joins uninterrupted color runs and handles lists and table cell shading in order', () => {
  const runtime = fixture();
  const red = '#F4CCCC';
  const blue = '#A4C2F4';
  const paragraph = container(type.PARAGRAPH, [text('A BC D', { 0: null, 2: red, 3: red, 4: null })]);
  const list = container(type.LIST_ITEM, [text('split', { 0: blue }), text(' run', { 0: blue })]);
  const cell = container(type.TABLE_CELL, [container(type.PARAGRAPH, [text('shaded cell')])], {
    asTableCell() { return this; }, getBackgroundColor: () => red, getText: () => 'shaded cell'
  });
  const table = container('TABLE', [container('TABLE_ROW', [cell])]);
  const white = container(type.PARAGRAPH, [text('white', { 0: '#ffffff' })]);
  const highlights = runtime.extractHighlights_(container('BODY_SECTION', [paragraph, list, table, white]));
  assert.deepEqual(plain(highlights), [
    { color: red, text: 'BC' }, { color: blue, text: 'split run' }, { color: red, text: 'shaded cell' }
  ]);
  const palette = { colors: [{ color: blue, label: 'Example' }] };
  assert.deepEqual(plain(runtime.reportRows_(highlights, palette, 'color')).slice(1), [
    ['Example', 'split run'], [red, 'BC\n\nshaded cell']
  ]);
  assert.deepEqual(plain(runtime.reportRows_(highlights, palette, 'sequence')).slice(1), [
    [red, 'BC'], ['Example', 'split run'], [red, 'shaded cell']
  ]);
});

test('legacy blocks import across CRLF, skip malformed neighbors, and round-trip labels and colors', () => {
  const runtime = fixture();
  const header = '*'.repeat(44) + 'Highlighter Values' + '*'.repeat(44);
  const footer = '*'.repeat(37) + 'Do not modify this block of text' + '*'.repeat(37);
  const legacy = [header, '<<<<<Research>>>>>', '"Key \"quote\"" : "#a4c2f4"', '"Urgent" : "#f4cccc"', footer];
  const malformed = [header, '<<<<<Invalid>>>>>', 'nonsense', footer];
  const found = [...runtime.scanShareBlocks_([...malformed, ...legacy, ...legacy].join('\r\n')).values()];
  assert.deepEqual(plain(found), [{
    name: 'Research',
    colors: [{ label: 'Key "quote"', color: '#A4C2F4' }, { label: 'Urgent', color: '#F4CCCC' }]
  }]);
  assert.deepEqual(plain([...runtime.scanShareBlocks_(runtime.shareBlock_(found[0]).join('\n')).values()]), plain(found));
  assert.throws(() => runtime.parsePalette_('Research', 'Blue'), /hex color and label/);
});

test('linked exports only accept Google Docs URLs and preserve an explicit tab ID', () => {
  const runtime = fixture();
  assert.deepEqual(plain(runtime.parseDocumentLink_('https://docs.google.com/document/u/0/d/Ab-c_d/edit?usp=sharing&tab=t.test#heading=h.abc')), {
    id: 'Ab-c_d', tabId: 't.test'
  });
  for (const url of ['https://example.com/document/d/file/edit', 'https://docs.google.com/spreadsheets/d/file/edit']) {
    assert.throws(() => runtime.parseDocumentLink_(url), /link for a Google Doc/);
  }
});

test('body operations use the actual active tab and avoid falling back on a multi-tab document', () => {
  const runtime = fixture();
  const chosen = {};
  const tab = {
    asDocumentTab: () => ({ getBody: () => chosen }),
    getChildTabs: () => []
  };
  assert.equal(runtime.activeBody_({ getActiveTab: () => tab }), chosen);
  assert.equal(runtime.activeBody_({ getActiveTab: () => null, getTabs: () => [tab] }), chosen);
  assert.throws(() => runtime.activeBody_({ getActiveTab: () => null, getTabs: () => [tab, tab] }), /active tab/);
});

test('export writes to the requested tab or new Doc and creates nothing for an empty result', () => {
  const calls = [];
  const red = '#F4CCCC';
  const destinationTab = () => ({
    appendParagraph: () => ({ setHeading: () => {} }),
    appendTable: rows => calls.push(plain(rows))
  });
  const body = container('BODY_SECTION', [
    container(type.PARAGRAPH, [text('an example', { 0: red })])
  ], destinationTab());
  const sibling = destinationTab();
  const source = {
    getId: () => 'source',
    getName: () => 'Example',
    getUrl: () => 'https://docs.google.com/document/d/source/edit',
    getActiveTab: () => ({ asDocumentTab: () => ({ getBody: () => body }) }),
    getTab: id => id === 't.sibling' ? { asDocumentTab: () => ({ getBody: () => sibling }) } : null
  };
  const newDoc = {
    getBody: () => destinationTab(),
    getUrl: () => 'https://docs.google.com/document/d/new/edit',
    saveAndClose: () => calls.push('saved')
  };
  const runtime = fixture({
    DocumentApp: {
      ElementType: type,
      ParagraphHeading: { HEADING2: 'HEADING2' },
      getActiveDocument: () => source,
      create: name => { calls.push(name); return newDoc; }
    },
    LockService: { getUserLock: () => ({ tryLock: () => true, releaseLock() {} }) }
  });
  runtime.readLibrary_ = () => ({ sets: [{ id: 'standard', colors: [{ color: red, label: 'Example' }] }] });
  runtime.reply_ = message => message;
  runtime.showDocument_ = (_title, url) => url;

  function run(target, url = '') {
    return runtime.exportHighlights({
      commonEventObject: {
        parameters: { id: 'standard' },
        formInputs: Object.fromEntries(Object.entries({ order: 'sequence', target, url })
          .map(([name, value]) => [name, { stringInputs: { value: [value] } }]))
      }
    });
  }

  assert.equal(run('linked', source.getUrl() + '?tab=t.sibling'), source.getUrl() + '?tab=t.sibling');
  assert.deepEqual(calls.splice(0), [[['Color / label', 'Highlighted text'], ['Example', 'an example']]]);
  assert.equal(run('new'), newDoc.getUrl());
  assert.deepEqual(calls.splice(0), [
    'Example — Highlights', [['Color / label', 'Highlighted text'], ['Example', 'an example']], 'saved'
  ]);
  body.getNumChildren = () => 0;
  assert.match(run('new'), /No highlighted text/);
  assert.deepEqual(calls, []);
});

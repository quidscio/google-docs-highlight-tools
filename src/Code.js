function onHomepage() {
  const library = readLibrary_();
  return homeCard_(library, library.scanOnOpen);
}

function homeCard_(library, suggestImport) {
  const set = findSet_(library, library.activeId);
  const palette = CardService.newSelectionInput().setType(CardService.SelectionInputType.DROPDOWN)
    .setTitle('Highlighter set').setFieldName('palette')
    .setOnChangeAction(action_('switchPalette'));
  for (const option of library.sets) palette.addItem(option.name, option.id, option.id === set.id);

  const colors = CardService.newCardSection().addWidget(palette)
    .addWidget(CardService.newTextParagraph().setText('Select text in Docs, then choose a highlighter.'));
  for (let i = 0; i < set.colors.length; i += 2) {
    const buttons = CardService.newButtonSet();
    for (const { label, color } of set.colors.slice(i, i + 2)) {
      buttons.addButton(button_(label, 'applyHighlight', { color })
        .setAltText(label + ' (' + color + ')')
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED).setBackgroundColor(color));
    }
    colors.addWidget(buttons);
  }
  colors.addWidget(button_('Remove highlight', 'applyHighlight', { color: 'clear' }));

  const tools = CardService.newCardSection()
    .addWidget(button_('Extract highlights', 'openExtract', { id: set.id }))
    .addWidget(button_('Manage sets', 'openLibrary'))
    .addWidget(button_('Import or share sets', 'openShare', { id: set.id }));
  if (suggestImport) {
    try {
      const known = new Set(library.sets.map(shareKey_));
      const found = scanShareBlocks_(activeBody_(activeDocument_()).getText());
      if ([...found.keys()].some(key => !known.has(key))) {
        tools.addWidget(button_('Review sets found in this tab', 'openImport'));
      }
    } catch (error) {
      // The card is still usable if the homepage has no document context.
    }
  }
  return card_('Highlight Tools', 'Build ' + HIGHLIGHT_TOOLS_BUILD_TIMESTAMP).addSection(colors).addSection(tools).build();
}

function applyHighlight(event) {
  return perform_(markChanged => {
    const color = params_(event).color;
    if (color !== 'clear' && !/^#[0-9A-F]{6}$/.test(color || '')) throw new Error('Choose a highlighter.');
    const selection = activeDocument_().getSelection();
    const ranges = selection ? collectSelection_(selection) : [];
    if (!ranges.length) return reply_('Select text in the document first.');
    markChanged();
    for (const range of ranges) {
      range.text.setBackgroundColor(range.start, range.end, color === 'clear' ? null : color);
    }
    return reply_(color === 'clear' ? 'Removed highlight.' : 'Applied highlight.', { changed: true });
  });
}

function switchPalette(event) {
  return perform_(() => {
    const library = readLibrary_();
    library.activeId = findSet_(library, input_(event, 'palette')).id;
    writeLibrary_(library);
    return reply_(null, { navigation: CardService.newNavigation().updateCard(homeCard_(library, false)) });
  });
}

function openLibrary() {
  const library = readLibrary_();
  const set = findSet_(library, library.activeId);
  const section = CardService.newCardSection()
    .addWidget(CardService.newTextParagraph().setText('Active set: ' + escapeCard_(set.name)))
    .addWidget(button_('Edit active set', 'openPaletteEditor', { id: set.id }))
    .addWidget(button_('New set', 'openPaletteEditor'))
    .addWidget(button_('Duplicate active set', 'openPaletteEditor', { id: set.id, duplicate: 'yes' }));
  if (library.sets.length > 1) {
    section.addWidget(button_('Delete active set', 'confirmDeletePalette', { id: set.id }));
    const index = library.sets.indexOf(set);
    const reorder = CardService.newButtonSet();
    if (index > 0) reorder.addButton(button_('Move up', 'movePalette', { id: set.id, step: '-1' }));
    if (index < library.sets.length - 1) {
      reorder.addButton(button_('Move down', 'movePalette', { id: set.id, step: '1' }));
    }
    section.addWidget(reorder);
  }
  const scan = CardService.newSelectionInput().setType(CardService.SelectionInputType.CHECK_BOX)
    .setFieldName('scan').addItem('Look for shared sets when the sidebar opens', 'yes', library.scanOnOpen);
  return push_(card_('Highlighter sets')
    .addSection(section)
    .addSection(CardService.newCardSection().addWidget(scan).addWidget(button_('Save preference', 'savePreference')))
    .build());
}

function movePalette(event) {
  return perform_(() => {
    const { id, step } = params_(event);
    if (step !== '-1' && step !== '1') throw new Error('Choose a direction.');
    const library = readLibrary_();
    const set = findSet_(library, id);
    const index = library.sets.indexOf(set);
    const next = index + Number(step);
    if (next < 0 || next >= library.sets.length) return reply_('The set is already at that end of the list.');
    library.sets.splice(index, 1);
    library.sets.splice(next, 0, set);
    writeLibrary_(library);
    return refreshHome_(library, 'Moved highlighter set.');
  });
}

function openPaletteEditor(event) {
  return perform_(() => {
    const { id, duplicate } = params_(event);
    const set = id ? findSet_(readLibrary_(), id) : null;
    const name = set ? (duplicate === 'yes' ? (set.name.slice(0, 75) + ' copy') : set.name) : '';
    const lines = set ? set.colors.map(entry => entry.color + ' ' + entry.label).join('\n') : '';
    const section = CardService.newCardSection()
      .addWidget(CardService.newTextInput().setFieldName('name').setTitle('Set name').setValue(name))
      .addWidget(CardService.newTextInput().setFieldName('colors').setTitle('Highlighters')
        .setMultiline(true).setHint('One hex color and label per line, e.g. #FFFF00 Important').setValue(lines))
      .addWidget(button_('Save set', 'savePalette', set && duplicate !== 'yes'
        ? { id: set.id, version: paletteVersion_(set) } : {}));
    return push_(card_(set && duplicate !== 'yes' ? 'Edit highlighter set' : 'New highlighter set').addSection(section).build());
  });
}

function savePalette(event) {
  return perform_(() => {
    const library = readLibrary_();
    const { id, version } = params_(event);
    const palette = parsePalette_(input_(event, 'name'), input_(event, 'colors'));
    if (id) {
      const current = findSet_(library, id);
      checkPaletteVersion_(current, version);
      Object.assign(current, palette);
    } else {
      palette.id = Utilities.getUuid();
      library.sets.push(palette);
    }
    library.activeId = id || palette.id;
    writeLibrary_(library);
    return refreshHome_(library, 'Saved highlighter set.');
  });
}

function confirmDeletePalette(event) {
  return perform_(() => {
    const set = findSet_(readLibrary_(), params_(event).id);
    const section = CardService.newCardSection()
      .addWidget(CardService.newTextParagraph().setText('Remove “' + escapeCard_(set.name) + '” from your library?'))
      .addWidget(button_('Delete set', 'deletePalette', { id: set.id, version: paletteVersion_(set) }));
    return push_(card_('Delete highlighter set').addSection(section).build());
  });
}

function deletePalette(event) {
  return perform_(() => {
    const library = readLibrary_();
    const { id, version } = params_(event);
    const set = findSet_(library, id);
    checkPaletteVersion_(set, version);
    if (library.sets.length < 2) throw new Error('Keep at least one highlighter set.');
    library.sets = library.sets.filter(option => option.id !== id);
    if (library.activeId === id) library.activeId = library.sets[0].id;
    writeLibrary_(library);
    return refreshHome_(library, 'Deleted highlighter set.');
  });
}

function savePreference(event) {
  return perform_(() => {
    const library = readLibrary_();
    library.scanOnOpen = input_(event, 'scan') === 'yes';
    writeLibrary_(library);
    return refreshHome_(library, 'Saved import preference.');
  });
}

function checkPaletteVersion_(set, version) {
  if (paletteVersion_(set) !== version) throw new Error('The set changed in another tab. Reopen it and try again.');
}

function openShare(event) {
  return perform_(() => {
    const library = readLibrary_();
    const set = findSet_(library, params_(event).id);
    const choices = CardService.newSelectionInput().setType(CardService.SelectionInputType.CHECK_BOX)
      .setTitle('Sets to export').setFieldName('sets');
    for (const option of library.sets) choices.addItem(option.name, option.id, option.id === set.id);
    return push_(card_('Import or share sets')
      .addSection(CardService.newCardSection()
        .addWidget(button_('Find shared sets in this tab', 'openImport'))
        .addWidget(button_('Associate active set with this tab', 'associatePalette', { id: set.id })))
      .addSection(CardService.newCardSection()
        .addWidget(choices)
        .addWidget(button_('Export sets to new Doc', 'exportPalettes')))
      .build());
  });
}

function openImport() {
  return perform_(() => {
    const found = scanShareBlocks_(activeBody_(activeDocument_()).getText());
    const existing = new Set(readLibrary_().sets.map(shareKey_));
    const choices = CardService.newSelectionInput().setType(CardService.SelectionInputType.CHECK_BOX)
      .setTitle('Sets found in this tab').setFieldName('imports');
    let count = 0;
    for (const [key, set] of found) {
      if (existing.has(key)) continue;
      choices.addItem(set.name + ' (' + set.colors.length + ' colors)', key, true);
      count++;
    }
    if (!count) return reply_(found.size ? 'These sets are already in your library.' : 'No shared sets found in this tab.');
    return push_(card_('Import highlighter sets').addSection(CardService.newCardSection()
      .addWidget(choices).addWidget(button_('Import selected sets', 'importPalettes'))).build());
  });
}

function importPalettes(event) {
  return perform_(() => {
    const keys = [...new Set(values_(event, 'imports'))];
    if (!keys.length) return reply_('Choose a set to import.');
    const found = scanShareBlocks_(activeBody_(activeDocument_()).getText());
    const library = readLibrary_();
    const known = new Set(library.sets.map(shareKey_));
    const chosen = keys.map(key => {
      const set = found.get(key);
      if (!set) throw new Error('The shared sets changed. Scan this tab again.');
      return set;
    });
    const added = chosen.filter(set => !known.has(shareKey_(set)))
      .map(set => ({ ...set, id: Utilities.getUuid() }));
    if (!added.length) return reply_('These sets are already in your library.');
    library.sets.push(...added);
    library.activeId = added[0].id;
    writeLibrary_(library);
    return refreshHome_(library, 'Imported ' + added.length + (added.length === 1 ? ' set.' : ' sets.'));
  });
}

function associatePalette(event) {
  return perform_(markChanged => {
    const set = findSet_(readLibrary_(), params_(event).id);
    const body = activeBody_(activeDocument_());
    if (scanShareBlocks_(body.getText()).has(shareKey_(set))) return reply_('This set is already included in this tab.');
    markChanged();
    appendBlocks_(body, [set]);
    return reply_('Added the set to the end of this tab.', { changed: true });
  });
}

function exportPalettes(event) {
  return perform_(markChanged => {
    const ids = [...new Set(values_(event, 'sets'))];
    if (!ids.length) return reply_('Choose a set to export.');
    const library = readLibrary_();
    const selected = ids.map(id => findSet_(library, id));
    markChanged();
    const target = DocumentApp.create('Highlighter Sets');
    const body = target.getBody();
    body.appendParagraph('Open Highlight Tools and import the sets below.');
    appendBlocks_(body, selected);
    const url = target.getUrl();
    target.saveAndClose();
    return showDocument_('Highlighter sets exported', url);
  });
}

function appendBlocks_(body, sets) {
  for (const set of sets) {
    for (const line of shareBlock_(set)) body.appendParagraph(line).editAsText().setBackgroundColor(null);
  }
}

function openExtract(event) {
  const order = CardService.newSelectionInput().setType(CardService.SelectionInputType.DROPDOWN)
    .setTitle('Order').setFieldName('order')
    .addItem('Document order', 'sequence', true).addItem('Grouped by color', 'color', false);
  const target = CardService.newSelectionInput().setType(CardService.SelectionInputType.DROPDOWN)
    .setTitle('Destination').setFieldName('target')
    .addItem('New Google Doc', 'new', true)
    .addItem('End of this tab', 'current', false)
    .addItem('Existing Google Doc', 'linked', false);
  const section = CardService.newCardSection().addWidget(order).addWidget(target)
    .addWidget(CardService.newTextInput().setFieldName('url').setTitle('Link for existing Doc'))
    .addWidget(button_('Export highlights', 'exportHighlights', { id: params_(event).id }));
  return push_(card_('Extract highlights').addSection(section).build());
}

function exportHighlights(event) {
  return perform_(markChanged => {
    const order = input_(event, 'order');
    const destination = input_(event, 'target');
    if (!['sequence', 'color'].includes(order) || !['new', 'current', 'linked'].includes(destination)) {
      throw new Error('Choose an order and destination.');
    }
    const link = destination === 'linked' ? parseDocumentLink_(input_(event, 'url')) : null;
    const source = activeDocument_();
    const sourceBody = activeBody_(source);
    const highlights = extractHighlights_(sourceBody);
    if (!highlights.length) return reply_('No highlighted text found in this tab.');
    const set = findSet_(readLibrary_(), params_(event).id);
    const rows = reportRows_(highlights, set, order);

    let target = source;
    let targetBody = sourceBody;
    if (destination === 'new') {
      markChanged();
      target = DocumentApp.create(source.getName().slice(0, 160) + ' — Highlights');
      targetBody = target.getBody();
    } else if (link) {
      if (link.id !== source.getId()) target = DocumentApp.openById(link.id);
      if (link.tabId) {
        const tab = target.getTab(link.tabId);
        if (!tab) throw new Error('The destination document has no tab matching the link.');
        targetBody = tab.asDocumentTab().getBody();
      } else if (target !== source) {
        targetBody = target.getBody();
      }
    }
    markChanged();
    targetBody.appendParagraph('Extracted highlights').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    targetBody.appendTable(rows);
    const targetUrl = target.getUrl();
    const url = link?.tabId ? targetUrl + (targetUrl.includes('?') ? '&' : '?') + 'tab=' + link.tabId : targetUrl;
    if (target !== source) target.saveAndClose();
    if (destination === 'current') return reply_('Added highlights to the end of this tab.', { changed: true });
    return showDocument_('Highlights exported', url);
  });
}

function perform_(action) {
  const lock = LockService.getUserLock();
  let locked = false;
  let changed = false;
  try {
    locked = lock.tryLock(4000);
    if (!locked) return reply_('Highlight Tools is busy. Try again.');
    return action(() => { changed = true; });
  } catch (error) {
    return reply_(changed ? 'Action interrupted. Check the destination or selection before retrying.' : error.message,
      { changed });
  } finally {
    if (locked) lock.releaseLock();
  }
}

function card_(title, subtitle) {
  const header = CardService.newCardHeader().setTitle(title);
  if (subtitle) header.setSubtitle(subtitle);
  return CardService.newCardBuilder().setHeader(header);
}

function action_(name, params = {}) {
  return CardService.newAction().setFunctionName(name).setParameters(params);
}

function button_(label, name, params) {
  return CardService.newTextButton().setText(label).setOnClickAction(action_(name, params));
}

function reply_(message, { navigation, changed = false } = {}) {
  const response = CardService.newActionResponseBuilder().setStateChanged(changed);
  if (message) response.setNotification(CardService.newNotification().setText(message));
  if (navigation) response.setNavigation(navigation);
  return response.build();
}

function push_(card) {
  return reply_(null, { navigation: CardService.newNavigation().pushCard(card) });
}

function refreshHome_(library, message) {
  return reply_(message, { navigation: CardService.newNavigation().popToRoot().updateCard(homeCard_(library, false)) });
}

function showDocument_(title, url) {
  const card = card_(title).addSection(CardService.newCardSection().addWidget(
    CardService.newTextButton().setText('Open Google Doc').setOpenLink(CardService.newOpenLink().setUrl(url))
  )).build();
  return reply_(null, { navigation: CardService.newNavigation().updateCard(card), changed: true });
}

function params_(event) {
  return event?.commonEventObject?.parameters || {};
}

function values_(event, name) {
  return event?.commonEventObject?.formInputs?.[name]?.stringInputs?.value || [];
}

function input_(event, name) {
  return values_(event, name)[0] || '';
}

function escapeCard_(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function activeDocument_() {
  const doc = DocumentApp.getActiveDocument();
  if (!doc) throw new Error('Open a Google Doc and try again.');
  return doc;
}

function activeBody_(doc) {
  const tab = doc.getActiveTab();
  if (tab) return tab.asDocumentTab().getBody();
  const tabs = doc.getTabs();
  if (tabs.length === 1 && !tabs[0].getChildTabs().length) return tabs[0].asDocumentTab().getBody();
  throw new Error('Docs did not provide the active tab. Reopen Highlight Tools and try again.');
}

function collectSelection_(selection) {
  const ranges = [];
  const textType = DocumentApp.ElementType.TEXT;

  function includeElement(element) {
    if (element.getType() === textType) {
      const text = element.asText();
      const length = text.getText().length;
      if (length) ranges.push({ text, start: 0, end: length - 1 });
    } else if (typeof element.getNumChildren === 'function') {
      for (let i = 0; i < element.getNumChildren(); i++) includeElement(element.getChild(i));
    }
  }

  for (const range of selection.getRangeElements()) {
    const element = range.getElement();
    if (!range.isPartial()) {
      includeElement(element);
    } else if (element.getType() === textType) {
      const text = element.asText();
      const start = range.getStartOffset();
      const end = range.getEndOffsetInclusive();
      if (start >= 0 && end >= start && end < text.getText().length) ranges.push({ text, start, end });
    }
  }
  return ranges;
}

function extractHighlights_(body) {
  const found = [];
  const type = DocumentApp.ElementType;

  function walk(element) {
    const kind = element.getType();
    const startCount = found.length;
    if (kind === type.PARAGRAPH || kind === type.LIST_ITEM) {
      let color = null;
      let pending = '';
      for (let index = 0; index < element.getNumChildren(); index++) {
        const child = element.getChild(index);
        if (child.getType() !== type.TEXT) {
          pushHighlight_(found, color, pending);
          color = null;
          pending = '';
          continue;
        }
        const text = child.asText();
        const value = text.getText();
        if (!value) continue;
        const offsets = [...new Set([0, ...text.getTextAttributeIndices(), value.length])];
        for (let i = 0; i < offsets.length - 1; i++) {
          const offset = offsets[i];
          const nextColor = visibleColor_(text.getBackgroundColor(offset));
          if (nextColor !== color) {
            pushHighlight_(found, color, pending);
            color = nextColor;
            pending = '';
          }
          if (color) pending += value.slice(offset, offsets[i + 1]);
        }
      }
      pushHighlight_(found, color, pending);
    } else if (typeof element.getNumChildren === 'function') {
      for (let i = 0; i < element.getNumChildren(); i++) walk(element.getChild(i));
      if (kind === type.TABLE_CELL && startCount === found.length) {
        pushHighlight_(found, visibleColor_(element.asTableCell().getBackgroundColor()), element.getText());
      }
    }
  }

  walk(body);
  return found;
}

function visibleColor_(color) {
  const hex = color?.toUpperCase();
  return /^#[0-9A-F]{6}$/.test(hex || '') && hex !== '#FFFFFF' ? hex : null;
}

function pushHighlight_(found, color, value) {
  const text = value.replace(/\r\n?/g, '\n').trim();
  if (color && text) found.push({ color, text });
}

function reportRows_(highlights, set, order) {
  const labels = new Map(set.colors.map(entry => [entry.color, entry.label]));
  const rows = [['Color / label', 'Highlighted text']];
  if (order === 'color') {
    const groups = new Map();
    for (const entry of highlights) {
      if (!groups.has(entry.color)) groups.set(entry.color, []);
      groups.get(entry.color).push(entry.text);
    }
    const colors = new Set([...labels.keys(), ...groups.keys()]);
    for (const color of colors) {
      if (groups.has(color)) rows.push([labels.get(color) || color, groups.get(color).join('\n\n')]);
    }
  } else {
    for (const entry of highlights) rows.push([labels.get(entry.color) || entry.color, entry.text]);
  }
  return rows;
}

function parseDocumentLink_(url) {
  const match = /^https:\/\/docs\.google\.com\/document\/(?:u\/\d+\/)?d\/([\w-]+)(?:\/(?:edit|view|preview))?\/?(?:\?([^#]*))?(?:#.*)?$/.exec(url.trim());
  if (!match) throw new Error('Enter the edit or view link for a Google Doc.');
  const tabId = /(?:^|&)tab=([\w.-]+)(?:&|$)/.exec(match[2] || '')?.[1];
  return { id: match[1], tabId };
}

const LIBRARY_PROPERTY = 'highlightTools.library';
const SHARE_HEADER = '*'.repeat(44) + 'Highlighter Values' + '*'.repeat(44);
const SHARE_FOOTER = '*'.repeat(37) + 'Do not modify this block of text' + '*'.repeat(37);

function readLibrary_() {
  const raw = PropertiesService.getUserProperties().getProperty(LIBRARY_PROPERTY);
  if (raw) return JSON.parse(raw);
  return {
    activeId: 'standard',
    scanOnOpen: false,
    sets: [{
      id: 'standard',
      name: 'Standard',
      colors: [
        { color: '#FFFF00', label: 'Yellow' },
        { color: '#B6D7A8', label: 'Green' },
        { color: '#A4C2F4', label: 'Blue' },
        { color: '#F4CCCC', label: 'Pink' }
      ]
    }]
  };
}

function writeLibrary_(library) {
  const data = JSON.stringify(library);
  if (Utilities.newBlob(data).getBytes().length > 9000) {
    throw new Error('The library is full. Delete or shorten a set before saving.');
  }
  PropertiesService.getUserProperties().setProperty(LIBRARY_PROPERTY, data);
}

function findSet_(library, id) {
  const index = library.sets.findIndex(set => set.id === id);
  if (index === -1) throw new Error('This highlighter set was removed. Reopen Highlight Tools.');
  return library.sets[index];
}

function parsePalette_(name, lines) {
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > 80 || /[\r\n]|>{5}/.test(cleanName)) {
    throw new Error('Enter a set name on one line using up to 80 characters.');
  }
  const colors = lines.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const match = /^(#[0-9a-f]{6})[ \t]+(.+)$/i.exec(line);
    if (!match) throw new Error('Enter one hex color and label per line, such as #FFFF00 Important.');
    const label = match[2].trim();
    if (!label || label.length > 80 || label.includes('" : "')) {
      throw new Error('Use a label of up to 80 characters. Choose a different label if it contains " : ".');
    }
    return { color: match[1].toUpperCase(), label };
  });
  if (!colors.length || colors.length > 40) {
    throw new Error('A set must have between 1 and 40 highlighters.');
  }
  return { name: cleanName, colors };
}

function shareBlock_(set) {
  return [
    SHARE_HEADER, '<<<<<' + set.name + '>>>>>',
    ...set.colors.map(entry => '"' + entry.label + '" : "' + entry.color + '"'),
    SHARE_FOOTER
  ];
}

function shareKey_(set) {
  const content = JSON.stringify([set.name, set.colors.map(item => item.color + ' ' + item.label).sort()]);
  return digest_(content);
}

function paletteVersion_(set) {
  return digest_(JSON.stringify([set.name, set.colors]));
}

function digest_(content) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, content));
}

function scanShareBlocks_(text) {
  const sets = new Map();
  let lines = null;
  for (const raw of text.split(/\r\n?|\n/)) {
    const line = raw.trim();
    if (line === SHARE_HEADER) {
      lines = [];
    } else if (lines && line === SHARE_FOOTER) {
      const named = /^<{5}(.*?)>{5}$/.exec(lines[0] || '');
      const colorLines = (named ? lines.slice(1) : lines).map(value => {
        const part = /^"(.*)"\s*:\s*"(#[\da-f]{6})"$/i.exec(value);
        return part ? part[2] + ' ' + part[1] : '';
      });
      if (colorLines.length && colorLines.every(Boolean)) {
        try {
          const set = parsePalette_(named?.[1]?.trim() || 'Imported highlighters', colorLines.join('\n'));
          sets.set(shareKey_(set), set);
        } catch (error) {
          // Skip malformed blocks alongside any valid blocks in the document.
        }
      }
      lines = null;
    } else if (lines && line) {
      lines.push(line);
    }
  }
  return sets;
}

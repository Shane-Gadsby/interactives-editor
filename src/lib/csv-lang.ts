import { StreamLanguage } from '@codemirror/language';

/**
 * CSV and TSV for the code view: each column is a different colour (cycling), the delimiters are dimmed and the header row
 * is bold, so a long row can be followed across by eye. A quoted cell can run over several lines, so the state remembers it.
 */
const COLUMN_TOKENS = ['string', 'keyword', 'number', 'typeName', 'variableName', 'atom'];

interface State {
  col: number;
  quoted: boolean;
  line: number;
}

function table(delimiter: string) {
  return StreamLanguage.define<State>({
    name: delimiter === '\t' ? 'tsv' : 'csv',
    startState: () => ({ col: 0, quoted: false, line: 0 }),
    token(stream, state) {
      if (stream.sol() && !state.quoted) {
        state.col = 0;
        state.line++;
      }
      const header = state.line === 1;
      const colour = COLUMN_TOKENS[state.col % COLUMN_TOKENS.length];
      if (!state.quoted && stream.peek() === delimiter) {
        stream.next();
        state.col++;
        return 'punctuation';
      }
      // A cell, up to the next delimiter (or the quote that closes it)
      if (state.quoted) {
        while (!stream.eol()) {
          if (stream.next() === '"') {
            if (stream.peek() === '"') stream.next();
            else {
              state.quoted = false;
              break;
            }
          }
        }
        return header ? `${colour} strong` : colour;
      }
      if (stream.peek() === '"') {
        stream.next();
        state.quoted = true;
        while (!stream.eol()) {
          if (stream.next() === '"') {
            if (stream.peek() === '"') stream.next();
            else {
              state.quoted = false;
              break;
            }
          }
        }
        return header ? `${colour} strong` : colour;
      }
      while (!stream.eol() && stream.peek() !== delimiter) stream.next();
      return header ? `${colour} strong` : colour;
    },
    blankLine(state) {
      if (!state.quoted) state.col = 0;
    },
  });
}

export const csvLanguage = table(',');
export const tsvLanguage = table('\t');

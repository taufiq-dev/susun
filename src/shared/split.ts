import type { DbType } from './types'

// One statement of a script, as `splitStatements` found it.
export interface Statement {
  sql: string
  // Offsets in the script, from the statement's first token to the end of its last. Comments and
  // whitespace before it, and its terminating delimiter, are left out.
  from: number
  to: number
  // The 1-based line its first token is on.
  line: number
}

// Words that, after CREATE, start a statement whose body can hold `;`-terminated statements.
const ROUTINES = new Set(['TRIGGER', 'FUNCTION', 'PROCEDURE', 'EVENT'])
// `END IF`, `END LOOP`, ... close blocks whose openers aren't counted.
const UNCOUNTED_ENDS = new Set(['IF', 'LOOP', 'WHILE', 'REPEAT'])
// How many leading words of a statement are checked for CREATE ... TRIGGER and the like.
const HEAD_WORDS = 8

const DOLLAR_QUOTE = /\$(?:[A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*)?\$/y

function isWordChar(c: string): boolean {
  return (
    (c >= 'a' && c <= 'z') ||
    (c >= 'A' && c <= 'Z') ||
    (c >= '0' && c <= '9') ||
    c === '_' ||
    c === '$' ||
    // Every database treats non-ASCII characters as part of identifiers.
    c > '\x7f'
  )
}

function endOfLine(sql: string, i: number): number {
  const end = sql.indexOf('\n', i)
  return end === -1 ? sql.length : end
}

// Where a string or quoted identifier opened at `i` ends. A doubled quote is an escaped quote, and
// with `backslashes` a backslash escapes the next character. Unterminated runs to the end.
function endOfQuoted(sql: string, i: number, quote: string, backslashes: boolean): number {
  let j = i + 1
  while (j < sql.length) {
    const c = sql[j]
    if (backslashes && c === '\\') {
      j += 2
    } else if (c === quote) {
      if (sql[j + 1] !== quote) return j + 1
      j += 2
    } else {
      j++
    }
  }
  return sql.length
}

function endOfBlockComment(sql: string, i: number, nested: boolean): number {
  let depth = 1
  let j = i + 2
  while (j < sql.length) {
    if (sql[j] === '*' && sql[j + 1] === '/') {
      j += 2
      if (--depth === 0) return j
    } else if (nested && sql[j] === '/' && sql[j + 1] === '*') {
      j += 2
      depth++
    } else {
      j++
    }
  }
  return sql.length
}

// Splits a script into statements the way the database's own command-line client does (psql, the
// mysql client, sqlite3), so semicolons inside strings, quoted names, comments, Postgres
// dollar-quoted bodies, and the BEGIN ... END body of a trigger or routine don't end a statement.
// MySQL's client-side `DELIMITER` command is understood and left out. Statements that are only
// comments are dropped. Nothing is validated: what isn't SQL goes to the database as it is.
export function splitStatements(sql: string, type: DbType): Statement[] {
  const statements: Statement[] = []
  const n = sql.length
  let delimiter = ';'

  // The statement being read. `from` is -1 until its first token.
  let from = -1
  let to = -1
  let head: string[] = []
  let headDone = false
  // Inside a trigger or routine (or a MariaDB `BEGIN NOT ATOMIC`), `;` ends the statement only at
  // block depth 0. BEGIN and CASE open a block, END closes one.
  let routine = false
  let depth = 0
  let lastWord = ''
  let afterDot = false

  // Line numbers, counted forward as statements are found.
  let countedTo = 0
  let line = 1

  const token = (start: number, end: number): void => {
    if (from === -1) from = start
    to = end
  }

  const finish = (): void => {
    if (from !== -1) {
      for (; countedTo < from; countedTo++) if (sql[countedTo] === '\n') line++
      statements.push({ sql: sql.slice(from, to), from, to, line })
    }
    from = -1
    head = []
    headDone = false
    routine = false
    depth = 0
    lastWord = ''
  }

  const word = (w: string): void => {
    if (!headDone && head.length < HEAD_WORDS) {
      head.push(w)
      if (head[0] === 'CREATE' && ROUTINES.has(w)) routine = true
      if (type === 'mysql' && head.join(' ') === 'BEGIN NOT ATOMIC') {
        routine = true
        depth = 1
      }
    }
    // A keyword after a dot is a column name (`new.end`). With a custom delimiter there's no need
    // to count blocks.
    if (routine && !afterDot && delimiter === ';') {
      if (w === 'BEGIN' || (w === 'CASE' && lastWord !== 'END')) depth++
      else if (w === 'END') depth--
      else if (lastWord === 'END' && UNCOUNTED_ENDS.has(w)) depth++
    }
    lastWord = w
    afterDot = false
  }

  const punctuation = (c: string): void => {
    if (c === '(') headDone = true
    lastWord = ''
    afterDot = c === '.'
  }

  let i = 0
  while (i < n) {
    const c = sql[i]

    if (c <= ' ') {
      i++
      continue
    }

    if (delimiter !== ';' && sql.startsWith(delimiter, i)) {
      finish()
      i += delimiter.length
      continue
    }

    // MySQL needs whitespace (or a control character) after `--`, so `1--1` is 1 - -1.
    if (c === '-' && sql[i + 1] === '-' && (type !== 'mysql' || !(sql[i + 2] > ' '))) {
      i = endOfLine(sql, i)
      continue
    }
    if (c === '#' && type === 'mysql') {
      i = endOfLine(sql, i)
      continue
    }
    if (c === '/' && sql[i + 1] === '*') {
      const end = endOfBlockComment(sql, i, type === 'postgres')
      // MySQL runs the contents of `/*! ... */` (MariaDB also `/*M! ... */`), as in mysqldump's
      // `/*!40101 SET ... */;`, so it is part of the statement.
      const executable = type === 'mysql' && (sql[i + 2] === '!' || sql.startsWith('M!', i + 2))
      if (executable) {
        token(i, end)
        punctuation('')
      }
      i = end
      continue
    }

    if (c === ';' && delimiter === ';') {
      if (routine && depth > 0) {
        token(i, i + 1)
        punctuation(c)
      } else {
        finish()
      }
      i++
      continue
    }

    // The mysql client's `DELIMITER <string>` command, which isn't sent to the server.
    if (type === 'mysql' && from === -1 && /^delimiter(?:\s|$)/i.test(sql.slice(i, i + 10))) {
      const end = endOfLine(sql, i)
      const arg = sql
        .slice(i + 9, end)
        .trim()
        .split(/\s+/)[0]
      if (arg) delimiter = arg
      i = end
      continue
    }

    let end = -1
    if (c === "'") {
      end = endOfQuoted(sql, i, c, type === 'mysql')
    } else if (c === '"') {
      end = endOfQuoted(sql, i, c, type === 'mysql')
    } else if (c === '`' && type !== 'postgres') {
      end = endOfQuoted(sql, i, c, false)
    } else if (c === '[' && type === 'sqlite') {
      const close = sql.indexOf(']', i + 1)
      end = close === -1 ? n : close + 1
    } else if (c === '$' && type === 'postgres') {
      DOLLAR_QUOTE.lastIndex = i
      const tag = DOLLAR_QUOTE.exec(sql)?.[0]
      if (tag) {
        const close = sql.indexOf(tag, i + tag.length)
        end = close === -1 ? n : close + tag.length
      }
    }
    if (end !== -1) {
      token(i, end)
      punctuation('')
      i = end
      continue
    }

    if (isWordChar(c)) {
      // The mysql client looks for a custom delimiter at every character, so `select 1$$` ends at
      // `$$` although `$` can be part of a MySQL name.
      let j = i + 1
      while (j < n && isWordChar(sql[j]) && !(delimiter !== ';' && sql.startsWith(delimiter, j)))
        j++
      // Postgres E'...' strings take backslash escapes.
      if (type === 'postgres' && j === i + 1 && (c === 'E' || c === 'e') && sql[j] === "'") {
        end = endOfQuoted(sql, j, "'", true)
        token(i, end)
        punctuation('')
        i = end
        continue
      }
      token(i, j)
      word(sql.slice(i, j).toUpperCase())
      i = j
      continue
    }

    token(i, i + 1)
    punctuation(c)
    i++
  }
  finish()
  return statements
}

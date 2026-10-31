import { describe, expect, it } from 'vitest'
import { splitStatements } from './split'
import type { DbType } from './types'

const split = (sql: string, type: DbType): string[] => splitStatements(sql, type).map((s) => s.sql)
const ALL: DbType[] = ['postgres', 'mysql', 'sqlite']

describe.each(ALL)('every database (%s)', (type) => {
  it('splits on semicolons and trims', () => {
    expect(split('select 1;  select 2 ;\n\nselect 3', type)).toEqual([
      'select 1',
      'select 2',
      'select 3'
    ])
  })

  it('drops empty statements and ones that are only comments', () => {
    expect(split(';; select 1;;\n-- the end\n/* really */ ;', type)).toEqual(['select 1'])
    expect(split('  \n ', type)).toEqual([])
  })

  it('leaves out leading comments but keeps inner ones', () => {
    expect(split('-- first\nselect 1 /* one */ + 1; select 2', type)).toEqual([
      'select 1 /* one */ + 1',
      'select 2'
    ])
  })

  it('gives offsets and line numbers', () => {
    const sql = 'select 1;\n\n  -- note\n  select\n  2;'
    const [a, b] = splitStatements(sql, type)
    expect(a).toEqual({ sql: 'select 1', from: 0, to: 8, line: 1 })
    expect(b.line).toBe(4)
    expect(sql.slice(b.from, b.to)).toBe('select\n  2')
  })

  it('ignores semicolons in strings, quoted names and comments', () => {
    expect(split(`select 'a;b', "c;d" -- e;f\n; select /* g;h */ 2`, type)).toEqual([
      `select 'a;b', "c;d"`,
      'select /* g;h */ 2'
    ])
  })

  it('reads doubled quotes as escapes', () => {
    expect(split(`select 'it''s;'; select "a"";b"; select 3`, type)).toEqual([
      `select 'it''s;'`,
      `select "a"";b"`,
      'select 3'
    ])
  })

  it('runs an unterminated string or comment to the end', () => {
    expect(split(`select 'oops; select 2`, type)).toEqual([`select 'oops; select 2`])
    expect(split('select 1; /* oops; select 2', type)).toEqual(['select 1'])
  })

  it('splits transaction statements normally', () => {
    expect(split('begin; update t set a = 1; commit;', type)).toEqual([
      'begin',
      'update t set a = 1',
      'commit'
    ])
  })

  it("doesn't count blocks outside a trigger or routine", () => {
    expect(split('select case when a then 1 end; select 2', type)).toEqual([
      'select case when a then 1 end',
      'select 2'
    ])
  })

  it('keeps a column named begin inside a CREATE TABLE', () => {
    expect(split('create table t (id int, begin int); select 1', type)).toEqual([
      'create table t (id int, begin int)',
      'select 1'
    ])
  })
})

describe('Postgres', () => {
  it('takes backslashes in ordinary strings literally', () => {
    expect(split(`select 'C:\\'; select 2`, 'postgres')).toEqual([`select 'C:\\'`, 'select 2'])
  })

  it('takes backslash escapes in E strings', () => {
    expect(split(`select E'it\\'s;'; select e'\\\\'; select 3`, 'postgres')).toEqual([
      `select E'it\\'s;'`,
      `select e'\\\\'`,
      'select 3'
    ])
  })

  it('nests block comments', () => {
    expect(split('select 1 /* a /* b; */ c; */ + 1; select 2', 'postgres')).toEqual([
      'select 1 /* a /* b; */ c; */ + 1',
      'select 2'
    ])
  })

  it('reads dollar-quoted bodies', () => {
    const fn = `create function f() returns int as $$ begin return 1; end; $$ language plpgsql`
    expect(split(`${fn}; select f()`, 'postgres')).toEqual([fn, 'select f()'])
    const tagged = `do $body$ begin perform $x$;$x$; end $body$`
    expect(split(`${tagged}; select 2`, 'postgres')).toEqual([tagged, 'select 2'])
  })

  it("doesn't take parameters or identifiers with $ for dollar quotes", () => {
    expect(split('select $1, a$b; select $2', 'postgres')).toEqual(['select $1, a$b', 'select $2'])
  })

  it('reads BEGIN ATOMIC function bodies', () => {
    const fn =
      'create function f() returns int language sql begin atomic select 1; select case when true then 2 end; end'
    expect(split(`${fn}; select 3`, 'postgres')).toEqual([fn, 'select 3'])
  })

  it('splits END as a statement (commit)', () => {
    expect(split('begin; select 1; end; select 2', 'postgres')).toEqual([
      'begin',
      'select 1',
      'end',
      'select 2'
    ])
  })

  it('takes brackets and backticks as ordinary characters', () => {
    expect(split('select a[1]; select `x;y`', 'postgres')).toEqual([
      'select a[1]',
      'select `x',
      'y`'
    ])
  })
})

describe('MySQL', () => {
  it('takes backslash escapes in strings', () => {
    expect(split(`select 'it\\'s; fine'; select "a\\";b"; select 3`, 'mysql')).toEqual([
      `select 'it\\'s; fine'`,
      `select "a\\";b"`,
      'select 3'
    ])
  })

  it('reads backtick names', () => {
    expect(split('select `a;b`, `c``;d`; select 2', 'mysql')).toEqual([
      'select `a;b`, `c``;d`',
      'select 2'
    ])
  })

  it('reads # comments and -- only before whitespace', () => {
    expect(split('select 1 # a; b\n; select 2--1; select 3 -- c;\n', 'mysql')).toEqual([
      'select 1',
      'select 2--1',
      'select 3'
    ])
  })

  it('keeps executable comments, which MySQL runs', () => {
    expect(split('/*!40101 SET NAMES utf8 */;\n/*M!100616 SET @a = 1 */;', 'mysql')).toEqual([
      '/*!40101 SET NAMES utf8 */',
      '/*M!100616 SET @a = 1 */'
    ])
  })

  it('reads procedure bodies', () => {
    const proc = `create definer=\`root\`@\`%\` procedure p(in n int)
begin
  declare i int default 0;
  outer_loop: while i < n do
    set i = i + 1;
    if i = 2 then iterate outer_loop; end if;
  end while outer_loop;
  case n when 1 then select 'one'; else select case when n > 1 then 'many' end; end case;
  repeat set i = i - 1; until i = 0 end repeat;
  loop leave outer_loop; end loop;
end`
    expect(split(`${proc};\ncall p(3)`, 'mysql')).toEqual([proc, 'call p(3)'])
  })

  it('reads trigger bodies, with or without BEGIN', () => {
    const block = 'create trigger t before insert on x for each row begin set new.a = 1; end'
    const single = 'create trigger u before update on x for each row set new.b = 2'
    expect(split(`${block}; ${single}; select 1`, 'mysql')).toEqual([block, single, 'select 1'])
  })

  it('takes a keyword after a dot as a name', () => {
    const trigger =
      'create trigger t before insert on x for each row begin set new.end = 1; set new.begin = 2; end'
    expect(split(`${trigger}; select 1`, 'mysql')).toEqual([trigger, 'select 1'])
  })

  it('reads MariaDB BEGIN NOT ATOMIC blocks', () => {
    const block = 'begin not atomic declare x int; set x = 1; select x; end'
    expect(split(`${block}; select 2`, 'mysql')).toEqual([block, 'select 2'])
  })

  it('follows the DELIMITER command and leaves it out', () => {
    const sql = `DELIMITER //
create procedure p() begin select 1; end//
call p()//
DELIMITER ;
select 2; select 3`
    expect(split(sql, 'mysql')).toEqual([
      'create procedure p() begin select 1; end',
      'call p()',
      'select 2',
      'select 3'
    ])
  })

  it('reads mysqldump-style ;; delimiters', () => {
    const sql = `DELIMITER ;;
/*!50003 CREATE TRIGGER t BEFORE INSERT ON x FOR EACH ROW BEGIN SET NEW.a = 1; END */;;
DELIMITER ;
select 1;`
    expect(split(sql, 'mysql')).toEqual([
      '/*!50003 CREATE TRIGGER t BEFORE INSERT ON x FOR EACH ROW BEGIN SET NEW.a = 1; END */',
      'select 1'
    ])
  })

  it('gives line numbers after a DELIMITER line', () => {
    const lines = splitStatements('delimiter $$\nselect 1$$\nselect 2$$', 'mysql').map(
      (s) => s.line
    )
    expect(lines).toEqual([2, 3])
  })

  it('treats delimiter as a name when it is not a command', () => {
    expect(split('select delimiter from t; select 2', 'mysql')).toEqual([
      'select delimiter from t',
      'select 2'
    ])
  })
})

describe('SQLite', () => {
  it('reads bracketed and backtick names', () => {
    expect(split('select [a;b], `c;d` from t; select 2', 'sqlite')).toEqual([
      'select [a;b], `c;d` from t',
      'select 2'
    ])
  })

  it('takes backslashes in strings literally', () => {
    expect(split(`select 'C:\\'; select 2`, 'sqlite')).toEqual([`select 'C:\\'`, 'select 2'])
  })

  it("doesn't nest block comments", () => {
    expect(split('select 1 /* a /* b */ + 1; select 2', 'sqlite')).toEqual([
      'select 1 /* a /* b */ + 1',
      'select 2'
    ])
  })

  it('reads trigger bodies, including CASE ... END inside them', () => {
    const trigger = `create temp trigger if not exists t after insert on items when new.id > 0
begin
  update items set name = case when new.name is null then 'x' else new.name end where id = new.id;
  delete from log;
end`
    expect(split(`${trigger};\nselect 1`, 'sqlite')).toEqual([trigger, 'select 1'])
  })
})

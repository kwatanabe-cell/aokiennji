// Private laptop-to-desktop snapshot. Run from the repository root.
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';

const root = process.cwd();
const manifestPath = '.data/desktop-handoff-manifest.json';
const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

if (process.argv[2] === '--verify') {
  const manifest = JSON.parse(readFileSync(join(root, manifestPath), 'utf8'));
  let checked = 0;
  for (const [file, expected] of Object.entries(manifest.files)) {
    const target = resolve(root, file);
    if (!target.startsWith(root + sep) || !existsSync(target) || hash(target) !== expected)
      throw Error(`Missing or changed file: ${file}`);
    checked++;
  }
  for (const [file, expected] of Object.entries(manifest.symlinks || {})) {
    const target = resolve(root, file);
    if (
      !target.startsWith(root + sep) ||
      !lstatSync(target).isSymbolicLink() ||
      readlinkSync(target) !== expected ||
      !realpathSync(target).startsWith(root + sep)
    )
      throw Error(`Missing or changed symlink: ${file}`);
  }
  console.log(
    `Verified ${checked} files; snapshot branch ${manifest.branch}, HEAD ${manifest.head}`,
  );
} else {
  if (!existsSync(join(root, 'package.json')) || !existsSync(join(root, '.git')))
    throw Error('Run this script from the aokienji repository root.');
  const day = new Date().toISOString().slice(0, 10);
  const output = resolve(root, '.data/migration', process.argv[2] || `desktop-${day}`);
  if (!output.startsWith(resolve(root, '.data/migration') + sep))
    throw Error('Output must be inside .data/migration/.');
  const archive = join(output, 'aokienji-desktop.tar.gz');
  if (existsSync(archive)) throw Error('Snapshot already exists; choose a new output folder name.');
  mkdirSync(output, { recursive: true, mode: 0o700 });
  chmodSync(output, 0o700);
  const stage = mkdtempSync(join(tmpdir(), 'aokienji-desktop-'));
  chmodSync(stage, 0o700);
  const copy = join(stage, 'aokienji');
  const sqliteFiles = [];
  const excluded = new Set(['node_modules', 'test-results', 'playwright-report', 'coverage']);
  try {
    // WAL and SHM are intentionally excluded; each DB is backed up through SQLite.
    cpSync(root, copy, {
      recursive: true,
      verbatimSymlinks: true,
      filter: (source) => {
        const file = relative(root, source);
        const parts = file.split(sep);
        if (excluded.has(parts[0]) || parts[0].startsWith('.next') || file.endsWith('.tsbuildinfo'))
          return false;
        if (file === '.data/migration' || file.startsWith('.data/migration' + sep)) return false;
        if (file === manifestPath) return false;
        if (file.endsWith('.sqlite-wal') || file.endsWith('.sqlite-shm')) return false;
        if (file.endsWith('.sqlite') && lstatSync(source).isFile()) {
          sqliteFiles.push(file);
          return false;
        }
        return true;
      },
    });
    const { default: Database } = await import('better-sqlite3');
    for (const file of sqliteFiles) {
      const target = join(copy, file);
      mkdirSync(dirname(target), { recursive: true });
      const source = new Database(join(root, file), { readonly: true, fileMustExist: true });
      try {
        await source.backup(target);
      } finally {
        source.close();
      }
      const restored = new Database(target, { fileMustExist: true });
      try {
        restored.pragma('journal_mode = DELETE');
        if (restored.pragma('quick_check', { simple: true }) !== 'ok')
          throw Error(`SQLite integrity check failed: ${file}`);
      } finally {
        restored.close();
      }
    }
    const files = {};
    const symlinks = {};
    function collect(dir) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const target = join(dir, entry.name);
        if (entry.isDirectory()) collect(target);
        else if (entry.isFile()) files[relative(copy, target).split(sep).join('/')] = hash(target);
        else if (entry.isSymbolicLink()) {
          const link = readlinkSync(target);
          if (!realpathSync(target).startsWith(copy + sep))
            throw Error(`Symlink points outside the snapshot: ${relative(copy, target)}`);
          symlinks[relative(copy, target).split(sep).join('/')] = link;
        } else throw Error(`Unsupported snapshot entry: ${relative(copy, target)}`);
      }
    }
    collect(copy);
    const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    writeFileSync(
      join(copy, manifestPath),
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          branch: git('branch', '--show-current'),
          head: git('rev-parse', 'HEAD'),
          gitStatus: git('status', '--porcelain=v1', '--untracked-files=all'),
          node: process.version,
          sqliteBackups: sqliteFiles,
          symlinks,
          files,
        },
        null,
        2,
      ) + '\n',
      { mode: 0o600 },
    );
    // Restrict access before tar writes the archive; it contains credentials.
    writeFileSync(archive, '', { mode: 0o600, flag: 'wx' });
    execFileSync('tar', ['-czf', archive, '-C', stage, 'aokienji']);
    writeFileSync(archive + '.sha256', `${hash(archive)}  aokienji-desktop.tar.gz\n`, {
      mode: 0o600,
    });
    const instructions = join(output, 'DESKTOP_HANDOFF.md');
    cpSync(join(root, 'docs/DESKTOP_HANDOFF_2026-10-14.md'), instructions);
    chmodSync(instructions, 0o600);
    console.log(`Archive: ${archive}`);
    console.log(`Checksum: ${archive}.sha256`);
    console.log(
      `Files: ${Object.keys(files).length}; SQLite backups: ${sqliteFiles.length} (quick_check: ok)`,
    );
  } catch (error) {
    // Only remove this script's incomplete output, never the source project.
    rmSync(archive, { force: true });
    rmSync(archive + '.sha256', { force: true });
    throw error;
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

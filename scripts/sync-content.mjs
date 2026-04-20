/**
 * sync-content.mjs
 *
 * Copies lesson Markdown and images from the ODrive-Custom repo into the
 * Astro content directory. Handles:
 *   - Injecting YAML frontmatter (title, order, type) when missing
 *   - Rewriting relative image paths for the Astro public/ folder
 *   - Cleaning stale content before each sync
 *
 * Usage:
 *   node scripts/sync-content.mjs --source ../ODrive-Custom   # local path
 *   node scripts/sync-content.mjs --repo owner/repo            # git clone (CI)
 */

import { existsSync, mkdirSync, rmSync, cpSync, readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, basename, dirname, relative, posix } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const CONTENT_DIR = join(PROJECT_ROOT, 'src', 'content', 'lessons');
const PUBLIC_IMAGES = join(PROJECT_ROOT, 'public', 'images', 'lessons');
const BASE_PATH = '/odrive-workshop-site';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
let sourcePath = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--source' && args[i + 1]) {
    sourcePath = join(process.cwd(), args[i + 1]);
  } else if (args[i] === '--repo' && args[i + 1]) {
    const repo = args[i + 1];
    const tmpDir = join(PROJECT_ROOT, '.tmp-content');
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
    console.log(`Cloning ${repo} (shallow)...`);
    execSync(`git clone --depth 1 --filter=blob:none --sparse https://github.com/${repo}.git "${tmpDir}"`, { stdio: 'inherit' });
    execSync('git sparse-checkout set lessons', { cwd: tmpDir, stdio: 'inherit' });
    sourcePath = tmpDir;
  }
}

if (!sourcePath) {
  // Default: look for ODrive-Custom next to this repo
  const defaultPath = join(PROJECT_ROOT, '..', 'ODrive-Custom');
  if (existsSync(join(defaultPath, 'lessons'))) {
    sourcePath = defaultPath;
  } else {
    console.error('Error: No source specified. Use --source <path> or --repo <owner/repo>');
    process.exit(1);
  }
}

const lessonsSource = join(sourcePath, 'lessons');
if (!existsSync(lessonsSource)) {
  console.error(`Error: lessons/ not found at ${lessonsSource}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Clean previous sync
// ---------------------------------------------------------------------------
if (existsSync(CONTENT_DIR)) rmSync(CONTENT_DIR, { recursive: true });
if (existsSync(PUBLIC_IMAGES)) rmSync(PUBLIC_IMAGES, { recursive: true });
mkdirSync(CONTENT_DIR, { recursive: true });
mkdirSync(PUBLIC_IMAGES, { recursive: true });

// ---------------------------------------------------------------------------
// Discover lesson folders
// ---------------------------------------------------------------------------
const lessonFolders = readdirSync(lessonsSource)
  .filter(name => statSync(join(lessonsSource, name)).isDirectory())
  .sort();

console.log(`Found ${lessonFolders.length} lesson folders`);

// ---------------------------------------------------------------------------
// Map folder name → metadata
// ---------------------------------------------------------------------------
function parseFolderName(folderName) {
  const match = folderName.match(/^(\d+)-(.+)$/);
  if (!match) return { order: 99, slug: folderName, rawTitle: folderName };
  return {
    order: parseInt(match[1], 10),
    slug: folderName.toLowerCase().replace(/\s+/g, '-'),
    rawTitle: match[2].replace(/-/g, ' '),
  };
}

function titleCase(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

function extractFirstH1(content) {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

// ---------------------------------------------------------------------------
// Process each lesson
// ---------------------------------------------------------------------------
for (const folder of lessonFolders) {
  const folderPath = join(lessonsSource, folder);
  const meta = parseFolderName(folder);
  const lessonSlug = meta.slug;

  // Find Markdown files
  const mdFiles = readdirSync(folderPath).filter(f => f.endsWith('.md'));

  for (const mdFile of mdFiles) {
    const srcFile = join(folderPath, mdFile);
    let content = readFileSync(srcFile, 'utf-8');

    // Determine type: readme = main lesson, hands-on = exercises, other = extra
    const baseName = mdFile.toLowerCase().replace('.md', '');
    let type = 'extra';
    let fileSuffix = `-${baseName}`;
    if (baseName === 'readme') {
      type = 'lesson';
      fileSuffix = '';
    } else if (baseName.includes('hands-on') || baseName.includes('exercise')) {
      type = 'exercises';
      fileSuffix = '-exercises';
    } else if (baseName.includes('slides')) {
      type = 'extra';
      fileSuffix = '-slides';
    }

    // Extract or generate title
    const h1Title = extractFirstH1(content);
    const title = h1Title || titleCase(meta.rawTitle);

    // Build frontmatter if not present
    const hasFrontmatter = content.trimStart().startsWith('---');
    if (!hasFrontmatter) {
      const duration = type === 'exercises' ? '' : `\nduration: ''`;
      const frontmatter = [
        '---',
        `title: "${title.replace(/"/g, '\\"')}"`,
        `order: ${meta.order}`,
        `type: "${type}"`,
        `lesson: "${lessonSlug}"`,
        `slug: "${lessonSlug}${fileSuffix}"`,
        duration,
        '---',
        '',
      ].filter(line => line !== undefined).join('\n');
      content = frontmatter + content;
    }

    // Copy images directory if it exists
    const imagesDir = join(folderPath, 'images');
    if (existsSync(imagesDir)) {
      const destImages = join(PUBLIC_IMAGES, lessonSlug);
      mkdirSync(destImages, { recursive: true });
      cpSync(imagesDir, destImages, { recursive: true });
    }

    // Also copy any bare image files in the lesson folder root
    const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];
    const bareImages = readdirSync(folderPath).filter(f =>
      imageExts.some(ext => f.toLowerCase().endsWith(ext))
    );
    if (bareImages.length > 0) {
      const destImages = join(PUBLIC_IMAGES, lessonSlug);
      mkdirSync(destImages, { recursive: true });
      for (const img of bareImages) {
        cpSync(join(folderPath, img), join(destImages, img));
      }
    }

    // Rewrite relative image paths (handles both forward and backslash variants)
    // ![alt](images/foo.png) → ![alt](/odrive-workshop-site/images/lessons/<slug>/foo.png)
    // ![alt](.\images\foo.png) → same
    // ![alt](foo.png) → same (bare filename, copied from lesson root)
    content = content.replace(
      /!\[([^\]]*)\]\(([^)]*\.(png|jpg|jpeg|gif|svg|webp))\)/gi,
      (match, alt, imgPath) => {
        // Normalize backslashes and strip leading ./
        const normalized = imgPath.replace(/\\/g, '/').replace(/^\.\//, '');
        // Extract just the filename, regardless of path structure
        const fileName = normalized.includes('/') ? normalized.split('/').pop() : normalized;
        const newPath = posix.join(BASE_PATH, 'images', 'lessons', lessonSlug, fileName);
        return `![${alt}](${newPath})`;
      }
    );

    // Also rewrite <img src="images/..."> tags
    content = content.replace(
      /<img\s+([^>]*?)src=["']([^"']*\.(png|jpg|jpeg|gif|svg|webp))["']/gi,
      (match, prefix, imgPath) => {
        const normalized = imgPath.replace(/\\/g, '/').replace(/^\.\//, '');
        const fileName = normalized.includes('/') ? normalized.split('/').pop() : normalized;
        const newPath = posix.join(BASE_PATH, 'images', 'lessons', lessonSlug, fileName);
        return `<img ${prefix}src="${newPath}"`;
      }
    );

    // Remove broken image references (images that don't exist in public/)
    const destImagesDir = join(PUBLIC_IMAGES, lessonSlug);
    content = content.replace(
      /!\[([^\]]*)\]\(\/odrive-workshop-site\/images\/lessons\/[^)]+\/([^)]+)\)/g,
      (match, alt, fileName) => {
        const imgFile = join(destImagesDir, fileName);
        if (!existsSync(imgFile)) {
          console.log(`    ⚠ Missing image: ${fileName} — replaced with placeholder`);
          return alt ? `> *[Image: ${alt}]*` : '';
        }
        return match;
      }
    );
    content = content.replace(
      /<img\s+[^>]*src=["']\/odrive-workshop-site\/images\/lessons\/[^"']*\/([^"']+)["'][^>]*>/g,
      (match, fileName) => {
        const imgFile = join(destImagesDir, fileName);
        if (!existsSync(imgFile)) {
          console.log(`    ⚠ Missing image: ${fileName} — removed`);
          return '';
        }
        return match;
      }
    );

    // Write to content directory
    const destFileName = `${lessonSlug}${fileSuffix}.md`;
    const destFile = join(CONTENT_DIR, destFileName);
    writeFileSync(destFile, content, 'utf-8');
    console.log(`  ✓ ${folder}/${mdFile} → ${destFileName}`);
  }
}

// ---------------------------------------------------------------------------
// Cleanup temp clone if used
// ---------------------------------------------------------------------------
const tmpDir = join(PROJECT_ROOT, '.tmp-content');
if (existsSync(tmpDir)) {
  rmSync(tmpDir, { recursive: true });
  console.log('Cleaned up temp clone');
}

console.log('\nSync complete!');

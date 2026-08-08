import { execSync, spawnSync } from 'child_process';

export function getRepoGithubUrl(repoPath) {
  try {
    const remote = execSync('git remote get-url origin', {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();

    if (!remote.includes('github.com')) return null;

    return remote
      .replace(/^git@github\.com:/, 'https://github.com/')
      .replace(/^git\+/, '')
      .replace(/\.git$/, '');
  } catch {
    return null;
  }
}

function getCommitSummaries(repoPath) {
  const summaries = {};
  try {
    const output = execSync('git log --all --format=%H%x1f%an%x1f%ci%x1f%s', {
      cwd: repoPath,
      encoding: 'utf-8'
    });

    output.trim().split('\n').filter(Boolean).forEach(line => {
      const [sha, author, date, subject] = line.split('\x1f');
      summaries[sha] = { author, date, subject };
    });
  } catch {
    // No commits yet, or git log failed — leave summaries empty
  }
  return summaries;
}

function getObjectTypes(shas, repoPath) {
  const types = {};
  if (shas.length === 0) return types;

  const result = spawnSync('git', ['cat-file', '--batch-check=%(objectname) %(objecttype)'], {
    cwd: repoPath,
    encoding: 'utf-8',
    input: shas.join('\n') + '\n',
    maxBuffer: 1024 * 1024 * 64
  });

  if (result.error) throw result.error;

  result.stdout.trim().split('\n').filter(Boolean).forEach(line => {
    const [sha, type] = line.split(' ');
    types[sha] = type;
  });
  return types;
}

export async function analyzeRepository(repoPath) {
  try {
    // Verify it's a Git repo
    execSync('git rev-parse --is-inside-work-tree', {
      cwd: repoPath,
      stdio: 'ignore'
    });

    // Get all Git objects
    const output = execSync('git rev-list --objects --all', {
      cwd: repoPath,
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024 * 64
    });

    const entries = output.trim().split('\n').filter(Boolean).map(line => {
      const [sha, path] = line.split(' ');
      return { sha, path: path || null };
    });

    const commitSummaries = getCommitSummaries(repoPath);
    const objectTypes = getObjectTypes(entries.map(e => e.sha), repoPath);

    return entries.map(({ sha, path }) => {
      const type = objectTypes[sha] || 'unknown';
      const summary = type === 'commit' ? commitSummaries[sha] : null;
      return {
        sha,
        path,
        type,
        title: summary ? summary.subject : path,
        author: summary ? summary.author : null,
        date: summary ? summary.date : null
      };
    });
  } catch (error) {
    throw new Error(`Not a Git repository: ${repoPath}`);
  }
}

export async function filterObjects(repoPath, filters) {
  try {
    // Get all objects first
    const allObjects = await analyzeRepository(repoPath);
    
    // Apply filters
    return allObjects.filter(obj => {
      const matchesSearch = !filters.search || 
        (obj.sha.includes(filters.search) || 
        (obj.path && obj.path.toLowerCase().includes(filters.search.toLowerCase())));
      
      const matchesType = !filters.type || obj.type === filters.type;
      
      return matchesSearch && matchesType;
    });
  } catch (error) {
    throw new Error(`Error filtering objects: ${error.message}`);
  }
}

export async function getObjectDetails(repoPath, sha, type) {
  const details = { sha, type };
  
  try {
    if (type === 'commit') {
      try {
        // Get commit details using git show with a format string
        const output = execSync(`git show --pretty=format:"%an|%ci|%s" -s ${sha}`, {
          cwd: repoPath,
          encoding: 'utf-8',
        }).split('|');
        
        // Assign commit details to the 'details' object
        details.author = output[0];
        details.date = output[1]; // ISO 8601 date format
        details.message = output[2];
    
        // Get the parent commits using git log
        details.parents = execSync(`git log --pretty=%P -n 1 ${sha}`, {
          cwd: repoPath,
          encoding: 'utf-8',
        }).trim().split(' ').filter(Boolean);
      } catch (error) {
        console.error('Error getting commit details:', error);
      }
    }
    else if (type === 'tree') {
      try {
        const output = execSync(`git ls-tree ${sha}`, {
          cwd: repoPath,
          encoding: 'utf-8',
        });
    
        // Map the output into a structured object
        details.items = output.trim().split('\n').map(line => {
          const [mode, type, sha, name] = line.split(/\s+/);
          return { mode, type, sha, name };
        });
      } catch (error) {
        console.error('Error getting tree details:', error);
      }
    } else if (type === 'blob') {
      try {
        // Get the blob content
        details.content = execSync(`git cat-file -p ${sha}`, {
          cwd: repoPath,
          encoding: 'utf-8',
        });
    
        // Get the blob size
        details.size = execSync(`git cat-file -s ${sha}`, {
          cwd: repoPath,
          encoding: 'utf-8',
        }).trim();
      } catch (error) {
        console.error('Error getting blob details:', error);
      }
    }
  } catch (error) {
    console.error('Error getting object details:', error);
  }
  
  return details;
}
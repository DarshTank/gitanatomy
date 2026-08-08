document.addEventListener('DOMContentLoaded', () => {
  const themeToggle = document.getElementById('theme-toggle');
  const searchInput = document.getElementById('searchInput');
  const filterPills = document.getElementById('typeFilter');
  const objectList = document.getElementById('objectList');
  const emptyList = document.getElementById('emptyList');
  const overview = document.getElementById('overview');
  const objectDetail = document.getElementById('objectDetail');

  let activeType = '';

  // Theme toggle
  themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-theme');
    const isDark = document.body.classList.contains('dark-theme');
    themeToggle.innerHTML = isDark
      ? '<i class="fas fa-sun"></i> Light'
      : '<i class="fas fa-moon"></i> Dark';
  });

  // Type filter pills
  filterPills.addEventListener('click', (e) => {
    const pill = e.target.closest('.pill');
    if (!pill) return;

    filterPills.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    activeType = pill.dataset.type;
    applyFilters();
  });

  // Live search
  searchInput.addEventListener('input', applyFilters);

  function applyFilters() {
    const query = searchInput.value.trim().toLowerCase();
    let visibleCount = 0;

    document.querySelectorAll('.object-row').forEach(row => {
      const matchesType = !activeType || row.dataset.type === activeType;
      const matchesSearch = !query || row.dataset.search.includes(query);
      const show = matchesType && matchesSearch;
      row.style.display = show ? 'flex' : 'none';
      if (show) visibleCount++;
    });

    emptyList.hidden = visibleCount !== 0;
  }

  // Copy SHA to clipboard
  objectList.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('.copy-btn');
    if (!copyBtn) return;
    e.stopPropagation();
    navigator.clipboard.writeText(copyBtn.dataset.copy).catch(() => {});
    const icon = copyBtn.querySelector('i');
    icon.className = 'fas fa-check';
    setTimeout(() => { icon.className = 'fas fa-copy'; }, 1000);
  });

  // Object row click -> load details
  objectList.addEventListener('click', (e) => {
    const row = e.target.closest('.object-row');
    if (!row) return;
    selectObject(row.dataset.sha, row.dataset.type);
  });

  // Recent commit click -> load details
  document.querySelectorAll('.recent-commit-row').forEach(row => {
    row.addEventListener('click', () => {
      selectObject(row.dataset.sha, row.dataset.type);
    });
  });

  async function selectObject(sha, type) {
    document.querySelectorAll('.object-row').forEach(r => r.classList.remove('selected'));
    const match = document.querySelector(`.object-row[data-sha="${sha}"]`);
    if (match) {
      match.classList.add('selected');
      match.scrollIntoView({ block: 'nearest' });
    }

    overview.style.display = 'none';
    objectDetail.classList.add('active');
    objectDetail.innerHTML = '<div class="detail-section">Loading…</div>';

    try {
      const response = await fetch(`/object/${sha}?type=${type}`);
      const details = await response.json();
      renderObjectDetails(details);
    } catch (error) {
      objectDetail.innerHTML = '<div class="detail-section">Failed to load object details.</div>';
      console.error('Error fetching object details:', error);
    }
  }

  function renderObjectDetails(details) {
    objectDetail.innerHTML = `
      <div class="detail-header">
        <span class="object-row-icon type-${details.type}"><i class="${getObjectIcon(details.type)}"></i></span>
        <div>
          <div class="detail-type">${details.type}</div>
          <div class="detail-sha">${details.sha}</div>
        </div>
      </div>

      ${details.path ? `
        <div class="detail-row">
          <span class="detail-label">Path:</span>
          <span class="detail-value">${details.path}</span>
        </div>
      ` : ''}

      ${details.type === 'commit' ? renderCommitDetails(details) : ''}
      ${details.type === 'tree' ? renderTreeDetails(details) : ''}
      ${details.type === 'blob' ? renderBlobDetails(details) : ''}
    `;
  }

  function renderCommitDetails(commit) {
    return `
      <div class="card detail-section">
        <h2>Commit information</h2>
        <div class="detail-row">
          <span class="detail-label">Author:</span>
          <span class="detail-value">${commit.author || 'N/A'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Date:</span>
          <span class="detail-value">${commit.date || 'N/A'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Message:</span>
          <span class="detail-value">${commit.message || 'N/A'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Parents:</span>
          <span class="detail-value">
            ${commit.parents && commit.parents.length > 0
              ? commit.parents.join(', ')
              : 'None'}
          </span>
        </div>
      </div>
    `;
  }

  function renderTreeDetails(tree) {
    return `
      <div class="card detail-section">
        <h2>Tree contents</h2>
        ${tree.items && tree.items.length > 0 ? `
          <div class="tree-items">
            ${tree.items.map(item => `
              <div class="tree-item">
                <i class="${getObjectIcon(item.type)}"></i>
                <span>${item.name}</span>
                <span class="item-sha">${item.sha.substring(0, 7)}</span>
              </div>
            `).join('')}
          </div>
        ` : '<p>No items in this tree</p>'}
      </div>
    `;
  }

  function renderBlobDetails(blob) {
    return `
      <div class="card detail-section">
        <h2>Blob content</h2>
        <div class="detail-row">
          <span class="detail-label">Size:</span>
          <span class="detail-value">${blob.size || 0} bytes</span>
        </div>
        ${blob.content ? `<pre class="blob-content">${escapeHtml(blob.content)}</pre>` : '<p>No content available</p>'}
      </div>
    `;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function getObjectIcon(type) {
    const icons = {
      'commit': 'fas fa-code-commit',
      'tree': 'fas fa-folder-tree',
      'blob': 'fas fa-file-code'
    };
    return icons[type] || 'fas fa-question';
  }
});

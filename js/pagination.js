/**
 * Pagination Component
 * Reusable pagination UI for lists with many items
 */

window.App = window.App || {};

(function(A) {
  /**
   * Render pagination controls
   * @param {Object} pagination - Pagination info from API
   * @param {Function} onPageChange - Callback when page changes
   * @returns {string} HTML string for pagination controls
   */
  function renderPagination(pagination, onPageChange) {
    if (!pagination || pagination.totalPages <= 1) return '';
    
    const { page, totalPages, total, limit, hasNext, hasPrev } = pagination;
    
    let html = '<div class="pagination">';
    
    // Info text
    html += `<div class="pagination__info">Showing ${((page - 1) * limit) + 1}-${Math.min(page * limit, total)} of ${total} records</div>`;
    
    // Controls
    html += '<div class="pagination__controls">';
    
    // Previous button
    html += `<button class="btn btn--sm ${!hasPrev ? 'btn--disabled' : ''}" 
             ${hasPrev ? `data-page="${page - 1}"` : 'disabled'}>← Prev</button>`;
    
    // Page numbers (show max 5 pages around current)
    const startPage = Math.max(1, page - 2);
    const endPage = Math.min(totalPages, page + 2);
    
    if (startPage > 1) {
      html += `<button class="btn btn--sm" data-page="1">1</button>`;
      if (startPage > 2) html += '<span class="pagination__ellipsis">...</span>';
    }
    
    for (let i = startPage; i <= endPage; i++) {
      const isActive = i === page;
      html += `<button class="btn btn--sm ${isActive ? 'btn--primary' : ''}" 
               data-page="${i}" ${isActive ? 'disabled' : ''}>${i}</button>`;
    }
    
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) html += '<span class="pagination__ellipsis">...</span>';
      html += `<button class="btn btn--sm" data-page="${totalPages}">${totalPages}</button>`;
    }
    
    // Next button
    html += `<button class="btn btn--sm ${!hasNext ? 'btn--disabled' : ''}" 
             ${hasNext ? `data-page="${page + 1}"` : 'disabled'}>Next →</button>`;
    
    html += '</div></div>';
    
    return html;
  }
  
  /**
   * Bind pagination click events
   * @param {HTMLElement} container - Container with pagination controls
   * @param {Function} onPageChange - Callback when page changes
   */
  function bindPagination(container, onPageChange) {
    if (!container) return;
    
    container.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-page]');
      if (!btn) return;
      
      const page = parseInt(btn.dataset.page);
      if (page && !btn.disabled) {
        ev.preventDefault();
        onPageChange(page);
      }
    });
  }
  
  /**
   * Page size selector
   * @param {number} current - Current page size
   * @param {Array<number>} options - Available options
   * @param {Function} onChange - Callback when size changes
   * @returns {string} HTML string
   */
  function renderPageSizeSelector(current, options = [10, 25, 50], onChange) {
    let html = '<div class="pagination__size-selector"><label>Show: ';
    html += '<select class="field__input" data-page-size>';
    
    options.forEach(size => {
      html += `<option value="${size}" ${size === current ? 'selected' : ''}>${size}</option>`;
    });
    
    html += '</select></label></div>';
    return html;
  }
  
  A.pagination = {
    render: renderPagination,
    bind: bindPagination,
    renderPageSize: renderPageSizeSelector,
  };
})(window.App);

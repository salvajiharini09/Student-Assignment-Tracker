(() => {
  'use strict';

  // ============================================
  // API CONFIGURATION
  // ============================================

  const API_BASE = (
    window.STUDYFLOW_API_URL || 'http://localhost:3000/api'
  ).replace(/\/+$/, '');

  // ============================================
  // APPLICATION STATE
  // ============================================

  const $ = (id) => document.getElementById(id);

  const state = {
    assignments: [],
    view: 'all',
    loading: false,
    deleteId: null
  };

  const els = {
    list: $('assignmentList'),
    feedback: $('feedback'),
    dialog: $('assignmentDialog'),
    form: $('assignmentForm'),
    confirmDialog: $('confirmDialog'),
    search: $('searchInput'),
    status: $('statusFilter'),
    priority: $('priorityFilter'),
    sort: $('sortFilter')
  };

  const statusLabels = {
    pending: 'Not started',
    in_progress: 'In progress',
    completed: 'Completed'
  };

  const priorityRank = {
    high: 0,
    medium: 1,
    low: 2
  };

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);
  }

  function localDate(value) {
    if (!value) return null;

    const parts = String(value)
      .slice(0, 10)
      .split('-')
      .map(Number);

    if (
      parts.length !== 3 ||
      parts.some(Number.isNaN)
    ) {
      return null;
    }

    const date = new Date(
      parts[0],
      parts[1] - 1,
      parts[2]
    );

    if (
      Number.isNaN(date.getTime()) ||
      date.getFullYear() !== parts[0] ||
      date.getMonth() !== parts[1] - 1 ||
      date.getDate() !== parts[2]
    ) {
      return null;
    }

    return date;
  }

  function dateKey(date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
  }

  function todayKey() {
    return dateKey(new Date());
  }

  function prettyDate(value) {
    const date = localDate(value);

    return date
      ? date.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        })
      : 'No due date';
  }

  function dayDiff(value) {
    const dueDate = localDate(value);

    if (!dueDate) return Infinity;

    const today = localDate(todayKey());

    return Math.round(
      (dueDate.getTime() - today.getTime()) / 86400000
    );
  }

  function setText(id, value) {
    const element = $(id);

    if (element) {
      element.textContent = value;
    }
  }

  // ============================================
  // API REQUEST HANDLER
  // ============================================

  async function api(path, options = {}) {
    let response;

    try {
      response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
          ...(options.body
            ? { 'Content-Type': 'application/json' }
            : {}),
          ...(options.headers || {})
        }
      });
    } catch (error) {
      throw new Error(
        `Cannot connect to the backend at ${API_BASE}. ` +
        'Start the backend server and try again.'
      );
    }

    let payload = {};

    try {
      payload = await response.json();
    } catch (_) {
      // The response may be empty or may not contain JSON.
    }

    if (!response.ok) {
      throw new Error(
        payload.error ||
        payload.message ||
        `Request failed (${response.status}).`
      );
    }

    return payload;
  }

  // ============================================
  // FEEDBACK AND CONNECTION STATUS
  // ============================================

  function showFeedback(message, type = 'success') {
    if (!els.feedback) {
      console[type === 'error' ? 'error' : 'log'](message);
      return;
    }

    els.feedback.textContent = message;
    els.feedback.className = `feedback ${type}`;
    els.feedback.hidden = false;

    window.clearTimeout(showFeedback.timer);

    showFeedback.timer = window.setTimeout(() => {
      els.feedback.hidden = true;
    }, 5000);
  }

  function setConnection(connected) {
    const label = $('connectionLabel');

    if (!label) return;

    label.textContent = connected
      ? 'Workspace connected'
      : 'Connection unavailable';

    const indicator = label.previousElementSibling;

    if (indicator) {
      indicator.style.background = connected
        ? '#35ba8b'
        : '#d9485f';
    }
  }

  // ============================================
  // FILTERING AND SORTING
  // ============================================

  function visibleAssignments() {
    const query = els.search
      ? els.search.value.trim().toLowerCase()
      : '';

    let list = state.assignments.filter((assignment) => {
      const searchableText = [
        assignment.title,
        assignment.subject,
        assignment.notes || ''
      ].join(' ').toLowerCase();

      if (
        query &&
        !searchableText.includes(query)
      ) {
        return false;
      }

      if (
        els.status &&
        els.status.value !== 'all' &&
        assignment.status !== els.status.value
      ) {
        return false;
      }

      if (
        els.priority &&
        els.priority.value !== 'all' &&
        assignment.priority !== els.priority.value
      ) {
        return false;
      }

      const difference = dayDiff(assignment.due_date);

      if (
        state.view === 'today' &&
        (
          difference !== 0 ||
          assignment.status === 'completed'
        )
      ) {
        return false;
      }

      if (
        state.view === 'upcoming' &&
        (
          difference < 0 ||
          difference > 7 ||
          assignment.status === 'completed'
        )
      ) {
        return false;
      }

      if (
        state.view === 'completed' &&
        assignment.status !== 'completed'
      ) {
        return false;
      }

      return true;
    });

    const sortValue = els.sort
      ? els.sort.value
      : 'due_asc';

    list.sort((a, b) => {
      if (sortValue === 'due_desc') {
        return String(b.due_date || '')
          .localeCompare(String(a.due_date || ''));
      }

      if (sortValue === 'priority') {
        const priorityDifference =
          (priorityRank[a.priority] ?? 99) -
          (priorityRank[b.priority] ?? 99);

        return priorityDifference ||
          String(a.due_date || '')
            .localeCompare(String(b.due_date || ''));
      }

      if (sortValue === 'created_desc') {
        return (
          new Date(b.created_at || 0).getTime() -
          new Date(a.created_at || 0).getTime()
        );
      }

      return String(a.due_date || '')
        .localeCompare(String(b.due_date || ''));
    });

    return list;
  }

  // ============================================
  // DASHBOARD STATISTICS
  // ============================================

  function renderStats() {
    const assignments = state.assignments;

    const completed = assignments.filter(
      (assignment) => assignment.status === 'completed'
    ).length;

    const inProgress = assignments.filter(
      (assignment) => assignment.status === 'in_progress'
    ).length;

    const dueSoon = assignments.filter((assignment) => {
      const difference = dayDiff(assignment.due_date);

      return (
        assignment.status !== 'completed' &&
        difference >= 0 &&
        difference <= 7
      );
    }).length;

    const completionRate = assignments.length
      ? Math.round((completed / assignments.length) * 100)
      : 0;

    setText('statTotal', assignments.length);
    setText('statProgress', inProgress);
    setText('statCompleted', completed);
    setText('statDueSoon', dueSoon);

    setText('completionRate', `${completionRate}%`);
    setText('progressPercent', `${completionRate}%`);
    setText('progressDoneText', `${completed} completed`);
    setText(
      'progressRemainingText',
      `${assignments.length - completed} still to go`
    );

    setText('allCount', assignments.length);

    const progressFill = $('progressFill');

    if (progressFill) {
      progressFill.style.width = `${completionRate}%`;
    }
  }

  // ============================================
  // ASSIGNMENT LIST RENDERING
  // ============================================

  function renderList() {
    if (!els.list) return;

    const list = visibleAssignments();

    setText('headingCount', list.length);

    if (state.loading) {
      els.list.innerHTML = `
        <div class="loading-state">
          <span class="spinner"></span>
          Loading assignments…
        </div>
      `;

      return;
    }

    if (!list.length) {
      const hasFilters =
        (els.search && els.search.value.trim()) ||
        (els.status && els.status.value !== 'all') ||
        (els.priority && els.priority.value !== 'all');

      let title;

      if (hasFilters) {
        title = 'No assignments match these filters';
      } else if (state.view === 'completed') {
        title = 'Nothing completed just yet';
      } else if (state.view === 'today') {
        title = 'No deadlines today';
      } else if (state.view === 'upcoming') {
        title = 'Your next seven days are clear';
      } else {
        title = 'Your workspace is ready';
      }

      const description = hasFilters
        ? 'Try changing your search or filters to see more results.'
        : state.view === 'all'
          ? 'Add your first assignment to start organizing your semester.'
          : 'When there’s something to show, it’ll appear here.';

      const addButton = (
        !hasFilters &&
        state.view === 'all'
      )
        ? `
          <button
            class="primary-button"
            data-action="new"
            type="button"
          >
            ＋ Add an assignment
          </button>
        `
        : '';

      els.list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">✳</div>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(description)}</p>
          ${addButton}
        </div>
      `;

      return;
    }

    els.list.innerHTML = list.map((assignment) => {
      const difference = dayDiff(assignment.due_date);

      const dueClass =
        assignment.status === 'completed'
          ? ''
          : difference < 0
            ? 'overdue'
            : difference <= 2
              ? 'soon'
              : '';

      let dueText;

      if (assignment.status === 'completed') {
        dueText = 'Finished';
      } else if (difference < 0) {
        dueText =
          `${Math.abs(difference)} day` +
          `${Math.abs(difference) === 1 ? '' : 's'} overdue`;
      } else if (difference === 0) {
        dueText = 'Due today';
      } else if (difference === 1) {
        dueText = 'Due tomorrow';
      } else {
        dueText = `Due ${prettyDate(assignment.due_date)}`;
      }

      const priority = priorityRank[assignment.priority] !== undefined
        ? assignment.priority
        : 'medium';

      const status = statusLabels[assignment.status]
        ? assignment.status
        : 'pending';

      const estimate = Number(assignment.estimated_hours);

      const estimateHtml = Number.isFinite(estimate) && estimate > 0
        ? `
          <span class="meta-item">
            ◷ ${escapeHtml(estimate)}h estimate
          </span>
        `
        : '';

      const notesHtml = assignment.notes
        ? `
          <p class="assignment-notes">
            ${escapeHtml(assignment.notes)}
          </p>
        `
        : '';

      return `
        <article class="assignment-card">
          <div class="assignment-main">
            <div class="assignment-title-row">
              <h3 class="assignment-title">
                ${escapeHtml(assignment.title)}
              </h3>

              <span class="subject-tag">
                ${escapeHtml(assignment.subject)}
              </span>
            </div>

            ${notesHtml}

            <div class="assignment-meta">
              <span class="meta-item">
                <i class="due-dot ${dueClass}"></i>
                ${escapeHtml(dueText)}
              </span>

              <span class="priority-pill priority-${priority}">
                ${escapeHtml(
                  priority.charAt(0).toUpperCase() + priority.slice(1)
                )}
                priority
              </span>

              ${estimateHtml}
            </div>
          </div>

          <div class="card-actions">
            <button
              class="status-pill status-${status}"
              data-action="cycle"
              data-id="${escapeHtml(assignment.id)}"
              title="Click to change status"
              type="button"
            >
              ${escapeHtml(statusLabels[status])} ▾
            </button>

            <button
              class="action-button"
              data-action="edit"
              data-id="${escapeHtml(assignment.id)}"
              aria-label="Edit ${escapeHtml(assignment.title)}"
              title="Edit"
              type="button"
            >
              ✎
            </button>

            <button
              class="action-button delete"
              data-action="delete"
              data-id="${escapeHtml(assignment.id)}"
              aria-label="Delete ${escapeHtml(assignment.title)}"
              title="Delete"
              type="button"
            >
              ⌫
            </button>
          </div>
        </article>
      `;
    }).join('');
  }

  function render() {
    renderStats();
    renderList();
  }

  // ============================================
  // LOAD ASSIGNMENTS
  // ============================================

  async function loadAssignments() {
    if (state.loading) return;

    state.loading = true;
    renderList();

    try {
      const data = await api('/assignments');

      if (!Array.isArray(data.assignments)) {
        throw new Error(
          'Unexpected API response. Expected an assignments array.'
        );
      }

      state.assignments = data.assignments;

      setConnection(true);
      render();
    } catch (error) {
      setConnection(false);

      els.list.innerHTML = `
        <div class="error-state">
          <div class="empty-icon">↯</div>

          <h3>Couldn’t load assignments</h3>

          <p>
            ${escapeHtml(error.message)}
            Check that the backend is running and Supabase is configured.
          </p>

          <button
            class="secondary-button"
            data-action="retry"
            type="button"
          >
            Try again
          </button>
        </div>
      `;

      showFeedback(error.message, 'error');
    } finally {
      state.loading = false;
    }
  }

  // ============================================
  // FORM VALIDATION
  // ============================================

  function clearValidation() {
    if (!els.form) return;

    els.form.querySelectorAll('.field').forEach((element) => {
      element.classList.remove('invalid');
    });

    els.form.querySelectorAll('.field-error').forEach((element) => {
      element.textContent = '';
    });
  }

  function validateForm() {
    clearValidation();

    const titleInput = $('titleInput');
    const subjectInput = $('subjectInput');
    const dueDateInput = $('dueDateInput');
    const estimatedHoursInput = $('estimatedHoursInput');

    const values = {
      title: titleInput.value.trim(),
      subject: subjectInput.value.trim(),
      due_date: dueDateInput.value,
      estimated_hours: estimatedHoursInput.value
    };

    let valid = true;

    function fail(name, message) {
      valid = false;

      const input = els.form.elements.namedItem(name);

      if (input && input.closest('.field')) {
        input.closest('.field').classList.add('invalid');
      }

      const errorElement = els.form.querySelector(
        `[data-error="${name}"]`
      );

      if (errorElement) {
        errorElement.textContent = message;
      }
    }

    if (!values.title) {
      fail('title', 'Please enter an assignment title.');
    }

    if (!values.subject) {
      fail('subject', 'Please enter a subject or course.');
    }

    if (
      !values.due_date ||
      !localDate(values.due_date)
    ) {
      fail('due_date', 'Choose a valid due date.');
    }

    if (values.estimated_hours !== '') {
      const hours = Number(values.estimated_hours);

      if (
        !Number.isFinite(hours) ||
        hours < 0 ||
        hours > 500
      ) {
        valid = false;

        const field = estimatedHoursInput.closest('.field');

        if (field) {
          field.classList.add('invalid');
        }

        const errorElement = els.form.querySelector(
          '[data-error="estimated_hours"]'
        );

        if (errorElement) {
          errorElement.textContent =
            'Enter an estimate between 0 and 500 hours.';
        }
      }
    }

    return valid;
  }

  // ============================================
  // OPEN ADD / EDIT DIALOG
  // ============================================

  function openForm(assignment = null) {
    if (!els.form || !els.dialog) return;

    clearValidation();
    els.form.reset();

    $('assignmentId').value = assignment?.id ?? '';

    setText(
      'dialogTitle',
      assignment ? 'Edit assignment' : 'New assignment'
    );

    setText(
      'dialogEyebrow',
      assignment ? 'UPDATE YOUR PLAN' : 'PLAN YOUR NEXT WIN'
    );

    setText(
      'saveButton',
      assignment ? 'Save changes' : 'Save assignment'
    );

    $('titleInput').value = assignment?.title || '';
    $('subjectInput').value = assignment?.subject || '';

    $('dueDateInput').value = assignment?.due_date
      ? String(assignment.due_date).slice(0, 10)
      : todayKey();

    $('priorityInput').value = assignment?.priority || 'medium';
    $('statusInput').value = assignment?.status || 'pending';

    $('estimatedHoursInput').value =
      assignment?.estimated_hours ?? '';

    $('notesInput').value = assignment?.notes || '';

    els.dialog.showModal();
    $('titleInput').focus();
  }

  // ============================================
  // CREATE / UPDATE ASSIGNMENT
  // ============================================

  async function saveAssignment(event) {
    event.preventDefault();

    if (!validateForm()) return;

    const id = $('assignmentId').value;
    const estimated = $('estimatedHoursInput').value;

    const payload = {
      title: $('titleInput').value.trim(),
      subject: $('subjectInput').value.trim(),
      due_date: $('dueDateInput').value,
      priority: $('priorityInput').value,
      status: $('statusInput').value,
      estimated_hours: estimated === ''
        ? null
        : Number(estimated),
      notes: $('notesInput').value.trim() || null
    };

    const button = $('saveButton');

    button.disabled = true;
    button.textContent = 'Saving…';

    try {
      await api(
        id
          ? `/assignments/${encodeURIComponent(id)}`
          : '/assignments',
        {
          method: id ? 'PATCH' : 'POST',
          body: JSON.stringify(payload)
        }
      );

      els.dialog.close();

      showFeedback(
        id
          ? 'Assignment updated successfully.'
          : 'Assignment created successfully.'
      );

      await loadAssignments();
    } catch (error) {
      showFeedback(error.message, 'error');
    } finally {
      button.disabled = false;
      button.textContent = id
        ? 'Save changes'
        : 'Save assignment';
    }
  }

  // ============================================
  // CHANGE ASSIGNMENT STATUS
  // ============================================

  async function changeStatus(id) {
    const assignment = state.assignments.find(
      (item) => String(item.id) === String(id)
    );

    if (!assignment) return;

    const nextStatus = {
      pending: 'in_progress',
      in_progress: 'completed',
      completed: 'pending'
    }[assignment.status] || 'pending';

    try {
      await api(`/assignments/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: nextStatus
        })
      });

      showFeedback(
        `Status changed to ${statusLabels[nextStatus].toLowerCase()}.`
      );

      await loadAssignments();
    } catch (error) {
      showFeedback(error.message, 'error');
    }
  }

  // ============================================
  // DELETE ASSIGNMENT
  // ============================================

  async function deleteAssignment() {
    if (state.deleteId === null || state.deleteId === '') {
      return;
    }

    const id = state.deleteId;
    const confirmButton = $('confirmDelete');

    confirmButton.disabled = true;

    try {
      await api(`/assignments/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });

      els.confirmDialog.close();
      state.deleteId = null;

      showFeedback('Assignment deleted successfully.');

      await loadAssignments();
    } catch (error) {
      showFeedback(error.message, 'error');
    } finally {
      confirmButton.disabled = false;
    }
  }

  // ============================================
  // NAVIGATION AND FILTERS
  // ============================================

  function setView(view) {
    state.view = view;

    document.querySelectorAll('.nav-item').forEach((button) => {
      button.classList.toggle(
        'active',
        button.dataset.view === view
      );
    });

    const labels = {
      all: 'All assignments',
      today: 'Due today',
      upcoming: 'Upcoming',
      completed: 'Completed'
    };

    setText('breadcrumbView', labels[view] || labels.all);

    const heading = $('listHeading');

    if (heading && heading.childNodes.length > 0) {
      heading.childNodes[0].textContent =
        `${labels[view] || labels.all} `;
    }

    if (view === 'completed') {
      els.status.value = 'completed';
    } else if (els.status.value === 'completed') {
      els.status.value = 'all';
    }

    renderList();

    const sidebar = $('sidebar');

    if (sidebar) {
      sidebar.classList.remove('open');
    }
  }

  function clearFilters() {
    els.search.value = '';
    els.status.value = 'all';
    els.priority.value = 'all';
    els.sort.value = 'due_asc';

    setView('all');
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  function init() {
    const todayLabel = $('todayLabel');

    if (todayLabel) {
      todayLabel.textContent = new Date()
        .toLocaleDateString(undefined, {
          weekday: 'long',
          month: 'long',
          day: 'numeric'
        })
        .toUpperCase();
    }

    const newAssignmentButton = $('newAssignmentButton');

    if (newAssignmentButton) {
      newAssignmentButton.addEventListener(
        'click',
        () => openForm()
      );
    }

    const closeDialog = $('closeDialog');

    if (closeDialog) {
      closeDialog.addEventListener('click', () => {
        els.dialog.close();
      });
    }

    const cancelDialog = $('cancelDialog');

    if (cancelDialog) {
      cancelDialog.addEventListener('click', () => {
        els.dialog.close();
      });
    }

    const keepAssignment = $('keepAssignment');

    if (keepAssignment) {
      keepAssignment.addEventListener('click', () => {
        state.deleteId = null;
        els.confirmDialog.close();
      });
    }

    const confirmDelete = $('confirmDelete');

    if (confirmDelete) {
      confirmDelete.addEventListener(
        'click',
        deleteAssignment
      );
    }

    if (els.form) {
      els.form.addEventListener('submit', saveAssignment);

      els.form.addEventListener('input', (event) => {
        const field = event.target.closest('.field');

        if (field) {
          field.classList.remove('invalid');

          const errorElement = field.querySelector('.field-error');

          if (errorElement) {
            errorElement.textContent = '';
          }
        }
      });
    }

    if (els.search) {
      els.search.addEventListener('input', renderList);
    }

    [els.status, els.priority, els.sort].forEach((element) => {
      if (element) {
        element.addEventListener('change', renderList);
      }
    });

    document.querySelectorAll('.nav-item').forEach((button) => {
      button.addEventListener('click', () => {
        setView(button.dataset.view);
      });
    });

    const clearFiltersButton = $('clearFiltersButton');

    if (clearFiltersButton) {
      clearFiltersButton.addEventListener(
        'click',
        clearFilters
      );
    }

    const refreshButton = $('refreshButton');

    if (refreshButton) {
      refreshButton.addEventListener(
        'click',
        loadAssignments
      );
    }

    const mobileMenu = $('mobileMenu');

    if (mobileMenu) {
      mobileMenu.addEventListener('click', () => {
        const sidebar = $('sidebar');

        if (sidebar) {
          sidebar.classList.toggle('open');
        }
      });
    }

    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');

      if (!button) return;

      const { action, id } = button.dataset;

      if (action === 'new') {
        openForm();
      }

      if (action === 'retry') {
        loadAssignments();
      }

      if (action === 'edit') {
        const assignment = state.assignments.find(
          (item) => String(item.id) === String(id)
        );

        if (assignment) {
          openForm(assignment);
        }
      }

      if (action === 'cycle') {
        changeStatus(id);
      }

      if (action === 'delete') {
        state.deleteId = id;
        els.confirmDialog.showModal();
      }
    });

    if (els.dialog) {
      els.dialog.addEventListener('click', (event) => {
        if (event.target === els.dialog) {
          els.dialog.close();
        }
      });
    }

    if (els.confirmDialog) {
      els.confirmDialog.addEventListener('click', (event) => {
        if (event.target === els.confirmDialog) {
          state.deleteId = null;
          els.confirmDialog.close();
        }
      });
    }

    // Start loading assignments.
    loadAssignments();
  }

  // ============================================
  // APPLICATION STARTUP
  // ============================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
(() => {
    'use strict';

    const root = document.querySelector('.g-review');
    if (!root) {
        return;
    }
    const find = selector => root.querySelector(selector);
    const icons = () => window.lucide?.createIcons();
    const make = (tag, text, className) => {
        const element = document.createElement(tag);
        if (text !== undefined) {
            element.textContent = text;
        }
        if (className) {
            element.className = className;
        }
        return element;
    };
    const paletteOptions = [...root.querySelectorAll('[data-g-palette-option]')];
    const themeColor = property => getComputedStyle(root).getPropertyValue(property).trim();
    const chartPalette = () => [1, 2, 3, 4, 5, 6, 7, 8].map(index => themeColor(`--g-chart-${index}`));
    let repaintPalette = () => {};

    function selectPalette(value) {
        const selected = paletteOptions.find(option => option.value === value) || paletteOptions[0];
        if (!selected) {
            return;
        }
        selected.checked = true;
        find('[data-palette-background]').textContent = selected.dataset.background;
        find('[data-palette-navigation]').textContent = selected.dataset.navigation;
        const address = new URL(location.href);
        address.searchParams.set('palette', selected.value);
        history.replaceState(history.state, '', address);
        try {
            sessionStorage.setItem('wms.uiReview.designG.palette', selected.value);
        } catch {
        }
        root.querySelectorAll('a[href]').forEach(link => {
            const target = new URL(link.href, location.origin);
            if (target.origin === location.origin && /^\/ui-review\/(login|main|about)\/design-g$/.test(target.pathname)) {
                target.searchParams.set('palette', selected.value);
                link.href = `${target.pathname}${target.search}${target.hash}`;
            }
        });
        repaintPalette();
    }

    if (paletteOptions.length) {
        const requested = new URL(location.href).searchParams.get('palette');
        let initialPalette = requested;
        if (requested === null) {
            try {
                initialPalette = sessionStorage.getItem('wms.uiReview.designG.palette');
            } catch {
            }
        }
        selectPalette(initialPalette);
        paletteOptions.forEach(option => {
            option.addEventListener('change', () => selectPalette(option.value));
        });
        window.addEventListener('popstate', () => selectPalette(new URL(location.href).searchParams.get('palette')));
    }
    icons();
    find('[data-password-toggle]')?.addEventListener('click', event => {
        const input = find('#g-password');
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        event.currentTarget.title = show ? 'Hide password' : 'Show password';
        event.currentTarget.setAttribute('aria-label', event.currentTarget.title);
        event.currentTarget.innerHTML = show ? '<i data-lucide="eye-off"></i>' : '<i data-lucide="eye"></i>';
        icons();
    });
    find('[data-environment]')?.addEventListener('change', event => {
        find('[data-production]').hidden = event.target.value !== 'EBSPROD';
    });
    find('[data-login-form]')?.addEventListener('submit', event => {
        if (event.currentTarget.checkValidity()) {
            const button = event.currentTarget.querySelector('[type=submit]');
            button.disabled = true;
            button.querySelector('span').textContent = 'Signing in';
        }
    });
    window.addEventListener('pageshow', () => {
        const button = find('[data-login-form] [type=submit]');
        if (button) {
            button.disabled = false;
            button.querySelector('span').textContent = 'Sign in';
        }
    });
    if (!root.matches('[data-dashboard]')) {
        return;
    }

    let snapshot = JSON.parse(find('[data-snapshot]').textContent);
    let summary = JSON.parse(find('[data-summary]').textContent);
    let selectedType = '';
    let currentPage = 1;
    let refreshing = false;
    let summaryRefreshing = false;
    let summaryChart;
    let inventoryChart;
    const dialog = find('[data-task-dialog]');
    let palette = chartPalette();
    const number = value => new Intl.NumberFormat('en').format(value);
    const time = value => new Date(value).toLocaleTimeString([], {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const date = value => new Date(value).toLocaleDateString([], {
        year: 'numeric', month: 'short', day: 'numeric'
    });
    const isHigh = task => /high|urgent|critical/i.test(task.priority || '');

    function matchingTasks() {
        const query = find('[data-search]').value.trim().toLowerCase();
        const highOnly = find('[data-priority]').checked;
        return snapshot.tasks.map((task, index) => ({ task, index })).filter(({ task }) => {
            return (!selectedType || task.jobType === selectedType)
                && (!highOnly || isHigh(task))
                && `${task.detail} ${task.status} ${task.priority} ${task.jobType}`.toLowerCase().includes(query);
        });
    }

    function taskRow(task, index) {
        const row = make('article', undefined, 'g-job');
        row.classList.toggle('is-high', isHigh(task));
        const content = make('div');
        const meta = make('div', undefined, 'g-job-type');
        meta.append(make('strong', task.jobType), make('span', task.status || '--'), make('span', task.priority || '--'));
        const title = make(task.url ? 'a' : 'strong', task.detail, 'g-job-title');
        if (task.url) {
            title.href = task.url;
            title.target = '_blank';
            title.rel = 'noopener';
            title.title = 'Open WMS task';
        }
        content.append(meta, title, make('time', `Assigned ${task.assignedAt}`));
        const actions = make('div', undefined, 'g-job-actions');
        const details = make('button', undefined, 'g-icon');
        details.type = 'button';
        details.dataset.taskIndex = index;
        details.title = 'Task details';
        details.setAttribute('aria-label', `Details: ${task.detail}`);
        details.innerHTML = '<i data-lucide="info" aria-hidden="true"></i>';
        actions.append(details);
        if (task.url) {
            const open = make('a', undefined, 'g-command');
            open.href = task.url;
            open.target = '_blank';
            open.rel = 'noopener';
            open.title = 'Open WMS task';
            open.setAttribute('aria-label', `Open WMS task: ${task.detail}`);
            open.innerHTML = '<span>Open</span><i data-lucide="arrow-up-right" aria-hidden="true"></i>';
            actions.append(open);
        }
        row.append(make('div', undefined, 'g-job-marker'), content, actions);
        return row;
    }

    function renderQueue(resetScroll = true) {
        const tasks = matchingTasks();
        const pageSize = Number(find('[data-page-size]').value);
        const pages = Math.max(1, Math.ceil(tasks.length / pageSize));
        const previousPage = currentPage;
        currentPage = Math.min(Math.max(1, currentPage), pages);
        const start = (currentPage - 1) * pageSize;
        const list = find('[data-job-list]');
        const previousScroll = list.scrollTop;
        list.replaceChildren(...tasks.slice(start, start + pageSize).map(({ task, index }) => taskRow(task, index)));
        if (!tasks.length) {
            list.append(make('p', snapshot.tasksAvailable ? 'No matching pending jobs.' : 'Pending jobs are unavailable.', 'g-empty'));
        }
        list.scrollTop = resetScroll || previousPage !== currentPage ? 0 : previousScroll;
        const count = find('[data-list-count]');
        if (!snapshot.tasksAvailable) {
            count.textContent = 'Pending jobs unavailable';
        } else if (!tasks.length) {
            count.textContent = '0 jobs';
        } else {
            count.textContent = `${start + 1}-${Math.min(start + pageSize, tasks.length)} of ${number(tasks.length)} jobs`;
            if (tasks.length !== snapshot.tasks.length) {
                count.append(` / ${number(snapshot.tasks.length)} total`);
            }
        }
        const pageInput = find('[data-page-number]');
        pageInput.value = currentPage;
        pageInput.max = pages;
        pageInput.disabled = !tasks.length;
        find('[data-page-total]').textContent = `of ${pages}`;
        root.querySelectorAll('[data-page]').forEach(button => {
            const first = button.dataset.page === 'first' || button.dataset.page === 'previous';
            button.disabled = !tasks.length || (first ? currentPage === 1 : currentPage === pages);
        });
        find('[data-job-modes]').querySelectorAll('button').forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.jobType === selectedType));
        });
        icons();
    }

    function renderDashboard() {
        const pendingCount = find('[data-pending-count]');
        pendingCount.textContent = snapshot.tasksAvailable ? number(snapshot.tasks.length) : '--';
        pendingCount.closest('.g-metrics > div').classList.toggle('has-pending-jobs', snapshot.tasksAvailable && snapshot.tasks.length > 0);
        find('[data-high-count]').textContent = snapshot.tasksAvailable ? number(snapshot.tasks.filter(isHigh).length) : '--';
        root.querySelectorAll('[data-assigned-count]').forEach(element => {
            element.textContent = snapshot.errors.some(error => error.area === 'Allocated jobs') ? '--' : number(snapshot.allocatedTasks.length);
        });
        find('[data-inventory-count]').textContent = snapshot.inventory ? number(snapshot.inventory.totalRecords) : '--';
        find('[data-updated]').textContent = `Updated ${time(snapshot.retrievedAt)}`;
        find('[data-errors]').replaceChildren(...snapshot.errors.map(error => make('p', error.message, 'g-error')));
        if (selectedType && !snapshot.pendingJobs.some(job => job.jobType === selectedType)) {
            selectedType = '';
        }
        const modes = find('[data-job-modes]');
        modes.replaceChildren(...[{ jobType: '', count: snapshot.tasks.length }, ...snapshot.pendingJobs].map(job => {
            const button = make('button', job.jobType || 'All jobs');
            button.type = 'button';
            button.dataset.jobType = job.jobType;
            button.setAttribute('aria-pressed', String(job.jobType === selectedType));
            button.append(make('span', snapshot.tasksAvailable ? number(job.count) : '--'));
            return button;
        }));
        renderQueue(false);
        const allocated = find('[data-allocated]');
        allocated.replaceChildren(...snapshot.allocatedTasks.map(task => {
            const row = make('div', undefined, 'g-allocation');
            row.append(make('time', task.assignDate), make('span', task.message));
            return row;
        }));
        if (!snapshot.allocatedTasks.length) {
            allocated.append(make('p', snapshot.errors.some(error => error.area === 'Allocated jobs') ? 'Allocated jobs are unavailable.' : 'No allocated jobs.', 'g-empty'));
        }
        const news = find('[data-news]');
        news.replaceChildren(...snapshot.announcements.map(announcement => {
            const article = make('article');
            if (announcement.publishedAt) {
                article.append(make('small', date(announcement.publishedAt)));
            }
            article.append(make('h3', announcement.title), make('p', announcement.detail));
            return article;
        }));
        if (!snapshot.announcements.length) {
            news.append(make('p', snapshot.errors.some(error => error.area === 'Announcements') ? 'Notice Board is unavailable.' : 'No notices.', 'g-empty'));
        }
        renderInventory();
        icons();
    }

    function renderInventory() {
        const inventory = snapshot.inventory;
        const slices = inventory?.slices || [];
        const total = inventory?.totalRecords || 0;
        const legend = find('[data-inventory-legend]');
        legend.replaceChildren(...slices.map((slice, index) => {
            const row = make('div', undefined, 'g-legend');
            const swatch = make('span', undefined, 'g-swatch');
            swatch.style.backgroundColor = palette[index % palette.length];
            row.title = `${number(slice.records)} records`;
            row.append(swatch, make('span', slice.subinventory), make('strong', `${total ? (slice.records / total * 100).toFixed(1) : '0.0'}%`));
            return row;
        }));
        if (!slices.length) {
            legend.append(make('p', inventory ? 'No on-hand records.' : 'Inventory is unavailable.', 'g-empty'));
        }
        find('[data-inventory-time]').textContent = inventory ? `/ ${time(inventory.retrievedAt)}` : '';
        if (!window.Chart) {
            return;
        }
        inventoryChart?.destroy();
        inventoryChart = new Chart(find('[data-inventory-chart]'), {
            type: 'pie',
            data: {
                labels: slices.map(slice => slice.subinventory),
                datasets: [{
                    data: slices.map(slice => slice.records),
                    backgroundColor: slices.map((slice, index) => palette[index % palette.length]),
                    borderWidth: 3,
                    borderColor: themeColor('--g-page')
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: context => `${context.label}: ${number(context.raw)} records (${total ? (context.raw / total * 100).toFixed(1) : '0.0'}%)`
                        }
                    }
                }
            }
        });
    }

    function renderSummary() {
        find('[data-summary-updated]').textContent = summary.available ? `Updated ${time(summary.retrievedAt)}` : 'Unavailable';
        find('[data-summary-range]').textContent = `${date(summary.dateFrom)} - ${date(summary.dateTo)}`;
        find('[data-date-from]').value = summary.dateFrom.slice(0, 10);
        find('[data-date-from]').max = summary.dateTo.slice(0, 10);
        find('[data-summary-status]').replaceChildren();
        if (summary.errorMessage) {
            find('[data-summary-status]').append(make('p', summary.errorMessage, 'g-error'));
        }
        const fields = ['receiving', 'rma', 'shipping', 'stockTransfer', 'miscReceipt', 'miscIssue', 'wipIn', 'wipOut', 'total'];
        const rows = find('[data-summary-rows]');
        rows.replaceChildren(...summary.rows.map(item => {
            const row = make('tr');
            const label = make('th', item.operatingUnit);
            label.scope = 'row';
            row.append(label, ...fields.map(field => make('td', item[field] || '--')));
            return row;
        }));
        if (!summary.rows.length) {
            const row = make('tr');
            const cell = make('td', summary.available ? 'No task summary data for the selected date range.' : 'Task summary is unavailable.', 'g-empty');
            cell.colSpan = 10;
            row.append(cell);
            rows.append(row);
        }
        find('[data-summary-chart-wrap]').hidden = !summary.available || !summary.rows.length;
        summaryChart?.destroy();
        summaryChart = undefined;
        if (!window.Chart || !summary.available || !summary.rows.length) {
            return;
        }
        summaryChart = new Chart(find('[data-summary-chart]'), {
            type: 'bar',
            data: {
                labels: summary.rows.map(row => row.operatingUnit),
                datasets: [{
                    data: summary.rows.map(row => {
                        const value = Number(row.total);
                        return row.total?.trim() && Number.isFinite(value) && value >= 0 ? value : null;
                    }),
                    backgroundColor: summary.rows.map((row, index) => palette[index % palette.length]),
                    maxBarThickness: 20,
                    borderRadius: 2
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { beginAtZero: true, ticks: { precision: 0, color: themeColor('--g-muted'), font: { size: 10 } }, grid: { color: themeColor('--g-chart-grid') } },
                    y: { grid: { display: false }, ticks: { color: themeColor('--g-muted'), font: { size: 11 } } }
                }
            }
        });
    }

    repaintPalette = () => {
        palette = chartPalette();
        root.querySelectorAll('.g-swatch').forEach((swatch, index) => {
            swatch.style.backgroundColor = palette[index % palette.length];
        });
        if (inventoryChart) {
            const dataset = inventoryChart.data.datasets[0];
            dataset.backgroundColor = dataset.data.map((value, index) => palette[index % palette.length]);
            dataset.borderColor = themeColor('--g-page');
            inventoryChart.update('none');
        }
        if (summaryChart) {
            const dataset = summaryChart.data.datasets[0];
            dataset.backgroundColor = dataset.data.map((value, index) => palette[index % palette.length]);
            summaryChart.options.scales.x.ticks.color = themeColor('--g-muted');
            summaryChart.options.scales.y.ticks.color = themeColor('--g-muted');
            summaryChart.options.scales.x.grid.color = themeColor('--g-chart-grid');
            summaryChart.update('none');
        }
    };

    async function refreshSnapshot() {
        try {
            const response = await fetch('/ui-review/main/design-g/snapshot', {
                headers: { Accept: 'application/json' },
                cache: 'no-store',
                signal: AbortSignal.timeout(45000)
            });
            if (response.status === 401) {
                location.assign('/ui-review/login/design-g');
                return;
            }
            if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
                throw new Error('Refresh failed');
            }
            snapshot = await response.json();
            renderDashboard();
        } catch {
            find('[data-updated]').textContent = 'Refresh failed. Showing previous dashboard snapshot.';
        }
    }

    async function refreshSummary() {
        if (summaryRefreshing) {
            return;
        }
        const input = find('[data-date-from]');
        if (!input.checkValidity()) {
            find('[data-summary-status]').replaceChildren(make('p', 'Choose a target date on or before today.', 'g-error'));
            return;
        }
        summaryRefreshing = true;
        input.disabled = true;
        find('[data-summary-refresh]').disabled = true;
        find('[data-summary-section]').setAttribute('aria-busy', 'true');
        try {
            const response = await fetch(`/ui-review/main/design-g/summary?dateFrom=${encodeURIComponent(input.value)}`, {
                headers: { Accept: 'application/json' },
                cache: 'no-store',
                signal: AbortSignal.timeout(45000)
            });
            if (response.status === 401) {
                location.assign('/ui-review/login/design-g');
                return;
            }
            if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
                throw new Error('Summary refresh failed');
            }
            summary = await response.json();
            renderSummary();
        } catch {
            find('[data-summary-status]').replaceChildren(make('p', 'Refresh failed. Showing the previous task summary and date range.', 'g-error'));
        } finally {
            summaryRefreshing = false;
            input.disabled = false;
            find('[data-summary-refresh]').disabled = false;
            find('[data-summary-section]').removeAttribute('aria-busy');
        }
    }

    async function refreshDashboard() {
        if (refreshing) {
            return;
        }
        refreshing = true;
        find('[data-refresh]').disabled = true;
        try {
            await Promise.all([refreshSnapshot(), refreshSummary()]);
        } finally {
            refreshing = false;
            find('[data-refresh]').disabled = false;
        }
    }

    function resetQueue() {
        currentPage = 1;
        renderQueue();
    }

    find('[data-search]').addEventListener('input', resetQueue);
    find('[data-priority]').addEventListener('change', resetQueue);
    find('[data-page-size]').addEventListener('change', resetQueue);
    find('[data-job-modes]').addEventListener('click', event => {
        const button = event.target.closest('[data-job-type]');
        if (button) {
            selectedType = button.dataset.jobType;
            resetQueue();
        }
    });
    root.querySelectorAll('[data-page]').forEach(button => {
        button.addEventListener('click', () => {
            const pages = Math.max(1, Math.ceil(matchingTasks().length / Number(find('[data-page-size]').value)));
            const target = button.dataset.page;
            if (target === 'first') {
                currentPage = 1;
            } else if (target === 'last') {
                currentPage = pages;
            } else {
                currentPage += target === 'next' ? 1 : -1;
            }
            renderQueue();
        });
    });
    find('[data-page-number]').addEventListener('change', event => {
        const requested = Number(event.target.value);
        currentPage = Number.isFinite(requested) ? Math.trunc(requested) : 1;
        renderQueue();
    });
    find('[data-job-list]').addEventListener('click', event => {
        const trigger = event.target.closest('[data-task-index]');
        if (!trigger) {
            return;
        }
        const task = snapshot.tasks[Number(trigger.dataset.taskIndex)];
        const fields = make('dl');
        [['Task', task.detail], ['Assigned', task.assignedAt], ['Job type', task.jobType], ['Status', task.status || '--'], ['Priority', task.priority || '--']].forEach(([label, value]) => {
            fields.append(make('dt', label), make('dd', value));
        });
        find('[data-task-detail]').replaceChildren(fields);
        const link = find('[data-task-link]');
        link.hidden = !task.url;
        if (task.url) {
            link.href = task.url;
        } else {
            link.removeAttribute('href');
        }
        dialog.showModal();
    });
    root.querySelectorAll('[data-dialog-close]').forEach(button => {
        button.addEventListener('click', () => dialog.close());
    });
    find('[data-refresh]').addEventListener('click', refreshDashboard);
    find('[data-summary-form]').addEventListener('submit', event => {
        event.preventDefault();
        refreshSummary();
    });
    document.addEventListener('click', event => {
        root.querySelectorAll('.g-nav details[open]').forEach(menu => {
            if (!menu.contains(event.target)) {
                menu.open = false;
            }
        });
    });
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') {
            return;
        }
        if (dialog.open) {
            event.preventDefault();
            dialog.close();
            return;
        }
        const openMenus = [...root.querySelectorAll('.g-nav details[open]')];
        const focusedMenu = openMenus.find(menu => menu.contains(document.activeElement));
        openMenus.forEach(menu => {
            menu.open = false;
        });
        focusedMenu?.querySelector('summary').focus();
    });
    window.setInterval(() => {
        if (find('[data-auto-refresh]').checked && !document.hidden && !dialog.open) {
            refreshDashboard();
        }
    }, 60000);
    renderDashboard();
    renderSummary();
})();
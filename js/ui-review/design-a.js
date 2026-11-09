(() => {
    'use strict';

    const root = document.querySelector('.a-review');
    if (!root) {
        return;
    }

    const find = selector => root.querySelector(selector);
    const icons = () => window.lucide?.createIcons();
    icons();

    find('[data-password-toggle]')?.addEventListener('click', event => {
        const password = find('#a-password');
        const showing = password.type === 'password';
        password.type = showing ? 'text' : 'password';
        event.currentTarget.setAttribute('aria-label', showing ? 'Hide password' : 'Show password');
        event.currentTarget.title = showing ? 'Hide password' : 'Show password';
        event.currentTarget.innerHTML = showing ? '<i data-lucide="eye-off"></i>' : '<i data-lucide="eye"></i>';
        icons();
    });

    find('[data-environment]')?.addEventListener('change', event => {
        find('[data-production]').hidden = event.target.value !== 'EBSPROD';
    });

    find('[data-login-form]')?.addEventListener('submit', event => {
        if (event.currentTarget.checkValidity()) {
            const button = event.currentTarget.querySelector('[type="submit"]');
            button.disabled = true;
            button.querySelector('span').textContent = 'Signing in';
        }
    });

    window.addEventListener('pageshow', () => {
        const button = find('[data-login-form] [type="submit"]');
        if (button) {
            button.disabled = false;
            button.querySelector('span').textContent = 'Sign in';
        }
    });

    if (!root.matches('[data-dashboard]')) {
        return;
    }

    let snapshot = JSON.parse(find('[data-snapshot]').textContent);
    let jobsChart;
    let inventoryChart;
    let refreshing = false;
    let weatherRequest;
    const palette = ['#00857e', '#3482bd', '#de9c23', '#bf5369', '#6570a9', '#629957', '#ac6d28', '#677d85'];
    const number = value => new Intl.NumberFormat('en').format(value);
    const time = value => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const node = (tag, text, className) => {
        const element = document.createElement(tag);
        if (text !== undefined) {
            element.textContent = text;
        }
        if (className) {
            element.className = className;
        }
        return element;
    };

    function renderTasks() {
        const query = find('[data-task-search]').value.toLowerCase();
        const type = find('[data-task-type]').value;
        const body = find('[data-task-rows]');
        body.replaceChildren();
        const matching = snapshot.tasks.map((task, index) => ({ task, index })).filter(({ task }) => {
            return (!type || task.jobType === type)
                && `${task.detail} ${task.status} ${task.jobType} ${task.priority}`.toLowerCase().includes(query);
        });

        matching.forEach(({ task, index }) => {
            const row = node('tr');
            row.append(node('td', task.assignedAt));
            const detail = node('td');
            const button = node('button', task.detail, 'a-task-open');
            button.type = 'button';
            button.dataset.taskIndex = index;
            detail.append(button);
            row.append(detail, node('td', task.jobType));
            const status = node('td');
            status.append(node('span', task.status || '--', 'a-status'));
            row.append(status, node('td', task.priority || '--'));
            const action = node('td');
            const open = node('button', undefined, 'a-icon');
            open.type = 'button';
            open.dataset.taskIndex = index;
            open.title = 'Task details';
            open.setAttribute('aria-label', `Details: ${task.detail}`);
            open.innerHTML = '<i data-lucide="chevron-right" aria-hidden="true"></i>';
            action.append(open);
            row.append(action);
            body.append(row);
        });

        if (!matching.length) {
            const row = node('tr');
            const cell = node('td', snapshot.tasksAvailable ? (query || type ? 'No matching tasks.' : 'No pending tasks assigned to you.') : 'Pending tasks are unavailable.', 'a-empty');
            cell.colSpan = 6;
            row.append(cell);
            body.append(row);
        }
        find('[data-task-count]').textContent = `${matching.length} of ${snapshot.tasks.length}`;
        icons();
    }

    function renderDashboard() {
        find('[data-pending-count]').textContent = snapshot.tasksAvailable ? number(snapshot.tasks.length) : '--';
        root.querySelectorAll('[data-assigned-count]').forEach(element => {
            element.textContent = snapshot.errors.some(error => error.area === 'Allocated jobs') ? '--' : number(snapshot.allocatedTasks.length);
        });
        find('[data-inventory-count]').textContent = snapshot.inventory ? number(snapshot.inventory.totalRecords) : '--';
        find('[data-updated]').textContent = `Updated ${time(snapshot.retrievedAt)}`;
        const errors = find('[data-errors]');
        errors.replaceChildren(...snapshot.errors.map(error => node('p', error.message, 'a-load-error')));
        const filter = find('[data-task-type]');
        const selected = filter.value;
        filter.replaceChildren(new Option('All job types', ''), ...snapshot.pendingJobs.map(job => new Option(job.jobType, job.jobType)));
        filter.value = selected;
        renderTasks();

        const allocated = find('[data-allocated-rows]');
        allocated.replaceChildren(...snapshot.allocatedTasks.map(task => {
            const item = node('div', undefined, 'a-allocation');
            item.append(node('time', task.assignDate), node('span', task.message));
            return item;
        }));
        if (!snapshot.allocatedTasks.length) {
            allocated.append(node('p', snapshot.errors.some(error => error.area === 'Allocated jobs') ? 'Allocated jobs are unavailable.' : 'No allocated jobs.', 'a-empty'));
        }

        const news = find('[data-news]');
        news.replaceChildren(...snapshot.announcements.map(announcement => {
            const item = node('article');
            if (announcement.publishedAt) {
                item.append(node('small', new Date(announcement.publishedAt).toLocaleDateString()));
            }
            item.append(node('h3', announcement.title), node('p', announcement.detail));
            return item;
        }));
        if (!snapshot.announcements.length) {
            news.append(node('p', 'No announcements.', 'a-empty'));
        }
        renderCharts();
    }

    function renderCharts() {
        const jobs = snapshot.pendingJobs;
        find('[data-job-values]').replaceChildren(...jobs.map(job => node('span', `${job.jobType}: ${job.count}`)));
        const legend = find('[data-inventory-legend]');
        legend.replaceChildren();
        const inventory = snapshot.inventory;
        const slices = inventory?.slices || [];
        const total = inventory?.totalRecords || 0;
        slices.forEach((slice, index) => {
            const row = node('div', undefined, 'a-legend-row');
            const swatch = node('span', undefined, 'a-swatch');
            swatch.style.backgroundColor = palette[index % palette.length];
            const percentage = total ? (slice.records / total * 100).toFixed(1) : '0.0';
            row.append(swatch, node('span', slice.subinventory), node('strong', `${percentage}%`));
            row.title = `${slice.subinventory}: ${number(slice.records)} records`;
            legend.append(row);
        });
        if (!slices.length) {
            legend.append(node('p', inventory ? 'No on-hand records in Org 116.' : 'Inventory is unavailable.', 'a-empty'));
        }
        find('[data-inventory-time]').textContent = inventory ? `Snapshot ${time(inventory.retrievedAt)}` : '';
        if (!window.Chart) {
            return;
        }
        jobsChart?.destroy();
        inventoryChart?.destroy();
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        jobsChart = new Chart(find('[data-jobs-chart]'), {
            type: 'bar',
            data: { labels: jobs.map(job => job.jobType), datasets: [{ data: jobs.map(job => job.count), backgroundColor: '#00857e', borderRadius: 3, maxBarThickness: 38 }] },
            options: { responsive: true, maintainAspectRatio: false, animation: reducedMotion ? false : { duration: 250 }, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#e5ebee' } }, x: { grid: { display: false } } }, onClick: (event, elements) => {
                if (elements.length) {
                    find('[data-task-type]').value = jobs[elements[0].index].jobType;
                    renderTasks();
                }
            } }
        });
        inventoryChart = new Chart(find('[data-inventory-chart]'), {
            type: 'pie',
            data: { labels: slices.map(slice => slice.subinventory), datasets: [{ data: slices.map(slice => slice.records), backgroundColor: slices.map((slice, index) => palette[index % palette.length]), borderWidth: 2, borderColor: '#f5f7f8' }] },
            options: { responsive: true, maintainAspectRatio: false, animation: reducedMotion ? false : { duration: 250 }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: context => `${context.label}: ${number(context.raw)} records (${total ? (context.raw / total * 100).toFixed(1) : '0.0'}%)` } } } }
        });
    }

    async function refresh() {
        if (refreshing) {
            return;
        }
        refreshing = true;
        const button = find('[data-refresh]');
        button.disabled = true;
        root.setAttribute('aria-busy', 'true');
        try {
            const response = await fetch('/ui-review/main/design-a/snapshot', { headers: { Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(45000) });
            if (response.status === 401) {
                location.assign('/ui-review/login/design-a');
                return;
            }
            if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
                throw new Error('Dashboard refresh failed.');
            }
            snapshot = await response.json();
            renderDashboard();
        } catch {
            find('[data-updated]').textContent = 'Refresh failed. Showing previous snapshot.';
        } finally {
            refreshing = false;
            button.disabled = false;
            root.removeAttribute('aria-busy');
        }
    }

    async function weather() {
        weatherRequest?.abort();
        weatherRequest = new AbortController();
        const locations = { hk: [22.3193, 114.1694], sg: [1.3521, 103.8198], tk: [35.6762, 139.6503] };
        const coordinates = locations[find('[data-weather-city]').value];
        const request = weatherRequest;
        find('[data-weather-temperature]').textContent = '--';
        find('[data-weather-condition]').textContent = 'Updating weather';
        find('[data-weather-time]').textContent = '';
        try {
            const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${coordinates[0]}&longitude=${coordinates[1]}&current=temperature_2m,weather_code&timezone=auto`, { signal: AbortSignal.any([request.signal, AbortSignal.timeout(12000)]) });
            if (!response.ok) {
                throw new Error('Weather unavailable');
            }
            const result = await response.json();
            const current = result.current;
            if (!Number.isFinite(current?.temperature_2m) || !Number.isFinite(current?.weather_code)) {
                throw new Error('Invalid weather');
            }
            find('[data-weather-temperature]').textContent = Math.round(current.temperature_2m);
            const code = current.weather_code;
            find('[data-weather-condition]').textContent = code === 0 ? 'Clear' : code < 4 ? 'Cloudy' : code < 50 ? 'Fog' : code < 70 ? 'Rain' : code < 80 ? 'Snow' : code < 95 ? 'Showers' : 'Thunderstorm';
            find('[data-weather-time]').textContent = `Open-Meteo / ${current.time.replace('T', ' ')}`;
        } catch {
            if (!request.signal.aborted) {
                find('[data-weather-temperature]').textContent = '--';
                find('[data-weather-condition]').textContent = 'Weather unavailable';
                find('[data-weather-time]').textContent = '';
            }
        }
    }

    find('[data-task-search]').addEventListener('input', renderTasks);
    find('[data-task-type]').addEventListener('change', renderTasks);
    find('[data-refresh]').addEventListener('click', refresh);
    find('[data-weather-refresh]').addEventListener('click', weather);
    find('[data-weather-city]').addEventListener('change', weather);
    const dialog = find('[data-task-dialog]');
    find('[data-task-rows]').addEventListener('click', event => {
        const button = event.target.closest('[data-task-index]');
        if (!button) {
            return;
        }
        const task = snapshot.tasks[Number(button.dataset.taskIndex)];
        const detail = node('dl');
        [['Assigned', task.assignedAt], ['Task', task.detail], ['Job type', task.jobType], ['Status', task.status], ['Priority', task.priority || '--']].forEach(([label, value]) => {
            detail.append(node('dt', label), node('dd', value));
        });
        find('[data-task-detail]').replaceChildren(detail);
        const link = find('[data-task-link]');
        link.hidden = !task.url;
        if (task.url) {
            link.href = task.url;
        } else {
            link.removeAttribute('href');
        }
        dialog.showModal();
    });
    root.querySelectorAll('[data-dialog-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
    document.addEventListener('click', event => {
        root.querySelectorAll('.a-nav details[open]').forEach(menu => {
            if (!menu.contains(event.target)) {
                menu.open = false;
            }
        });
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            if (dialog.open) {
                event.preventDefault();
                dialog.close();
            }
            root.querySelectorAll('.a-nav details[open]').forEach(menu => { menu.open = false; });
        }
    });
    window.setInterval(() => {
        if (find('[data-auto-refresh]').checked && !document.hidden && !dialog.open) {
            refresh();
        }
    }, 60000);
    renderDashboard();
    weather();
})();
(() => {
    'use strict';

    const root = document.querySelector('.f-review');
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
    icons();
    find('[data-password-toggle]')?.addEventListener('click', event => {
        const input = find('#f-password');
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        event.currentTarget.title = show ? 'Hide password' : 'Show password';
        event.currentTarget.setAttribute('aria-label', event.currentTarget.title);
        event.currentTarget.innerHTML = show ? '<i data-lucide="eye-off"></i>' : '<i data-lucide="eye"></i>';
        icons();
    });
    root.querySelectorAll('.f-environments input').forEach(input => {
        input.addEventListener('change', () => {
            find('[data-production]').hidden = find('.f-environments input:checked').value !== 'EBSPROD';
        });
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
    let activeView = 'queue';
    let refreshing = false;
    let jobsChart;
    let inventoryChart;
    let weatherRequest;
    const dialog = find('[data-task-dialog]');
    const palette = ['#3158e6', '#a8bf3a', '#df866e', '#388d88', '#b777a1', '#6c89a6', '#ccaa47', '#848c80'];
    const number = value => new Intl.NumberFormat('en').format(value);
    const time = value => new Date(value).toLocaleTimeString([], {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const isHigh = task => /high|urgent|critical/i.test(task.priority);
    const jobIcons = {
        Pick: 'scan-line', Pack: 'package-check', Unload: 'truck',
        Putaway: 'warehouse', Allocation: 'list-checks', Ship: 'send'
    };

    function showView(view, focus = false) {
        activeView = view;
        root.querySelectorAll('[data-view]').forEach(button => {
            const selected = button.dataset.view === view;
            button.setAttribute('aria-selected', String(selected));
            button.tabIndex = selected ? 0 : -1;
            if (selected && focus) {
                button.focus();
            }
        });
        root.querySelectorAll('[data-panel]').forEach(panel => {
            panel.hidden = panel.dataset.panel !== view;
        });
        find('[data-list-count]').textContent = view === 'assigned'
            ? `${snapshot.allocatedTasks.length} assigned`
            : `${matchingTasks().length} of ${snapshot.tasks.length} jobs`;
    }

    function matchingTasks() {
        const query = find('[data-task-search]').value.toLowerCase();
        const type = find('[data-task-type]').value;
        const high = find('[data-high-only]').checked;
        return snapshot.tasks.map((task, index) => ({ task, index })).filter(({ task }) => {
            return (!type || task.jobType === type)
                && (!high || isHigh(task))
                && `${task.detail} ${task.status} ${task.priority} ${task.jobType}`.toLowerCase().includes(query);
        });
    }

    function renderTasks() {
        const tasks = matchingTasks();
        const list = find('[data-tasks]');
        list.replaceChildren(...tasks.map(({ task, index }) => {
            const row = make('article', undefined, 'f-job');
            row.classList.toggle('is-high', isHigh(task));
            const symbol = make('span', undefined, 'f-job-symbol');
            const icon = make('i');
            icon.dataset.lucide = jobIcons[task.jobType] || 'clipboard-list';
            icon.setAttribute('aria-hidden', 'true');
            symbol.append(icon);
            const content = make('div');
            const meta = make('div', undefined, 'f-job-meta');
            meta.append(make('strong', task.jobType), make('span', task.status || '--'), make('span', task.priority || '--'));
            const title = make('button', task.detail, 'f-job-title');
            title.type = 'button';
            title.dataset.taskIndex = index;
            content.append(meta, title, make('time', `Assigned ${task.assignedAt}`));
            const actions = make('div', undefined, 'f-job-actions');
            const details = make('button', undefined, 'f-icon');
            details.type = 'button';
            details.dataset.taskIndex = index;
            details.title = 'Task details';
            details.setAttribute('aria-label', `Details: ${task.detail}`);
            details.innerHTML = '<i data-lucide="panel-right-open" aria-hidden="true"></i>';
            actions.append(details);
            if (task.url) {
                const link = make('a');
                link.href = task.url;
                link.target = '_blank';
                link.rel = 'noopener';
                link.title = 'Open WMS task';
                link.setAttribute('aria-label', `Open WMS task: ${task.detail}`);
                link.innerHTML = '<i data-lucide="arrow-up-right" aria-hidden="true"></i>';
                actions.append(link);
            }
            row.append(symbol, content, actions);
            return row;
        }));
        if (!tasks.length) {
            list.append(make('p', snapshot.tasksAvailable ? 'No matching pending jobs.' : 'Pending jobs are unavailable.', 'f-empty'));
        }
        if (activeView === 'queue') {
            find('[data-list-count]').textContent = `${tasks.length} of ${snapshot.tasks.length} jobs`;
        }
        icons();
    }

    function renderDashboard() {
        find('[data-pending-count]').textContent = snapshot.tasksAvailable ? number(snapshot.tasks.length) : '--';
        find('[data-tab-pending]').textContent = snapshot.tasksAvailable ? number(snapshot.tasks.length) : '--';
        find('[data-high-count]').textContent = snapshot.tasksAvailable ? number(snapshot.tasks.filter(isHigh).length) : '--';
        root.querySelectorAll('[data-assigned-count]').forEach(element => {
            element.textContent = snapshot.errors.some(error => error.area === 'Allocated jobs') ? '--' : number(snapshot.allocatedTasks.length);
        });
        find('[data-inventory-count]').textContent = snapshot.inventory ? number(snapshot.inventory.totalRecords) : '--';
        find('[data-updated]').textContent = `Snapshot ${time(snapshot.retrievedAt)}`;
        find('[data-errors]').replaceChildren(...snapshot.errors.map(error => make('p', error.message, 'f-error')));
        const type = find('[data-task-type]');
        const selected = type.value;
        type.replaceChildren(new Option('All job types', ''), ...snapshot.pendingJobs.map(job => new Option(job.jobType, job.jobType)));
        type.value = snapshot.pendingJobs.some(job => job.jobType === selected) ? selected : '';
        renderTasks();
        const allocated = find('[data-allocated]');
        allocated.replaceChildren(...snapshot.allocatedTasks.map(task => {
            const row = make('article', undefined, 'f-allocation');
            const icon = make('i');
            icon.dataset.lucide = 'clipboard-check';
            icon.setAttribute('aria-hidden', 'true');
            const content = make('div');
            content.append(make('time', task.assignDate), make('p', task.message));
            row.append(icon, content);
            return row;
        }));
        if (!snapshot.allocatedTasks.length) {
            allocated.append(make('p', snapshot.errors.some(error => error.area === 'Allocated jobs') ? 'Allocated jobs are unavailable.' : 'No allocated jobs.', 'f-empty'));
        }
        const news = find('[data-news]');
        news.replaceChildren(...snapshot.announcements.map(announcement => {
            const article = make('article');
            if (announcement.publishedAt) {
                article.append(make('small', new Date(announcement.publishedAt).toLocaleDateString()));
            }
            article.append(make('h3', announcement.title), make('p', announcement.detail));
            return article;
        }));
        if (!snapshot.announcements.length) {
            news.append(make('p', 'No announcements.', 'f-empty'));
        }
        showView(activeView);
        renderCharts();
        icons();
    }

    function renderCharts() {
        const jobs = snapshot.pendingJobs;
        const inventory = snapshot.inventory;
        const slices = inventory?.slices || [];
        const total = inventory?.totalRecords || 0;
        find('[data-job-values]').replaceChildren(...jobs.map(job => make('span', `${job.jobType}: ${job.count}`)));
        const legend = find('[data-inventory-legend]');
        legend.replaceChildren(...slices.map((slice, index) => {
            const row = make('div', undefined, 'f-legend');
            const swatch = make('span', undefined, 'f-swatch');
            swatch.style.backgroundColor = palette[index % palette.length];
            row.title = `${number(slice.records)} records`;
            row.append(swatch, make('span', slice.subinventory), make('strong', `${total ? (slice.records / total * 100).toFixed(1) : '0.0'}%`));
            return row;
        }));
        if (!slices.length) {
            legend.append(make('p', inventory ? 'No on-hand records.' : 'Inventory is unavailable.', 'f-empty'));
        }
        find('[data-inventory-time]').textContent = inventory ? `/ ${time(inventory.retrievedAt)}` : '';
        if (!window.Chart) {
            return;
        }
        jobsChart?.destroy();
        inventoryChart?.destroy();
        jobsChart = new Chart(find('[data-jobs-chart]'), {
            type: 'bar',
            data: {
                labels: jobs.map(job => job.jobType),
                datasets: [{
                    data: jobs.map(job => job.count),
                    backgroundColor: jobs.map((job, index) => palette[index % palette.length]),
                    maxBarThickness: 24,
                    borderRadius: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#e4eae5' } },
                    x: { grid: { display: false }, ticks: { font: { size: 9 } } }
                },
                onClick: (event, elements) => {
                    if (elements.length) {
                        find('[data-task-type]').value = jobs[elements[0].index].jobType;
                        find('[data-high-only]').checked = false;
                        showView('queue');
                        renderTasks();
                    }
                }
            }
        });
        inventoryChart = new Chart(find('[data-inventory-chart]'), {
            type: 'pie',
            data: {
                labels: slices.map(slice => slice.subinventory),
                datasets: [{
                    data: slices.map(slice => slice.records),
                    backgroundColor: slices.map((slice, index) => palette[index % palette.length]),
                    borderWidth: 3,
                    borderColor: '#f7faf8'
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

    async function refresh() {
        if (refreshing) {
            return;
        }
        refreshing = true;
        find('[data-refresh]').disabled = true;
        try {
            const response = await fetch('/ui-review/main/design-f/snapshot', {
                headers: { Accept: 'application/json' },
                cache: 'no-store',
                signal: AbortSignal.timeout(45000)
            });
            if (response.status === 401) {
                location.assign('/ui-review/login/design-f');
                return;
            }
            if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
                throw new Error('Refresh failed');
            }
            snapshot = await response.json();
            renderDashboard();
        } catch {
            find('[data-updated]').textContent = 'Refresh failed. Showing previous snapshot.';
        } finally {
            refreshing = false;
            find('[data-refresh]').disabled = false;
        }
    }

    async function weather() {
        weatherRequest?.abort();
        const request = new AbortController();
        weatherRequest = request;
        const cities = { hk: [22.3193, 114.1694], sg: [1.3521, 103.8198], tk: [35.6762, 139.6503] };
        const [latitude, longitude] = cities[find('[data-weather-city]').value];
        find('[data-weather-temperature]').textContent = '--';
        find('[data-weather-condition]').textContent = 'Updating weather';
        find('[data-weather-time]').textContent = '';
        try {
            const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`, {
                signal: AbortSignal.any([request.signal, AbortSignal.timeout(12000)])
            });
            if (!response.ok) {
                throw new Error('Weather unavailable');
            }
            const { current } = await response.json();
            if (!Number.isFinite(current?.temperature_2m) || !Number.isFinite(current?.weather_code)) {
                throw new Error('Invalid weather');
            }
            find('[data-weather-temperature]').textContent = Math.round(current.temperature_2m);
            const code = current.weather_code;
            find('[data-weather-condition]').textContent = code === 0 ? 'Clear' : code < 4 ? 'Cloudy' : code < 50 ? 'Fog' : code < 70 ? 'Rain' : code < 80 ? 'Snow' : code < 95 ? 'Showers' : 'Thunderstorm';
            find('[data-weather-time]').textContent = `Open-Meteo / ${current.time.replace('T', ' ')}`;
        } catch {
            if (!request.signal.aborted) {
                find('[data-weather-condition]').textContent = 'Weather unavailable';
            }
        }
    }

    find('[data-task-search]').addEventListener('input', renderTasks);
    find('[data-task-type]').addEventListener('change', renderTasks);
    find('[data-high-only]').addEventListener('change', renderTasks);
    root.querySelectorAll('[data-view]').forEach(button => {
        button.addEventListener('click', () => showView(button.dataset.view));
        button.addEventListener('keydown', event => {
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                const view = event.key === 'Home' ? 'queue'
                    : event.key === 'End' ? 'assigned'
                    : button.dataset.view === 'queue' ? 'assigned' : 'queue';
                showView(view, true);
            }
        });
    });
    find('[data-tasks]').addEventListener('click', event => {
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
    find('[data-close-task]').addEventListener('click', () => dialog.close());
    find('[data-refresh]').addEventListener('click', refresh);
    find('[data-weather-refresh]').addEventListener('click', weather);
    find('[data-weather-city]').addEventListener('change', weather);
    document.addEventListener('click', event => {
        root.querySelectorAll('.f-navigation details[open]').forEach(menu => {
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
            root.querySelectorAll('.f-navigation details[open]').forEach(menu => {
                menu.open = false;
            });
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
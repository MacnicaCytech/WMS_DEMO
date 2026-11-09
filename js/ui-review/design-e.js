(() => {
    'use strict';

    const root = document.querySelector('.e-review');
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
        const input = find('#e-password');
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
    let mode = 'workstream';
    let refreshing = false;
    let jobsChart;
    let inventoryChart;
    let weatherRequest;
    const dialog = find('[data-task-dialog]');
    const command = find('[data-command-dialog]');
    const palette = ['#9a4c67', '#498d9c', '#d2a44c', '#648960', '#7b80b5', '#cc8168', '#838c98', '#c17d9f'];
    const number = value => new Intl.NumberFormat('en').format(value);
    const time = value => new Date(value).toLocaleTimeString([], {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const isHigh = task => /high|urgent|critical/i.test(task.priority);

    function taskRow(task, index) {
        const row = make('article', undefined, 'e-task');
        row.classList.toggle('is-high', isHigh(task));
        const content = make('div');
        const meta = make('div', undefined, 'e-task-meta');
        meta.append(make('strong', task.jobType), make('span', task.status || '--'), make('span', task.priority || '--'));
        const title = make('button', task.detail, 'e-task-title');
        title.type = 'button';
        title.dataset.taskIndex = index;
        content.append(meta, title, make('time', `Assigned ${task.assignedAt}`));
        const actions = make('div', undefined, 'e-task-actions');
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
        const details = make('button', undefined, 'e-icon');
        details.type = 'button';
        details.dataset.taskIndex = index;
        details.title = 'Task details';
        details.setAttribute('aria-label', `Details: ${task.detail}`);
        details.innerHTML = '<i data-lucide="ellipsis" aria-hidden="true"></i>';
        actions.append(details);
        row.append(make('div', undefined, 'e-task-marker'), content, actions);
        return row;
    }

    function renderTasks() {
        const query = find('[data-task-search]').value.toLowerCase();
        const type = find('[data-task-type]').value;
        const tasks = snapshot.tasks.map((task, index) => ({ task, index })).filter(({ task }) => {
            return (!type || task.jobType === type)
                && `${task.detail} ${task.status} ${task.priority} ${task.jobType}`.toLowerCase().includes(query);
        });
        const list = find('[data-tasks]');
        list.replaceChildren();
        if (mode === 'workstream') {
            const types = [...new Set(tasks.map(item => item.task.jobType))];
            types.forEach(label => {
                const group = tasks.filter(item => item.task.jobType === label);
                const heading = make('h3', label, 'e-group-heading');
                heading.append(make('span', String(group.length)));
                list.append(heading, ...group.map(({ task, index }) => taskRow(task, index)));
            });
        } else {
            list.append(...tasks.map(({ task, index }) => taskRow(task, index)));
        }
        if (!tasks.length) {
            list.append(make('p', snapshot.tasksAvailable ? 'No matching pending tasks.' : 'Pending tasks are unavailable.', 'e-empty'));
        }
        find('[data-task-count]').textContent = `${tasks.length} of ${snapshot.tasks.length}`;
        root.querySelectorAll('[data-mode]').forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
        });
        icons();
    }

    function renderDashboard() {
        find('[data-pending-count]').textContent = snapshot.tasksAvailable ? number(snapshot.tasks.length) : '--';
        find('[data-high-count]').textContent = snapshot.tasksAvailable ? number(snapshot.tasks.filter(isHigh).length) : '--';
        root.querySelectorAll('[data-assigned-count]').forEach(element => {
            element.textContent = snapshot.errors.some(error => error.area === 'Allocated jobs') ? '--' : number(snapshot.allocatedTasks.length);
        });
        find('[data-inventory-count]').textContent = snapshot.inventory ? number(snapshot.inventory.totalRecords) : '--';
        find('[data-updated]').textContent = `Updated ${time(snapshot.retrievedAt)}`;
        find('[data-errors]').replaceChildren(...snapshot.errors.map(error => make('p', error.message, 'e-error')));
        const type = find('[data-task-type]');
        const selected = type.value;
        type.replaceChildren(new Option('All job types', ''), ...snapshot.pendingJobs.map(job => new Option(job.jobType, job.jobType)));
        type.value = snapshot.pendingJobs.some(job => job.jobType === selected) ? selected : '';
        renderTasks();
        const allocated = find('[data-allocated]');
        allocated.replaceChildren(...snapshot.allocatedTasks.map(task => {
            const row = make('div', undefined, 'e-allocation');
            row.append(make('time', task.assignDate), make('span', task.message));
            return row;
        }));
        if (!snapshot.allocatedTasks.length) {
            allocated.append(make('p', snapshot.errors.some(error => error.area === 'Allocated jobs') ? 'Allocated jobs are unavailable.' : 'No allocated jobs.', 'e-empty'));
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
            news.append(make('p', 'No announcements.', 'e-empty'));
        }
        renderCharts();
    }

    function renderCharts() {
        const jobs = snapshot.pendingJobs;
        const inventory = snapshot.inventory;
        const slices = inventory?.slices || [];
        const total = inventory?.totalRecords || 0;
        find('[data-job-values]').replaceChildren(...jobs.map(job => make('span', `${job.jobType}: ${job.count}`)));
        const legend = find('[data-inventory-legend]');
        legend.replaceChildren(...slices.map((slice, index) => {
            const row = make('div', undefined, 'e-legend');
            const swatch = make('span', undefined, 'e-swatch');
            swatch.style.backgroundColor = palette[index % palette.length];
            row.title = `${number(slice.records)} records`;
            row.append(swatch, make('span', slice.subinventory), make('strong', `${total ? (slice.records / total * 100).toFixed(1) : '0.0'}%`));
            return row;
        }));
        if (!slices.length) {
            legend.append(make('p', inventory ? 'No on-hand records.' : 'Inventory is unavailable.', 'e-empty'));
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
                    backgroundColor: '#9a4c67',
                    maxBarThickness: 26,
                    borderRadius: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#e5e5eb' } },
                    x: { grid: { display: false }, ticks: { font: { size: 10 } } }
                },
                onClick: (event, elements) => {
                    if (elements.length) {
                        find('[data-task-type]').value = jobs[elements[0].index].jobType;
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
                    borderColor: '#f7f8fa'
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

    function renderCommands() {
        const query = find('[data-command-search]').value.toLowerCase();
        const items = [];
        const collect = (menu, parent = '') => {
            menu.forEach(item => {
                const label = parent ? `${parent} / ${item.label}` : item.label;
                if (item.url) {
                    items.push({ label, url: item.url });
                }
                collect(item.children, label);
            });
        };
        collect(snapshot.menu);
        const matches = items.filter(item => item.label.toLowerCase().includes(query));
        const results = find('[data-command-results]');
        results.replaceChildren(...matches.map(item => {
            const link = make('a', item.label);
            link.href = item.url;
            link.target = '_blank';
            link.rel = 'noopener';
            link.insertAdjacentHTML('beforeend', '<i data-lucide="arrow-up-right" aria-hidden="true"></i>');
            return link;
        }));
        if (!matches.length) {
            results.append(make('p', 'No matching work areas.', 'e-empty'));
        }
        icons();
    }

    function openCommands() {
        find('[data-command-search]').value = '';
        renderCommands();
        command.showModal();
        find('[data-command-search]').focus();
    }

    async function refresh() {
        if (refreshing) {
            return;
        }
        refreshing = true;
        find('[data-refresh]').disabled = true;
        try {
            const response = await fetch('/ui-review/main/design-e/snapshot', {
                headers: { Accept: 'application/json' },
                cache: 'no-store',
                signal: AbortSignal.timeout(45000)
            });
            if (response.status === 401) {
                location.assign('/ui-review/login/design-e');
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
    root.querySelectorAll('[data-mode]').forEach(button => {
        button.addEventListener('click', () => {
            mode = button.dataset.mode;
            renderTasks();
        });
    });
    find('[data-tasks]').addEventListener('click', event => {
        const trigger = event.target.closest('[data-task-index]');
        if (!trigger) {
            return;
        }
        const task = snapshot.tasks[Number(trigger.dataset.taskIndex)];
        const fields = make('dl');
        [['Task', task.detail], ['Assigned', task.assignedAt], ['Type', task.jobType], ['Status', task.status || '--'], ['Priority', task.priority || '--']].forEach(([label, value]) => {
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
    find('[data-open-launcher]').addEventListener('click', openCommands);
    find('[data-close-launcher]').addEventListener('click', () => command.close());
    find('[data-command-search]').addEventListener('input', renderCommands);
    command.addEventListener('keydown', event => {
        const links = [...find('[data-command-results]').querySelectorAll('a')];
        const index = links.indexOf(document.activeElement);
        if (event.key === 'ArrowDown' && links.length) {
            event.preventDefault();
            links[Math.min(index + 1, links.length - 1)].focus();
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (index > 0) {
                links[index - 1].focus();
            } else {
                find('[data-command-search]').focus();
            }
        } else if (event.key === 'Enter' && document.activeElement === find('[data-command-search]') && links.length) {
            event.preventDefault();
            links[0].focus();
        }
    });
    find('[data-navigation-toggle]').addEventListener('click', event => {
        const expanded = find('.e-sidebar').classList.toggle('is-open');
        event.currentTarget.setAttribute('aria-expanded', String(expanded));
    });
    find('[data-refresh]').addEventListener('click', refresh);
    find('[data-weather-refresh]').addEventListener('click', weather);
    find('[data-weather-city]').addEventListener('change', weather);
    document.addEventListener('keydown', event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !dialog.open) {
            event.preventDefault();
            if (!command.open) {
                openCommands();
            }
        }
        if (event.key === 'Escape') {
            if (dialog.open) {
                event.preventDefault();
                dialog.close();
            }
            if (command.open) {
                event.preventDefault();
                command.close();
            }
            find('.e-sidebar').classList.remove('is-open');
            find('[data-navigation-toggle]').setAttribute('aria-expanded', 'false');
        }
    });
    window.setInterval(() => {
        if (find('[data-auto-refresh]').checked && !document.hidden && !dialog.open && !command.open) {
            refresh();
        }
    }, 60000);
    renderDashboard();
    weather();
})();
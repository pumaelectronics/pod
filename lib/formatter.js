exports.format = formatAppInfo;

function formatAppInfo(app)
{
    app.uptime = null;

    const processes = (app.instances && app.instances.length) || 0;
    const instances = processes > 1 ? (' (' + processes + ')') : '';
    const name = app.name + instances;
    const port = app.port;
    const status = app.broken ?
        'BROKEN' :
        app.instances ?
            app.instances[0].pm2_env.status === 'errored' ?
                'ERROR' :
                'ON' :
            'OFF';

    let restarts;
    let uptime;
    let memory;
    let cpu;

    if(processes)
    {
        app.uptime = Date.now() - app.instances[0].pm2_env.pm_uptime;

        restarts = countTotalRestarts(app.instances);
        uptime = formatTime(app.uptime);
        memory = formatMemory(app.instances);
        cpu = formatCPU(app.instances);
    }

    return {
        name: name,
        port: port,
        broken: app.broken,
        status: status,
        restarts: restarts,
        uptime: uptime || null,
        memory: memory || null,
        cpu: cpu || null,
        instanceCount: instances,
        raw: app
    };
}

function countTotalRestarts(instances)
{
    let restarts = 0;

    instances.forEach(function(ins)
    {
        restarts += ins.pm2_env.restart_time;
    });

    return restarts;
}

function formatTime(uptime)
{
    let sec_num = Math.floor(uptime / 1000);
    let days = Math.floor(sec_num / 86400);
    let hours = Math.floor(sec_num / 3600) % 24;
    let minutes = Math.floor(sec_num / 60) % 60;
    let seconds = sec_num % 60;
    let ret = [];

    if(hours < 10)
    {
        hours = '0' + hours;
    }

    if(minutes < 10)
    {
        minutes = '0' + minutes;
    }

    if(seconds < 10)
    {
        seconds = '0' + seconds;
    }

    ret.push(hours, minutes, seconds);

    return (days ? days + 'd ' : '') + ret.join(':');
}

function formatMemory(instances)
{
    let mem = 0;
    let mb = 1048576;

    instances.forEach(function(ins)
    {
        mem += ins.monit.memory;
    });

    if(mem > mb)
    {
        return (mem / mb).toFixed(2) + ' mb';
    }
    else
    {
        return (mem / 1024).toFixed(2) + ' kb';
    }
}

function formatCPU(instances)
{
    let total = 0;
    instances.forEach(function(ins)
    {
        total += ins.monit.cpu;
    });

    return total.toFixed(2) + '%';
}

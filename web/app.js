const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const spawn = require('child_process').spawn;
const express = require('express');
const pod = require('../lib/api');
const ghURL = require('parse-github-url');
const app = express();
const statics = require('serve-static');
const basicAuth = require('basic-auth');

// late def, wait until pod is ready
var conf = pod.reloadConfig();

// middlewares
var reloadConf = function(req, res, next)
{
    conf = pod.reloadConfig();
    next();
};

var auth = function(req, res, next)
{
    var user = basicAuth(req);
    const username = (conf.web.username || 'admin');
    const password = (conf.web.password || 'admin');
    console.log(JSON.stringify(user));
    if(!user || user.name !== username || user.pass !== password)
    {
        res.setHeader('WWW-Authenticate', 'Basic realm=Authorization Required');
        return res.sendStatus(401);
    }
    next();
};

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
//app.use(favicon())
app.use(reloadConf);
app.use(bodyParser.json());
app.use(statics(path.join(__dirname, 'static')));


app.get('/', auth, function(req, res)
{
    pod.listApps(function(err, list)
    {
        if(err)
        {
            return res.end(err);
        }

        return res.render('index', {
            apps: list
        });
    });
});

app.get('/json', auth, function(req, res)
{
    pod.listApps(function(err, list)
    {
        if(err)
        {
            return res.end(err);
        }

        res.json(list);
        res.end();
    });
});

app.post('/hooks/:appid', function(req, res)
{
    var appid = req.params.appid,
        payload = JSON.stringify(req.body),
        app = conf.apps[appid];

    try
    {
        payload = JSON.parse(payload);
    } catch(e)
    {
        return res.end(e.toString());
    }

    if(req.get('X-GitHub-Event') === 'ping')
    {
        if(ghURL(payload.repository.git_url).repopath === ghURL(app.remote).repopath)
        {
            return res.status(200).end();
        } else
        {
            return res.status(500).end();
        }
    }

    if(app && verify(req, app, payload))
    {
        executeHook(appid, app, payload, function()
        {
            res.end();
        });
    } else
    {
        res.end();
    }
});

// listen when API is ready
pod.once('ready', function()
{
    // load config first
    conf = pod.getConfig();
    // conditional open up jsonp based on config
    if(conf.web.jsonp === true)
    {
        app.get('/jsonp', function(req, res)
        {
            pod.listApps(function(err, list)
            {
                if(err)
                {
                    return res.end(err);
                }

                res.jsonp(list);
            });
        });
    }

    app.listen(process.env.PORT || 19999);
});

// Helpers
function verify(req, app, payload)
{
    // not even a remote app
    if(!app.remote)
    {
        return;
    }
    // check repo match

    var repo = payload.repository;
    var repoURL;

    if(repo.links && /bitbucket\.org/.test(repo.links.html.href))
    {
        console.log('\nreceived webhook request from: ' + repo.links.html.href);

        repoURL = repo.links.html.href;
    } else
    {
        console.log('\nreceived webhook request from: ' + repo.url);

        repoURL = repo.url;
    }

    if(!repoURL)
    {
        return;
    }

    if(ghURL(repoURL).repopath !== ghURL(app.remote).repopath)
    {
        console.log('aborted.');
        return;
    }

    var commit;

    // support bitbucket webhooks payload structure
    if(/bitbucket\.org/.test(repoURL))
    {
        commit = payload.push.changes[0].new;

        commit.message = commit.target.message;
    } else
    {
        // use gitlab's payload structure if detected
        commit = payload.head_commit ? payload.head_commit :
            payload.commits[payload.commits.length - 1];
    }

    if(!commit)
    {
        return;
    }

    // skip it with [pod skip] message
    console.log('commit message: ' + commit.message);
    if(/\[pod skip\]/.test(commit.message))
    {
        console.log('aborted.');
        return;
    }

    // check branch match
    var ref = commit.name ? commit.name : payload.ref;

    if(!ref)
    {
        return;
    }

    var branch = ref.replace('refs/heads/', '');
    var expected = app.branch || 'master';
    console.log('expected branch: ' + expected + ', got branch: ' + branch);

    if(branch !== expected)
    {
        console.log('aborted.');
        return;
    }

    return true;
}

function executeHook(appid, app, payload, cb)
{
    // set a response timeout to avoid GitHub webhooks
    // hanging up due to long build times
    var responded = false;

    function respond(err)
    {
        if(!responded)
        {
            responded = true;
            cb(err);
        }
    }

    setTimeout(respond, 3000);

    // add apps environment configuration to current environment
    // run npm install / .podhook with the apps env configuration
    var appEnv = process.env;
    var globalConfig = pod.getConfig();
    appEnv.NODE_ENV = app.node_env || appEnv.NODE_ENV || 'development';

    for(let i in globalConfig.env)
    {
        if(globalConfig.env.hasOwnProperty(i))
        {
            appEnv[i] = globalConfig.env[i];
        }
    }

    for(let i in app.env)
    {
        if(app.env.hasOwnProperty(i))
        {
            appEnv[i] = app.env[i];
        }
    }

    fs.readFile(path.resolve(__dirname, '../hooks/post-receive'), 'utf-8', function(err, template)
    {
        if(err)
        {
            return respond(err);
        }

        var hookPath = conf.root + '/temphook.sh',
            hook = template
                .replace(/\{\{pod_dir\}\}/g, conf.root)
                .replace(/\{\{app\}\}/g, appid);

        if(app.branch)
        {
            hook = hook.replace('origin/master', 'origin/' + app.branch);
        }

        fs.writeFile(hookPath, hook, function(err)
        {
            if(err)
            {
                return respond(err);
            }

            fs.chmod(hookPath, '0777', function(err)
            {
                if(err)
                {
                    return respond(err);
                }

                console.log('excuting github webhook for ' + appid + '...');
                var child = spawn('bash', [hookPath], {env: appEnv});
                child.stdout.pipe(process.stdout);
                child.stderr.pipe(process.stderr);
                child.on('exit', function(code)
                {
                    fs.unlink(hookPath, respond);
                });
            });
        });
    });
}

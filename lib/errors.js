var ERRORS = module.exports = {
    EXISTS: 'an app with the name ' + '{{appname}}'.cyan + ' already exists',
    NOT_FOUND: 'app ' + '{{appname}}'.cyan + ' does not exist',
    NO_SCRIPT: 'cannot locate main script for ' + '{{appname}}'.cyan + ' ({{script}})'.grey,
    NOT_RUNNING: '{{appname}}'.cyan + ' is not running',
    WEB: 'You cannot remove the web interface',
    RUNNING: '{{appname}}'.cyan + ' is already running'
};

for(var errKey in ERRORS)
{
    if(ERRORS.hasOwnProperty(errKey))
    {
        ERRORS[errKey] = {
            msg: ERRORS[errKey],
            code: errKey
        };
    }
}

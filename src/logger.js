const config = require('./config.js');

let fetchImpl = global.fetch;
if (!fetchImpl) {
  try {
    fetchImpl = require('node-fetch');
  } catch (e) {
    console.error('Fetch is not available. Run: npm install node-fetch@2');
  }
}

class Logger {
  httpLogger = (req, res, next) => {
    let send = res.send;
    res.send = (resBody) => {
      const logData = {
        authorized: !!req.headers.authorization,
        path: req.originalUrl,
        method: req.method,
        statusCode: res.statusCode,
        reqBody: JSON.stringify(req.body),
        resBody: JSON.stringify(resBody),
      };
      const level = this.statusToLogLevel(res.statusCode);
      this.log(level, 'http', logData);
      res.send = send;
      return res.send(resBody);
    };
    next();
    };

  logDbQuery({ sql, params, durationMs, rowCount, error }) {
    const level = error ? 'error' : 'info';

    const logData = {
      sql,
      params,
      durationMs,
      rowCount,
      success: !error,
      error: error
        ? {
            message: error.message,
            code: error.code,
          }
        : undefined,
    };

    this.log(level, 'sql', logData);
  }

  logFactoryRequest({ url, method, statusCode, reqBody, resBody, error }) {
    const level = error
      ? 'error'
      : this.statusToLogLevel(statusCode ?? 200);

    let host, path;
    try {
      const u = new URL(url);
      host = u.host;
      path = u.pathname + u.search;
    } catch {
      // If URL parsing fails, just leave host/path undefined
    }

    const logData = {
      url,
      host,
      path,
      method,
      statusCode,
      reqBody: reqBody !== undefined ? JSON.stringify(reqBody) : undefined,
      resBody: resBody !== undefined ? JSON.stringify(resBody) : undefined,
      success: !error,
      error: error
        ? {
            message: error.message,
            stack: error.stack,
          }
        : undefined,
    };

    this.log(level, 'factory', logData);
  }

  log(level, type, logData) {
    const labels = {
      component: config.logging.source,
      level: level,
      type: type
    };
    const values = [this.nowString(), this.sanitize(logData)];

    const event = { streams: [{ stream: labels, values: [values] }] };
    this.sendLogToGrafana(event);
  }

  statusToLogLevel(statusCode) {
    if (statusCode >= 500) return 'error';
    if (statusCode >= 400) return 'warn';
    return 'info';
  }

  nowString() {
    return (Math.floor(Date.now()) * 1000000).toString();
  }

  sanitize(logData) {
    if (!logData) return logData;
    logData = JSON.stringify(logData);
    return logData.replace(/"password"\s*:\s*"[^"]*"/g, '"password":"****"');
    //return logData.replace(/\\"password\\":\s*\\"[^"]*\\"/g, '\\"password\\": \\"*****\\"');
  }

sendLogToGrafana(event) {
    //console.log("Send log to grafana...");
    const body = JSON.stringify(event);
    //console.log(body);
    fetch(`${config.logging.url}`, {
      method: 'post',
      body: body,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.logging.userId}:${config.logging.apiKey}`,
      },
    }).then((res) => {
      if (!res.ok) {
        console.log('Failed to send log to Grafana');
        console.log(res);
      }
    });
  }
}

module.exports = new Logger();

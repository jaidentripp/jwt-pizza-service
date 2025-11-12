// logger.js
const config = require('./config.js');

// Use global fetch if available, otherwise fallback
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

  // Core log function
  log(level, type, logData) {
    const labels = {
      component: config.source,
      level: level,
      type: type
    };

    const values = [
      [(Date.now() * 1000000).toString(), JSON.stringify(logData)]
    ];

    const event = { streams: [{ stream: labels, values }] };
    this.sendLogToGrafana(event);
  }

  statusToLogLevel(statusCode) {
    if (statusCode >= 500) return 'error';
    if (statusCode >= 400) return 'warn';
    return 'info';
  }

  sanitize(data) {
    if (!data) return data;
    let text = JSON.stringify(data);
    return text.replace(/"password"\s*:\s*"[^"]*"/g, '"password":"****"');
  }

sendLogToGrafana(event) {
    console.log("Send log to grafana...");
    const body = JSON.stringify(event);
    console.log(body);
    fetch(`${config.logging.url}`, {
      method: 'post',
      body: body,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.logging.userId}:${config.logging.apiKey}`,
      },
    }).then((res) => {
        console.log("Loki response:", res.status, res.text());
      if (!res.ok) {
        res.json().then((errorData) => {
          console.log('Failed to send log to Grafana:', errorData);
        });
      }
    });
  }
}

module.exports = new Logger();

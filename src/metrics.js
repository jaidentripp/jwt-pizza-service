const os = require("os");
const fetch = require("node-fetch"); // or 'axios' if you prefer
const config = require("./config");

class Metrics {
  constructor() {
    this.httpRequests = {
      total: 0,
      success: 0,
      failure: 0,
      latencySum: 0,
      byMethod: {
        GET: 0,
        POST: 0,
        PUT: 0,
        DELETE: 0,
      },
    };

    this.purchases = {
      total: 0,
      success: 0,
      failure: 0,
      totalCost: 0,
      latencySum: 0,
    };

    this.activeUsers = new Map();

    this.authAttempts = {
        success: 0,
        failure: 0,
    };

    this.startPeriodicSend(10000); // send every 10 seconds
  }

  // Express middleware to track requests
  requestTracker = (req, res, next) => {
    const start = Date.now();
    const method = req.method.toUpperCase();

    res.on("finish", () => {
      const latency = Date.now() - start;
      this.httpRequests.total++;
      this.httpRequests.latencySum += latency;

      if (res.statusCode >= 200 && res.statusCode < 400) {
        this.httpRequests.success++;
      } else {
        this.httpRequests.failure++;
      }

      //track method requests
      if (this.httpRequests.byMethod[method] !== undefined) {
        this.httpRequests.byMethod[method]++;
      }

      //track active users
      if (req.user && req.user.id) {
        this.trackUserActivity(req.user.id);
      }

      //track auth - only track login endpoint
      if (req.path === "/api/auth" && req.method === "PUT") {
        if (res.statusCode >= 200 && res.statusCode < 400) {
            this.trackAuthAttempt(true); //successful login
        } else {
            this.trackAuthAttempt(false); //failed login
        }
      }

    });

    next();
  };

  // Track purchases
  pizzaPurchase(success, latency, price) {
    this.purchases.total++;
    this.purchases.latencySum += latency;
    if (success) {
      this.purchases.success++;
      this.purchases.totalCost += price;
    } else {
      this.purchases.failure++;
    }
  }

  //Active user
  trackUserActivity(userId) {
    this.activeUsers.set(userId, Date.now());
  }

  getActiveUsersCount() {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    for (const [userId, last] of this.activeUsers) {
        if (last < fiveMinutesAgo) {
            this.activeUsers.delete(userId);
        }
    }
    return this.activeUsers.size;
  }

  //track auth attempts
  trackAuthAttempt(success) {
    if (success) {
        this.authAttempts.success++;
    }
    else {
        this.authAttempts.failure++;
    }
  }

  // System metrics
  getSystemMetrics() {
    const cpuUsage = (os.loadavg()[0] / os.cpus().length) * 100;
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsage = (usedMemory / totalMemory) * 100;

    return {
      cpuUsage: Math.floor(cpuUsage),
      memoryUsage: Math.floor(memoryUsage),
    };
  }

  // Build OTLP Prometheus-like payload
  buildMetricsPayload() {
    const { cpuUsage, memoryUsage } = this.getSystemMetrics();

    const avgHttpLatency =
      this.httpRequests.total > 0
        ? Math.floor(this.httpRequests.latencySum / this.httpRequests.total)
        : 0;

    const avgPurchaseLatency =
      this.purchases.total > 0
        ? Math.floor(this.purchases.latencySum / this.purchases.total)
        : 0;

        const activeUsersCount = this.getActiveUsersCount();

    const metrics = [
      { name: "http_requests_total", value: this.httpRequests.total, type: "sum", unit: "1" },
      { name: "http_requests_success", value: this.httpRequests.success, type: "sum", unit: "1" },
      { name: "http_requests_failure", value: this.httpRequests.failure, type: "sum", unit: "1" },
      { name: "http_requests_avg_latency_ms", value: avgHttpLatency, type: "gauge", unit: "ms" },
      // Add per-method sums
      { name: "http_requests_get", value: this.httpRequests.byMethod.GET, type: "sum", unit: "1" },
      { name: "http_requests_post", value: this.httpRequests.byMethod.POST, type: "sum", unit: "1" },
      { name: "http_requests_put", value: this.httpRequests.byMethod.PUT, type: "sum", unit: "1" },
      { name: "http_requests_delete", value: this.httpRequests.byMethod.DELETE, type: "sum", unit: "1" },

      { name: "active_users", value: activeUsersCount, type: "gauge", unit: "1" },

      { name: "auth_success_total", value: this.authAttempts.success, type: "sum", unit: "1" },
      { name: "auth_failure_total", value: this.authAttempts.failure, type: "sum", unit: "1" },

      { name: "purchases_total", value: this.purchases.total, type: "sum", unit: "1" },
      { name: "purchases_success", value: this.purchases.success, type: "sum", unit: "1" },
      { name: "purchases_failure", value: this.purchases.failure, type: "sum", unit: "1" },
      { name: "purchases_total_cost", value: Math.floor(this.purchases.totalCost), type: "sum", unit: "$" },
      { name: "purchases_avg_latency_ms", value: avgPurchaseLatency, type: "gauge", unit: "ms" },

      { name: "system_cpu_usage_percent", value: cpuUsage, type: "gauge", unit: "%" },
      { name: "system_memory_usage_percent", value: memoryUsage, type: "gauge", unit: "%" },
    ];

    return metrics;
  }

  // Send metrics to Grafana OTLP endpoint
  startPeriodicSend(period) {
    setInterval(() => {
      const metricsPayload = this.buildMetricsPayload();

      metricsPayload.forEach((metric) => {
        const payload = {
          resourceMetrics: [
            {
              scopeMetrics: [
                {
                  metrics: [
                    {
                      name: metric.name,
                      unit: metric.unit,
                      [metric.type]: {
                        dataPoints: [
                          {
                            asInt: metric.value,
                            timeUnixNano: Date.now() * 1_000_000,
                          },
                        ],
                      },
                    },
                  ],
                },
              ],
            },
          ],
        };

        // Sum-specific properties
        if (metric.type === "sum") {
          payload.resourceMetrics[0].scopeMetrics[0].metrics[0][metric.type].aggregationTemporality =
            "AGGREGATION_TEMPORALITY_CUMULATIVE";
          payload.resourceMetrics[0].scopeMetrics[0].metrics[0][metric.type].isMonotonic = true;
        }

        fetch(config.metrics.url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.metrics.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        })
          .then((res) => {
            if (!res.ok) {
              res.text().then((text) => {
                console.error(`Failed to push metrics: ${text}`);
              });
            } else {
              console.log(`Pushed metric: ${metric.name} = ${metric.value}`);
            }
          })
          .catch((err) => {
            console.error("Error pushing metrics:", err.message);
          });
      });
    }, period);
  }
}

module.exports = new Metrics();
